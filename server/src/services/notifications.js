import { pool } from '../db.js';

/*
  In-app and Expo push notifications are best-effort: delivery failures must
  never block the order, payment, return, or stock operation that triggered them.
*/
export async function createNotification(userId, { type, title, body = null, link = null }) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, title, body, link]
    );
    void sendUserPush(userId, { title, body, link, type });
  } catch (e) {
    console.error('createNotification failed:', e.message);
  }
}

async function sendUserPush(userId, { title, body, link, type }) {
  try {
    const { rows } = await pool.query(
      'SELECT id, token FROM user_push_tokens WHERE user_id = $1',
      [userId]
    );
    if (!rows.length) return;

    const messages = rows.map(row => ({
      to: row.token,
      sound: 'default',
      title: String(title || 'THE OFF GRID').slice(0, 120),
      body: String(body || '').slice(0, 500),
      data: { link: link || null, type: type || 'general' },
      priority: 'high',
      channelId: 'drops'
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify(messages)
    });
    if (!response.ok) throw new Error(`Expo push service returned HTTP ${response.status}`);
    const result = await response.json();
    for (let i = 0; i < (result.data || []).length; i++) {
      const ticket = result.data[i];
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        await pool.query('DELETE FROM user_push_tokens WHERE id = $1', [rows[i].id]);
      } else if (ticket?.status === 'error') {
        console.warn('Expo push ticket error:', ticket.message || ticket.details?.error || 'unknown');
      }
    }
  } catch (e) {
    console.error('Expo push delivery failed:', e.message);
  }
}
