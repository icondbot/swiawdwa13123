import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureTablesExist(): Promise<void> {
  logger.info({ DATABASE_URL: process.env.DATABASE_URL ? "set" : "MISSING", NODE_ENV: process.env.NODE_ENV }, "Connecting to database...");
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id          SERIAL PRIMARY KEY,
        date        TEXT NOT NULL,
        time_slot   TEXT NOT NULL DEFAULT '16:00',
        status      TEXT NOT NULL DEFAULT 'pending',
        notes       TEXT,
        is_auto_booked BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        id                   SERIAL PRIMARY KEY,
        username             TEXT,
        password_encrypted   TEXT,
        auto_book_enabled    BOOLEAN NOT NULL DEFAULT false,
        court_name           TEXT NOT NULL DEFAULT 'Tennis Court',
        booking_time_slot    TEXT NOT NULL DEFAULT '16:00',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Database tables ready");
  } finally {
    client.release();
  }
}
