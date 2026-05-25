import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
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

  // Set up DB tables and then start scheduler (non-fatal if DB is slow to be ready)
  ensureTablesExist()
    .then(() => {
      startScheduler();
    })
    .catch((err) => {
      logger.error({ err, message: err?.message, code: err?.code }, "DB setup failed — scheduler NOT started");
    });

  // Keep-alive: ping our own health endpoint every 14 minutes so Render's free
  // tier never sleeps and the Sunday-midnight cron always fires on time.
  // Self-ping every 5 min as a fallback; the Render cron job is the primary keep-alive.
  const selfUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/healthz`
    : `http://localhost:${port}/api/healthz`;

  setInterval(() => {
    fetch(selfUrl).catch((e) => logger.warn({ err: e.message }, "Keep-alive ping failed"));
  }, 5 * 60 * 1000);
});
