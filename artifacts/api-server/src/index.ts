import app from "./app";
import { logger } from "./lib/logger";
import { ensureTablesExist } from "./lib/setup-db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start server immediately so Render health checks pass regardless of DB state
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Set up DB tables (non-fatal if DB is slow to be ready)
  ensureTablesExist()
    .then(() => {
      logger.info("DB tables ready");
    })
    .catch((err) => {
      logger.error({ err, message: err?.message, code: err?.code }, "DB setup failed");
    });

  // Keep-alive: self-ping so the UI stays responsive on Render free tier.
  // The midnight booking is handled by a dedicated Render cron service (cron-entry.ts)
  // so this ping is only for UI responsiveness, not booking reliability.
  const selfUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/healthz`
    : `http://localhost:${port}/api/healthz`;

  setInterval(() => {
    fetch(selfUrl).catch((e) => logger.warn({ err: e.message }, "Keep-alive ping failed"));
  }, 5 * 60 * 1000);
});
