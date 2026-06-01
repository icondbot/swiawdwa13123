/**
 * Standalone entry-point for the Render cron service.
 *
 * Scheduled a few minutes BEFORE midnight SGT so the container is already warm
 * and DB-connected. It then waits for the exact booking moment (00:00:00 SGT =
 * 16:00:00 UTC) and fires the booking burst at that instant — instead of paying
 * cold-start latency AFTER midnight (which made the old run start ~25s late and
 * miss contested slots).
 *
 * Required env vars: DATABASE_URL, ICONDO_TOKEN
 * No PORT required — this is not an HTTP server.
 */
import { logger } from "./lib/logger";
import { checkAndBookOpenSlots } from "./lib/scheduler";
import { ensureTablesExist } from "./lib/setup-db";

// 16:00 UTC == 00:00 SGT (UTC+8) — the instant booking windows open.
// Singapore has no DST and UTC has no DST, so this is fixed year-round.
const TARGET_UTC_HOUR = 16;

// Sleep until exactly 16:00:00.000 UTC so the burst fires the moment the window
// opens. Cold-start + DB connect already happened before this wait, not after.
async function waitUntilBookingMoment(): Promise<void> {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(TARGET_UTC_HOUR, 0, 0, 0);

  const ms = target.getTime() - now.getTime();

  // Cron fired late and we're already past midnight — book immediately.
  if (ms <= 0) {
    logger.warn({ nowIso: now.toISOString() }, "Already at/past booking moment — firing immediately");
    return;
  }
  // Safety valve: never wait absurdly long (e.g. a misconfigured schedule).
  if (ms > 10 * 60 * 1000) {
    logger.warn({ ms }, "Booking moment >10 min away — firing now instead of waiting");
    return;
  }

  logger.info({ waitMs: ms, targetIso: target.toISOString() }, "Warm and waiting for the exact booking moment…");
  await new Promise((r) => setTimeout(r, ms));
  logger.info("Booking moment reached — firing burst");
}

async function main() {
  logger.info("Cron: pre-midnight run started (warming up)");

  try {
    await ensureTablesExist();
  } catch (err) {
    logger.error({ err }, "DB setup failed — aborting cron run");
    process.exit(1);
  }

  // Block until the precise SGT-midnight boundary, then book.
  await waitUntilBookingMoment();

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
