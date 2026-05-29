/**
 * Standalone entry-point for the Render cron service.
 *
 * Runs every night at midnight SGT (16:00 UTC), processes any queued bookings
 * whose 7-day booking window just opened, then exits.
 * Deployed as a separate Render cron service so it never gets hibernated —
 * unlike the web process which goes into hibernate mode on the free plan.
 *
 * Required env vars: DATABASE_URL, ICONDO_TOKEN
 * No PORT required — this is not an HTTP server.
 */
import { logger } from "./lib/logger";
import { checkAndBookOpenSlots } from "./lib/scheduler";
import { ensureTablesExist } from "./lib/setup-db";

async function main() {
  logger.info("Cron: midnight booking run started");

  try {
    await ensureTablesExist();
  } catch (err) {
    logger.error({ err }, "DB setup failed — aborting cron run");
    process.exit(1);
  }

  try {
    await checkAndBookOpenSlots();
    logger.info("Cron: booking run complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Cron: booking run failed");
    process.exit(1);
  }
}

main();
