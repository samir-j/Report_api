const Joi = require("joi");
const GitHubService = require("../services/githubService");
const Cache = require("../utils/cache");
const { config } = require("../config");
const logger = require("../utils/logger");

// One cache instance shared across requests
const reportCache = new Cache(config.cache.ttlSeconds);
const githubService = new GitHubService();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const orgParamSchema = Joi.object({
  org: Joi.string()
    .pattern(/^[a-zA-Z0-9_.-]+$/)
    .min(1)
    .max(100)
    .required()
    .messages({
      "string.pattern.base":
        "Organization name may only contain letters, numbers, hyphens, underscores, and dots.",
    }),
});

const querySchema = Joi.object({
  view: Joi.string()
    .valid("full", "by_repo", "by_user", "summary")
    .default("full"),
  refresh: Joi.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * GET /report/:org
 *
 * Query params:
 *   view     = full | by_repo | by_user | summary   (default: full)
 *   refresh  = true | false                          (default: false)
 */
async function getAccessReport(req, res, next) {
  try {
    // Validate path param
    const { error: paramError, value: params } = orgParamSchema.validate(
      req.params
    );
    if (paramError) {
      return res.status(400).json({
        error: "Invalid organization name",
        details: paramError.details[0].message,
      });
    }

    // Validate query params
    const { error: queryError, value: query } = querySchema.validate(
      req.query,
      { allowUnknown: false }
    );
    if (queryError) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryError.details[0].message,
      });
    }

    const { org } = params;
    const { view, refresh } = query;
    const cacheKey = `report:${org}`;

    // Invalidate cache when caller explicitly requests a refresh
    if (refresh) {
      reportCache.delete(cacheKey);
      logger.info("Cache invalidated by caller", { org });
    }

    // Serve from cache if available
    let report = reportCache.get(cacheKey);
    let fromCache = !!report;

    if (!report) {
      logger.info("Building fresh report", { org });
      report = await githubService.getAccessReport(org);
      reportCache.set(cacheKey, report);
    }

    // Shape the response according to the requested view
    const payload = buildPayload(report, view, fromCache);

    return res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /report/:org/cache
 * Allows explicit cache busting without re-fetching immediately.
 */
async function clearCache(req, res, next) {
  try {
    const { error, value: params } = orgParamSchema.validate(req.params);
    if (error) {
      return res.status(400).json({ error: "Invalid organization name" });
    }
    reportCache.delete(`report:${params.org}`);
    return res.status(200).json({ message: "Cache cleared", org: params.org });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPayload(report, view, fromCache) {
  const meta = {
    org: report.org,
    generatedAt: report.generatedAt,
    servedFromCache: fromCache,
    summary: report.summary,
  };

  switch (view) {
    case "summary":
      return meta;

    case "by_repo":
      return { ...meta, byRepository: report.byRepository };

    case "by_user":
      return { ...meta, byUser: report.byUser };

    case "full":
    default:
      return {
        ...meta,
        byRepository: report.byRepository,
        byUser: report.byUser,
      };
  }
}

module.exports = { getAccessReport, clearCache };
