const logger = require("../utils/logger");

/**
 * Logs every incoming request and its response status/duration.
 */
function requestLogger(req, res, next) {
  const startAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - startAt) / 1_000_000;

    logger.info("HTTP request", {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: durationMs.toFixed(2),
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestLogger };
