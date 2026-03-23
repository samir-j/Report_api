const { config, validate } = require("./config");
const { createApp } = require("./app");
const logger = require("./utils/logger");

// Fail fast if auth is not configured
try {
  validate();
} catch (err) {
  logger.error("Configuration error", { message: err.message });
  process.exit(1);
}

const app = createApp();

const server = app.listen(config.server.port, () => {
  logger.info("GitHub Access Report service started", {
    port: config.server.port,
    env: config.server.nodeEnv,
    concurrencyLimit: config.github.concurrencyLimit,
    cacheTtlSeconds: config.cache.ttlSeconds,
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 s if connections are still open
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = server; // exported for integration tests
