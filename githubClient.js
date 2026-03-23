const { Octokit } = require("@octokit/rest");
const { throttling } = require("@octokit/throttling");
const { retry } = require("@octokit/retry");
const { config } = require("../config");
const logger = require("../utils/logger");

// Compose Octokit with throttling + retry plugins
const OctokitWithPlugins = Octokit.plugin(throttling, retry);

/**
 * Creates a fully configured Octokit instance.
 *
 * Throttling:  Automatically pauses and retries when GitHub rate-limit
 *              headers indicate we are about to hit the ceiling.
 * Retry:       Re-attempts on transient 5xx errors (up to 3 times).
 *
 * Both behaviours keep the caller unaware of GitHub's rate-limit mechanics
 * and make the service resilient at the 100+ repo / 1000+ user scale.
 */
function createGitHubClient() {
  return new OctokitWithPlugins({
    auth: config.github.token,

    throttle: {
      onRateLimit(retryAfter, options, octokit, retryCount) {
        logger.warn("GitHub rate limit hit", {
          url: options.url,
          retryAfter,
          retryCount,
        });
        // Retry up to 2 times when rate-limited
        return retryCount < 2;
      },
      onSecondaryRateLimit(retryAfter, options) {
        // Secondary rate limits (abuse detection) — log and do NOT retry
        logger.warn("GitHub secondary rate limit triggered", {
          url: options.url,
          retryAfter,
        });
        return false;
      },
    },

    retry: {
      doNotRetry: ["429"], // handled by throttling above
    },
  });
}

module.exports = { createGitHubClient };
