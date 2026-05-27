/**
 * Standalone entry-point for the Render cron service.
 *
 * Runs once at Sunday midnight SGT, burst-books the tennis court, then exits.
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
    await checkAndBookOpenSlots(true);
    logger.info("Cron: booking run complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Cron: booking run failed");
    process.exit(1);
  }
}

main();
