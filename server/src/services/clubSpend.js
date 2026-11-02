import jwt from 'jsonwebtoken';

// Lifetime spend on delivered orders: the number that decides a member's tier.
export async function deliveredSpend(queryable, userId) {
  if (!userId) return 0;
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(total),0)::int AS total FROM orders WHERE user_id=$1 AND status='delivered'`,
    [userId]
  );
  return rows[0].total;
}

// Signed-in user id if a valid token was sent, otherwise null. Never rejects the request.
export function optionalUserId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).id || null;
  } catch {
    return null;
  }
}
