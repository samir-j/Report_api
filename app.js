const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/requestLogger");

function createApp() {
  const app = express();

  // ---------------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------------
  app.use(helmet());

  // ---------------------------------------------------------------------------
  // Rate limiting – protect the service from being hammered
  // ---------------------------------------------------------------------------
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 30,             // max 30 requests per window per IP
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests. Please retry in a minute." },
    })
  );

  // ---------------------------------------------------------------------------
  // Body parsing & logging
  // ---------------------------------------------------------------------------
  app.use(express.json());
  app.use(requestLogger);

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  app.use("/", routes);

  // ---------------------------------------------------------------------------
  // Error handling (must be last)
  // ---------------------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
