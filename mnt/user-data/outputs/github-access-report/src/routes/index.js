const { Router } = require("express");
const {
  getAccessReport,
  clearCache,
} = require("../controllers/reportController");

const router = Router();

/**
 * GET /report/:org
 *
 * Returns the full access report for the given GitHub organization.
 *
 * Query params:
 *   view     = full | by_repo | by_user | summary   (default: full)
 *   refresh  = true | false                          (default: false)
 *
 * Example:
 *   GET /report/my-org
 *   GET /report/my-org?view=by_user
 *   GET /report/my-org?refresh=true
 */
router.get("/report/:org", getAccessReport);

/**
 * DELETE /report/:org/cache
 * Clears the cached report for the given org without triggering a re-fetch.
 */
router.delete("/report/:org/cache", clearCache);

/**
 * GET /health
 * Simple liveness probe.
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = router;
