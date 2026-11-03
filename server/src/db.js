import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// The API process must never mutate the production schema at startup.
// Schema changes belong in separately reviewed, versioned migrations.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep connection behavior explicit; Render/Neon provide DATABASE_URL.
  connectionTimeoutMillis: 10000,
});

export async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  await pool.query('SELECT 1');
}
