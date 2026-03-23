// Mock the GitHub client before importing the service
jest.mock("../src/services/githubClient", () => ({
  createGitHubClient: jest.fn(),
}));

// Mock p-limit to execute tasks immediately (no concurrency throttle in tests)
jest.mock("p-limit", () => () => (fn) => fn());

const { createGitHubClient } = require("../src/services/githubClient");
const GitHubService = require("../src/services/githubService");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockRepos = [
  {
    id: 1,
    name: "repo-a",
    full_name: "test-org/repo-a",
    private: false,
    visibility: "public",
    html_url: "https://github.com/test-org/repo-a",
  },
  {
    id: 2,
    name: "repo-b",
    full_name: "test-org/repo-b",
    private: true,
    visibility: "private",
    html_url: "https://github.com/test-org/repo-b",
  },
];

const mockCollaboratorsRepoA = [
  {
    login: "alice",
    id: 101,
    avatar_url: "https://avatars.github.com/alice",
    role_name: "admin",
    permissions: { admin: true, maintain: true, push: true, triage: true, pull: true },
  },
  {
    login: "bob",
    id: 102,
    avatar_url: "https://avatars.github.com/bob",
    role_name: "write",
    permissions: { admin: false, maintain: false, push: true, triage: true, pull: true },
  },
];

const mockCollaboratorsRepoB = [
  {
    login: "alice",
    id: 101,
    avatar_url: "https://avatars.github.com/alice",
    role_name: "read",
    permissions: { admin: false, maintain: false, push: false, triage: false, pull: true },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitHubService", () => {
  let service;
  let mockOctokit;

  beforeEach(() => {
    mockOctokit = {
      paginate: jest.fn(),
      repos: {
        listForOrg: "repos.listForOrg",
        listCollaborators: "repos.listCollaborators",
      },
    };

    createGitHubClient.mockReturnValue(mockOctokit);
    service = new GitHubService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------

  describe("getOrgRepositories", () => {
    it("returns normalised repo list", async () => {
      mockOctokit.paginate.mockResolvedValue(mockRepos);

      const result = await service.getOrgRepositories("test-org");

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        name: "repo-a",
        fullName: "test-org/repo-a",
        private: false,
        visibility: "public",
      });
    });
  });

  // -------------------------------------------------------------------------

  describe("getRepoCollaborators", () => {
    it("returns normalised collaborator list", async () => {
      mockOctokit.paginate.mockResolvedValue(mockCollaboratorsRepoA);

      const result = await service.getRepoCollaborators("test-org", "repo-a");

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        login: "alice",
        role: "admin",
        permissions: { admin: true, push: true, pull: true },
      });
    });

    it("returns empty array on 403", async () => {
      const err = new Error("Forbidden");
      err.status = 403;
      mockOctokit.paginate.mockRejectedValue(err);

      const result = await service.getRepoCollaborators("test-org", "private-repo");
      expect(result).toEqual([]);
    });

    it("returns empty array on 404", async () => {
      const err = new Error("Not found");
      err.status = 404;
      mockOctokit.paginate.mockRejectedValue(err);

      const result = await service.getRepoCollaborators("test-org", "missing-repo");
      expect(result).toEqual([]);
    });

    it("rethrows unexpected errors", async () => {
      const err = new Error("Network error");
      err.status = 500;
      mockOctokit.paginate.mockRejectedValue(err);

      await expect(
        service.getRepoCollaborators("test-org", "repo-a")
      ).rejects.toThrow("Network error");
    });
  });

  // -------------------------------------------------------------------------

  describe("getAccessReport", () => {
    beforeEach(() => {
      mockOctokit.paginate.mockImplementation((endpoint, params) => {
        if (endpoint === "repos.listForOrg") return Promise.resolve(mockRepos);
        if (params?.repo === "repo-a") return Promise.resolve(mockCollaboratorsRepoA);
        if (params?.repo === "repo-b") return Promise.resolve(mockCollaboratorsRepoB);
        return Promise.resolve([]);
      });
    });

    it("includes correct summary counts", async () => {
      const report = await service.getAccessReport("test-org");

      expect(report.summary.totalRepositories).toBe(2);
      expect(report.summary.totalUniqueUsers).toBe(2); // alice + bob
      expect(report.summary.totalAccessEntries).toBe(3); // alice×2 + bob×1
    });

    it("byRepository maps repos to collaborators", async () => {
      const report = await service.getAccessReport("test-org");

      expect(report.byRepository["repo-a"].collaboratorCount).toBe(2);
      expect(report.byRepository["repo-b"].collaboratorCount).toBe(1);
    });

    it("byUser maps users to their repos", async () => {
      const report = await service.getAccessReport("test-org");

      expect(report.byUser["alice"].repositories).toHaveLength(2);
      expect(report.byUser["bob"].repositories).toHaveLength(1);
      expect(report.byUser["bob"].repositories[0].name).toBe("repo-a");
    });

    it("includes generatedAt timestamp", async () => {
      const report = await service.getAccessReport("test-org");
      expect(new Date(report.generatedAt)).toBeInstanceOf(Date);
    });
  });
});
