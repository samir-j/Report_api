process.env.GITHUB_TOKEN = "test-token"; // satisfy config validation

const request = require("supertest");
const { createApp } = require("../src/app");

// Mock the entire GitHubService so HTTP tests don't hit the real API
jest.mock("../src/services/githubService");
const GitHubService = require("../src/services/githubService");

const mockReport = {
  org: "test-org",
  generatedAt: "2024-01-01T00:00:00.000Z",
  summary: { totalRepositories: 1, totalUniqueUsers: 1, totalAccessEntries: 1 },
  byRepository: {
    "repo-a": {
      repository: { name: "repo-a", fullName: "test-org/repo-a" },
      collaborators: [{ login: "alice", role: "admin" }],
      collaboratorCount: 1,
    },
  },
  byUser: {
    alice: {
      user: { login: "alice", id: 1 },
      repositories: [{ name: "repo-a", role: "admin" }],
    },
  },
};

describe("API routes", () => {
  let app;

  beforeEach(() => {
    GitHubService.mockImplementation(() => ({
      getAccessReport: jest.fn().mockResolvedValue(mockReport),
    }));
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  // -------------------------------------------------------------------------

  describe("GET /report/:org", () => {
    it("returns 200 with full report", async () => {
      const res = await request(app).get("/report/test-org");
      expect(res.status).toBe(200);
      expect(res.body.org).toBe("test-org");
      expect(res.body.byRepository).toBeDefined();
      expect(res.body.byUser).toBeDefined();
    });

    it("view=summary returns only summary", async () => {
      const res = await request(app).get("/report/test-org?view=summary");
      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.byRepository).toBeUndefined();
      expect(res.body.byUser).toBeUndefined();
    });

    it("view=by_repo excludes byUser", async () => {
      const res = await request(app).get("/report/test-org?view=by_repo");
      expect(res.status).toBe(200);
      expect(res.body.byRepository).toBeDefined();
      expect(res.body.byUser).toBeUndefined();
    });

    it("view=by_user excludes byRepository", async () => {
      const res = await request(app).get("/report/test-org?view=by_user");
      expect(res.status).toBe(200);
      expect(res.body.byUser).toBeDefined();
      expect(res.body.byRepository).toBeUndefined();
    });

    it("rejects invalid org name", async () => {
      const res = await request(app).get("/report/bad/org/name");
      expect(res.status).toBe(404); // treated as unmatched route
    });

    it("rejects invalid view param", async () => {
      const res = await request(app).get("/report/test-org?view=invalid");
      expect(res.status).toBe(400);
    });

    it("returns 404 when GitHub says org does not exist", async () => {
      GitHubService.mockImplementation(() => ({
        getAccessReport: jest.fn().mockRejectedValue(
          Object.assign(new Error("Not Found"), { status: 404 })
        ),
      }));
      app = createApp();
      const res = await request(app).get("/report/nonexistent-org");
      expect(res.status).toBe(404);
    });

    it("returns 401 on bad GitHub token", async () => {
      GitHubService.mockImplementation(() => ({
        getAccessReport: jest.fn().mockRejectedValue(
          Object.assign(new Error("Unauthorized"), { status: 401 })
        ),
      }));
      app = createApp();
      const res = await request(app).get("/report/test-org");
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------

  describe("DELETE /report/:org/cache", () => {
    it("returns 200 with confirmation", async () => {
      const res = await request(app).delete("/report/test-org/cache");
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/cache cleared/i);
    });
  });
});
