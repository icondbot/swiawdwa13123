import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("WARNING: DATABASE_URL is not set — DB calls will fail at runtime");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://localhost/icondo",
  // Render (and most cloud Postgres providers) require SSL
  ssl: process.env.DATABASE_URL?.includes("render.com") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
