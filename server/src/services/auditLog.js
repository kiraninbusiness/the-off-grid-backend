import { pool } from '../db.js';

/*
  ADMIN AUDIT LOG

  Call this after any sensitive admin mutation — price changes,
  deletions, refunds, role changes, coupon creation, etc. Fire-and-
  forget: never let logging failure block the actual action. Pass
  req so we can capture IP/user-agent for accountability.
*/
export async function logAdminAction(req, { action, entity, entityId = null, oldValue = null, newValue = null }) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_email, action, entity, entity_id, old_value, new_value, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.user?.id || null,
        req.user?.email || null,
        action,
        entity,
        entityId ? String(entityId) : null,
        oldValue !== null ? JSON.stringify(oldValue) : null,
        newValue !== null ? JSON.stringify(newValue) : null,
        req.ip,
        req.headers['user-agent'] || null,
      ]
    );
  } catch (e) {
    console.error('logAdminAction failed:', e.message);
  }
}
