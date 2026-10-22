import { pool } from '../db.js';

/*
  IN-APP NOTIFICATION CENTER

  Call this alongside (not instead of) the existing email sends —
  emails reach the customer even when they're not on the site, this
  populates the bell icon inside the account. Fire-and-forget: never
  let a notification failure block the actual business action.
*/
export async function createNotification(userId, { type, title, body = null, link = null }) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, title, body, link]
    );
  } catch (e) {
    console.error('createNotification failed:', e.message);
  }
}
