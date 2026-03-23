const logger = require("../utils/logger");

/**
 * Centralised error handler.
 * Maps known GitHub API errors to appropriate HTTP status codes
 * and ensures we never leak stack traces to clients in production.
 */
function errorHandler(err, req, res, _next) {
  // GitHub API errors carry a `status` field
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  logger.error("Request error", {
    method: req.method,
    url: req.originalUrl,
    status,
    message: err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });

  // Map GitHub-specific statuses to meaningful messages
  const messageMap = {
    401: "GitHub authentication failed. Check your GITHUB_TOKEN.",
    403: "Access forbidden. The token may lack the required scopes.",
    404: "Organization not found on GitHub.",
    422: "Invalid request to GitHub API.",
    429: "GitHub rate limit exceeded. Please retry later.",
  };

  const message =
    messageMap[status] ||
    (isProduction ? "An unexpected error occurred." : err.message);

  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: message,
    ...(isProduction ? {} : { detail: err.message }),
  });
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
