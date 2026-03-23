require("dotenv").config();

const config = {
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
  },

  github: {
    token: process.env.GITHUB_TOKEN,
    // GitHub App credentials (alternative auth)
    appId: process.env.GITHUB_APP_ID,
    privateKeyPath: process.env.GITHUB_APP_PRIVATE_KEY_PATH,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    // Concurrency for parallel API requests
    concurrencyLimit: parseInt(process.env.GITHUB_CONCURRENCY_LIMIT || "10", 10),
  },

  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "300", 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
};

/**
 * Validate required config at startup.
 * Throws early with a clear message rather than failing mid-request.
 */
function validate() {
  const hasTokenAuth = !!config.github.token;
  const hasAppAuth =
    config.github.appId &&
    config.github.privateKeyPath &&
    config.github.installationId;

  if (!hasTokenAuth && !hasAppAuth) {
    throw new Error(
      "GitHub authentication not configured. " +
        "Set GITHUB_TOKEN for PAT auth, or GITHUB_APP_ID + " +
        "GITHUB_APP_PRIVATE_KEY_PATH + GITHUB_APP_INSTALLATION_ID for App auth."
    );
  }
}

module.exports = { config, validate };
