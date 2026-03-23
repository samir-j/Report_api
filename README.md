# GitHub Organization Access Report

A Node.js service that connects to GitHub and generates a structured access report showing which users have access to which repositories within a given organization.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [How to Run](#how-to-run)
- [Authentication Configuration](#authentication-configuration)
- [API Reference](#api-reference)
- [Example Responses](#example-responses)
- [Design Decisions](#design-decisions)
- [Assumptions](#assumptions)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)

---

## Features

- Fetches all repositories for a GitHub organization (public, private, forks)
- Determines collaborators and their permission levels for each repository
- Generates two complementary views: **by repository** and **by user**
- Concurrent API calls with configurable parallelism (scales to 100+ repos, 1000+ users)
- Automatic GitHub rate-limit handling via throttling and retry
- In-memory TTL cache to avoid redundant API calls
- Input validation, structured error handling, and request logging

---

## Architecture

```
src/
├── config/         # Environment-based configuration with startup validation
├── controllers/    # Request validation, cache logic, response shaping
├── middleware/     # Error handler, request logger
├── routes/         # Express route definitions
├── services/
│   ├── githubClient.js   # Octokit instance with throttling + retry plugins
│   └── githubService.js  # All GitHub API interactions & report aggregation
└── utils/
    ├── cache.js    # In-memory TTL cache
    └── logger.js   # Winston logger
```

**Request flow:**

```
GET /report/:org
      │
      ▼
 reportController        ← validates input, checks cache
      │
      ▼
 GitHubService
   ├── getOrgRepositories()       ← paginated, single call chain
   └── getRepoCollaborators() ×N  ← concurrent, bounded by p-limit
      │
      ▼
 Aggregation → byRepository + byUser maps
      │
      ▼
 Cache (TTL) → JSON response
```

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- A GitHub **Personal Access Token** (PAT) with the following scopes:
  - `repo` — to read private repositories and collaborators
  - `read:org` — to list organization repositories

---

## How to Run

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/github-access-report.git
cd github-access-report
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your GITHUB_TOKEN
```

### 3. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

The service listens on `http://localhost:3000` by default. Override with `PORT=<n>` in `.env`.

---

## Authentication Configuration

The service supports **Personal Access Token (PAT)** authentication. Set the token in your `.env` file:

```env
GITHUB_TOKEN=ghp_your_token_here
```

### Generating a PAT

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token**
3. Select scopes: `repo`, `read:org`
4. Copy the token into your `.env` file

### Required Token Scopes

| Scope | Purpose |
|---|---|
| `repo` | Read private repositories and collaborator lists |
| `read:org` | List all repositories in the organization |

> **Note:** If your token only has `public_repo`, collaborators on private repositories will return empty (the service handles this gracefully without crashing).

---

## API Reference

### `GET /report/:org`

Generates and returns the access report for the given GitHub organization.

| Parameter | Type | Location | Description |
|---|---|---|---|
| `org` | string | path | GitHub organization login (e.g. `my-company`) |
| `view` | string | query | Response shape: `full` \| `by_repo` \| `by_user` \| `summary` (default: `full`) |
| `refresh` | boolean | query | Set `true` to bypass cache and fetch fresh data (default: `false`) |

**Examples:**

```bash
# Full report (default)
curl http://localhost:3000/report/my-org

# Only the user → repos mapping
curl http://localhost:3000/report/my-org?view=by_user

# Only the repo → users mapping
curl http://localhost:3000/report/my-org?view=by_repo

# Just the summary counts
curl http://localhost:3000/report/my-org?view=summary

# Force a fresh fetch, bypass cache
curl http://localhost:3000/report/my-org?refresh=true
```

---

### `DELETE /report/:org/cache`

Clears the cached report for the given organization without triggering a re-fetch.

```bash
curl -X DELETE http://localhost:3000/report/my-org/cache
```

---

### `GET /health`

Liveness probe. Returns `200 OK` if the service is running.

```bash
curl http://localhost:3000/health
```

---

## Example Responses

### `GET /report/my-org?view=full`

```json
{
  "org": "my-org",
  "generatedAt": "2024-03-15T10:30:00.000Z",
  "servedFromCache": false,
  "summary": {
    "totalRepositories": 2,
    "totalUniqueUsers": 2,
    "totalAccessEntries": 3
  },
  "byRepository": {
    "api-service": {
      "repository": {
        "id": 123456,
        "name": "api-service",
        "fullName": "my-org/api-service",
        "private": true,
        "visibility": "private",
        "url": "https://github.com/my-org/api-service"
      },
      "collaboratorCount": 2,
      "collaborators": [
        {
          "login": "alice",
          "id": 1001,
          "avatarUrl": "https://avatars.githubusercontent.com/u/1001",
          "role": "admin",
          "permissions": {
            "admin": true,
            "maintain": true,
            "push": true,
            "triage": true,
            "pull": true
          }
        },
        {
          "login": "bob",
          "id": 1002,
          "avatarUrl": "https://avatars.githubusercontent.com/u/1002",
          "role": "write",
          "permissions": {
            "admin": false,
            "maintain": false,
            "push": true,
            "triage": true,
            "pull": true
          }
        }
      ]
    },
    "frontend": {
      "repository": {
        "id": 123457,
        "name": "frontend",
        "fullName": "my-org/frontend",
        "private": false,
        "visibility": "public",
        "url": "https://github.com/my-org/frontend"
      },
      "collaboratorCount": 1,
      "collaborators": [
        {
          "login": "alice",
          "id": 1001,
          "avatarUrl": "https://avatars.githubusercontent.com/u/1001",
          "role": "admin",
          "permissions": {
            "admin": true,
            "maintain": true,
            "push": true,
            "triage": true,
            "pull": true
          }
        }
      ]
    }
  },
  "byUser": {
    "alice": {
      "user": {
        "login": "alice",
        "id": 1001,
        "avatarUrl": "https://avatars.githubusercontent.com/u/1001"
      },
      "repositories": [
        {
          "name": "api-service",
          "fullName": "my-org/api-service",
          "visibility": "private",
          "url": "https://github.com/my-org/api-service",
          "role": "admin",
          "permissions": {
            "admin": true,
            "maintain": true,
            "push": true,
            "triage": true,
            "pull": true
          }
        },
        {
          "name": "frontend",
          "fullName": "my-org/frontend",
          "visibility": "public",
          "url": "https://github.com/my-org/frontend",
          "role": "admin",
          "permissions": {
            "admin": true,
            "maintain": true,
            "push": true,
            "triage": true,
            "pull": true
          }
        }
      ]
    },
    "bob": {
      "user": {
        "login": "bob",
        "id": 1002,
        "avatarUrl": "https://avatars.githubusercontent.com/u/1002"
      },
      "repositories": [
        {
          "name": "api-service",
          "fullName": "my-org/api-service",
          "visibility": "private",
          "url": "https://github.com/my-org/api-service",
          "role": "write",
          "permissions": {
            "admin": false,
            "maintain": false,
            "push": true,
            "triage": true,
            "pull": true
          }
        }
      ]
    }
  }
}
```

### `GET /report/my-org?view=summary`

```json
{
  "org": "my-org",
  "generatedAt": "2024-03-15T10:30:00.000Z",
  "servedFromCache": true,
  "summary": {
    "totalRepositories": 2,
    "totalUniqueUsers": 2,
    "totalAccessEntries": 3
  }
}
```

### Error responses

```json
// 400 – Invalid input
{ "error": "Invalid query parameters", "details": "\"view\" must be one of [full, by_repo, by_user, summary]" }

// 401 – Bad token
{ "error": "GitHub authentication failed. Check your GITHUB_TOKEN." }

// 404 – Org not found
{ "error": "Organization not found on GitHub." }

// 429 – Rate limited
{ "error": "GitHub rate limit exceeded. Please retry later." }
```

---

## Design Decisions

### Concurrent repo lookups with bounded parallelism (`p-limit`)

For an org with 100+ repositories, fetching collaborators sequentially would take far too long (100 serial HTTP calls). Instead, the service fans out all collaborator requests concurrently using `Promise.all`, bounded by a configurable `GITHUB_CONCURRENCY_LIMIT` (default: 10).

This keeps latency proportional to `ceil(repos / concurrency)` round-trips rather than `repos` round-trips, while staying well within GitHub's secondary rate-limit rules.

### Automatic pagination via `octokit.paginate`

All list endpoints use `octokit.paginate`, which transparently follows GitHub's `Link: <next>` headers. This means 1000-member orgs and orgs with 500+ repos are handled without any manual page-counting logic.

### Throttling + retry via Octokit plugins

`@octokit/throttling` listens to `X-RateLimit-*` response headers and automatically pauses requests before the limit is hit. `@octokit/retry` re-attempts transient 5xx errors up to 3 times. Both are transparent to the rest of the application.

### Two complementary report views

The report is built once and stored in two index structures:
- `byRepository`: quick lookup for "who can access this repo?"
- `byUser`: quick lookup for "what can this user access?"

Callers select their preferred shape via the `?view=` query parameter, avoiding the need to transform the data client-side.

### In-memory TTL cache

Building a full report for a large org takes several seconds. Repeated calls within the TTL window (default: 5 minutes) are served instantly from cache. The `?refresh=true` flag allows callers to opt out when they need live data.

For production deployments serving multiple instances, swap the in-memory `Cache` class for a Redis-backed implementation — the interface is identical.

### Graceful handling of inaccessible repos

Some repos may return 403 (insufficient token scope) or 404 (archived/restricted). These are logged as warnings and return an empty collaborator list rather than failing the entire report.

---

## Assumptions

1. **Token scope**: The PAT must have `repo` + `read:org` scopes. Without `repo`, private-repo collaborators will silently return empty (this is a GitHub API constraint, not a bug).
2. **Organization membership**: The API returns *direct collaborators* (`affiliation: "all"`), which includes users granted access directly, through teams, or via org membership. This matches the most common definition of "who has access."
3. **Scale**: At 100 repos × 10 concurrency the service makes ~10 parallel pages × ~10 rounds = ~100 requests. Well within GitHub's 5000 requests/hour PAT limit.
4. **Cache storage**: The in-memory cache is process-local. If you run multiple instances behind a load balancer, use a shared cache (Redis) to avoid stale reports across pods.
5. **Auth method**: Only PAT auth is implemented in the default path. The config module is structured to support GitHub App auth (which provides higher rate limits) — see `.env.example` for the required variables.

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Watch mode during development
npm run test:watch
```

Tests are split into:
- `tests/cache.test.js` — unit tests for the TTL cache
- `tests/githubService.test.js` — unit tests for data fetching and aggregation logic (GitHub API mocked)
- `tests/routes.test.js` — integration tests for all HTTP endpoints (service layer mocked)

---

## Project Structure

```
github-access-report/
├── src/
│   ├── config/
│   │   └── index.js           # Config loading + startup validation
│   ├── controllers/
│   │   └── reportController.js # Request handling, cache, view shaping
│   ├── middleware/
│   │   ├── errorHandler.js    # Centralised error → HTTP status mapping
│   │   └── requestLogger.js   # Per-request timing logs
│   ├── routes/
│   │   └── index.js           # Express route definitions
│   ├── services/
│   │   ├── githubClient.js    # Octokit + throttling + retry setup
│   │   └── githubService.js   # All GitHub API calls and aggregation
│   ├── utils/
│   │   ├── cache.js           # In-memory TTL cache
│   │   └── logger.js          # Winston logger
│   ├── app.js                 # Express app factory
│   └── index.js               # Server entry point + graceful shutdown
├── tests/
│   ├── cache.test.js
│   ├── githubService.test.js
│   └── routes.test.js
├── .env.example
├── .gitignore
├── jest.config.json
├── package.json
└── README.md
```
