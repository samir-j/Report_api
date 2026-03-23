const pLimit = require("p-limit");
const { createGitHubClient } = require("./githubClient");
const { config } = require("../config");
const logger = require("../utils/logger");

/**
 * GitHubService
 *
 * Responsible for all GitHub API interactions:
 *   - Paginating through repos and collaborators
 *   - Running requests concurrently (bounded by GITHUB_CONCURRENCY_LIMIT)
 *   - Normalising raw API responses into clean domain objects
 */
class GitHubService {
  constructor() {
    this.octokit = createGitHubClient();
    this.limit = pLimit(config.github.concurrencyLimit);
  }

  // ---------------------------------------------------------------------------
  // Repositories
  // ---------------------------------------------------------------------------

  /**
   * Fetches ALL repositories for an org, handling pagination automatically.
   * Returns an array of { id, name, fullName, private, visibility, url }.
   */
  async getOrgRepositories(org) {
    logger.info("Fetching repositories", { org });

    const repos = await this.octokit.paginate(
      this.octokit.repos.listForOrg,
      {
        org,
        type: "all",   // public + private + forks + sources
        per_page: 100, // maximum page size to minimise round-trips
      },
      (response) => response.data
    );

    logger.info("Fetched repositories", { org, count: repos.length });

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      visibility: r.visibility,
      url: r.html_url,
    }));
  }

  // ---------------------------------------------------------------------------
  // Collaborators
  // ---------------------------------------------------------------------------

  /**
   * Fetches all direct collaborators for a single repository.
   * Returns an array of { login, id, avatarUrl, role, permissions }.
   */
  async getRepoCollaborators(org, repoName) {
    try {
      const collaborators = await this.octokit.paginate(
        this.octokit.repos.listCollaborators,
        {
          owner: org,
          repo: repoName,
          affiliation: "all", // direct + team + org-level
          per_page: 100,
        },
        (response) => response.data
      );

      return collaborators.map((c) => ({
        login: c.login,
        id: c.id,
        avatarUrl: c.avatar_url,
        // `role_name` is the canonical field; `permissions` provides granular flags
        role: c.role_name || deriveRole(c.permissions),
        permissions: normalisePermissions(c.permissions),
      }));
    } catch (err) {
      // 403 can occur when the token lacks admin scope for a private repo
      if (err.status === 403) {
        logger.warn("Insufficient permissions to list collaborators", {
          repo: repoName,
          message: err.message,
        });
        return [];
      }
      // 404 can occur for archived repos or forks with restricted access
      if (err.status === 404) {
        logger.warn("Repository not found or inaccessible", { repo: repoName });
        return [];
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregation
  // ---------------------------------------------------------------------------

  /**
   * Core method: fetches collaborators for ALL repositories concurrently,
   * then builds two complementary views:
   *
   *   repoAccess:  repo  → [users]   (which users can access each repo)
   *   userAccess:  user  → [repos]   (which repos each user can access)
   *
   * Concurrency is bounded by `pLimit` to avoid secondary rate-limits.
   */
  async getAccessReport(org) {
    const repositories = await this.getOrgRepositories(org);

    logger.info("Fetching collaborators for all repos concurrently", {
      org,
      repoCount: repositories.length,
      concurrency: config.github.concurrencyLimit,
    });

    // Fan-out: one task per repo, bounded concurrency
    const tasks = repositories.map((repo) =>
      this.limit(async () => {
        const collaborators = await this.getRepoCollaborators(org, repo.name);
        return { repo, collaborators };
      })
    );

    const results = await Promise.all(tasks);

    // ---------------------------------------------------------------------------
    // Build report structures
    // ---------------------------------------------------------------------------
    const repoAccess = {};   // repoName → { repo, collaborators[] }
    const userAccess = {};   // login    → { user, repositories[] }

    for (const { repo, collaborators } of results) {
      repoAccess[repo.name] = {
        repository: repo,
        collaborators,
        collaboratorCount: collaborators.length,
      };

      for (const user of collaborators) {
        if (!userAccess[user.login]) {
          userAccess[user.login] = {
            user: {
              login: user.login,
              id: user.id,
              avatarUrl: user.avatarUrl,
            },
            repositories: [],
          };
        }
        userAccess[user.login].repositories.push({
          name: repo.name,
          fullName: repo.fullName,
          visibility: repo.visibility,
          url: repo.url,
          role: user.role,
          permissions: user.permissions,
        });
      }
    }

    const totalCollaborators = Object.keys(userAccess).length;
    const totalAccesses = results.reduce(
      (sum, r) => sum + r.collaborators.length,
      0
    );

    logger.info("Access report complete", {
      org,
      repositories: repositories.length,
      uniqueUsers: totalCollaborators,
      totalAccessEntries: totalAccesses,
    });

    return {
      org,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRepositories: repositories.length,
        totalUniqueUsers: totalCollaborators,
        totalAccessEntries: totalAccesses,
      },
      byRepository: repoAccess,
      byUser: userAccess,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable role string from the permissions map for older
 * API responses that don't include `role_name`.
 */
function deriveRole(permissions = {}) {
  if (permissions.admin) return "admin";
  if (permissions.maintain) return "maintain";
  if (permissions.push) return "write";
  if (permissions.triage) return "triage";
  if (permissions.pull) return "read";
  return "unknown";
}

/**
 * Normalise the GitHub permissions object to a clean subset.
 */
function normalisePermissions(permissions = {}) {
  return {
    admin: !!permissions.admin,
    maintain: !!permissions.maintain,
    push: !!permissions.push,
    triage: !!permissions.triage,
    pull: !!permissions.pull,
  };
}

module.exports = GitHubService;
