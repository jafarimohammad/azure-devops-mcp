# Azure DevOps MCP Server

[🇮🇷 نسخه فارسی](README.fa.md)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for **Azure DevOps Server 2022** (on-premise) that exposes Azure DevOps capabilities as AI-callable tools — letting any MCP-compatible AI assistant query pipelines, pull requests, builds, repositories, and work items through natural language.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-ready-326CE5)](https://kubernetes.io/)

---

## What can it do?

Ask your AI assistant in plain language — the MCP server handles the Azure DevOps REST API calls:

**Simple queries**
```
"List all projects in the collection"
"What branches does the backend repository have?"
"Show me all open pull requests"
"What's the status of the last build?"
"Who is assigned to work item #42?"
"Read the appsettings.json from the main branch"
```

**Moderate queries**
```
"List all failed builds in the last 24 hours and which pipelines they belong to"
"Show me the open PRs targeting the main branch and their reviewers"
"Find all work items of type Bug that are currently Active"
"Create a pull request from feature/payment to develop with a description"
"Add John as a reviewer to PR #87"
"Run the pipeline named 'deploy-staging' on the release branch"
```

**Complex queries**
```
"Which PRs opened in the last 48 hours still have no reviewer? Group them by repository."
"Get the logs of the last failed build for the 'deploy-prod' pipeline and summarize what went wrong"
"Find all In Progress work items assigned to the current user and list them by priority"
"Show me all unresolved review comments on PR #112 — what feedback is still pending?"
"List the last 5 builds for the backend pipeline. How many succeeded vs failed this week?"
"Find work items with high priority that haven't been updated in more than 3 days"
"Which repositories have open PRs with no reviewer and at least one unresolved comment?"
```

---

## Available Tools

### Projects
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in the collection |

### Repositories & Branches
| Tool | Description |
|------|-------------|
| `list_repositories` | List Git repositories in a project |
| `list_branches` | List branches of a repository |
| `get_file_content` | Read file content from a repository at any branch |

### Pull Requests
| Tool | Description |
|------|-------------|
| `list_pull_requests` | List PRs across all repos in a project (filter by status) |
| `list_prs_without_reviewer` | Find open PRs with no reviewer, with optional time window (e.g. last 24 hours) |
| `get_pull_request` | Get PR details: description, merge status, reviewers and their votes |
| `get_pr_comments` | Get review comment threads on a PR (filter by active/resolved) |
| `add_pr_reviewer` | Add a reviewer to a PR by email or display name |
| `create_pull_request` | Create a new PR from source to target branch (supports draft) |

### Pipelines & Builds
| Tool | Description |
|------|-------------|
| `list_pipelines` | List all pipeline definitions in a project |
| `get_last_build` | Get the most recent build status, optionally filtered by pipeline name |
| `list_builds` | List recent builds filtered by pipeline or status |
| `list_failed_builds` | Find failed/partial builds in the last N hours |
| `get_build` | Get details of a specific build |
| `get_build_logs` | Fetch console log output of a build (auto-truncated, last 150 lines) |
| `run_pipeline_by_name` | Find and run a pipeline by name (partial match, no ID needed) |
| `run_pipeline` | Queue a pipeline run by numeric ID |

### Work Items
| Tool | Description |
|------|-------------|
| `list_work_items` | Search work items by type, state, assignee, or keyword using WIQL |
| `get_work_item` | Get full details of a work item by ID |
| `create_work_item` | Create a new work item (Bug, Task, User Story, etc.) |
| `update_work_item` | Update fields of an existing work item (state, assignee, title, etc.) |

---

## Architecture

```
AI Client (Claude, Open WebUI, etc.)
        │  MCP Protocol (JSON-RPC)
        ▼
┌─────────────────────────┐
│   Azure DevOps MCP      │
│   ─────────────────     │
│  HTTP (Kubernetes) or   │
│  stdio (local)          │
│                         │
│  tools/                 │
│    projects.ts          │
│    repos.ts             │
│    pipelines.ts         │
│    workitems.ts         │
└────────────┬────────────┘
             │  REST API (api-version 7.0)
             │  Basic Auth (PAT)
             ▼
┌─────────────────────────┐
│  Azure DevOps Server    │
│  2022 (on-premise)      │
└─────────────────────────┘
```

- **Transport:** Stateless Streamable HTTP for Kubernetes (scales horizontally, no sticky sessions) or stdio for local use
- **Auth:** Personal Access Token via HTTP Basic auth (`Authorization: Basic base64(:<PAT>)`)
- **API version:** 7.0 — the highest supported by Azure DevOps Server 2022.0.x

---

## Requirements

- Node.js 20+
- Azure DevOps Server 2022 (on-premise)
- A Personal Access Token with:
  - `Code (Read & Write)` — for repo, branch, file, and pull request tools
  - `Build (Read & Execute)` — for pipeline and build tools
  - `Work Items (Read & Write)` — for work item tools

---

## Quick Start

### Local (stdio — for Claude Desktop / Claude Code)

```bash
npm install
npm run build

# Register with Claude Code
claude mcp add azure-devops \
  --env AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  --env AZDO_PAT=your_pat_here \
  --env AZDO_PROJECT=YourProject \
  -- node dist/index.js
```

### Docker

```bash
# Build
docker build -t your-registry/azure-devops-mcp:1.0.0 .

# Run locally for testing
docker run -p 3000:3000 \
  -e AZDO_ORG_URL=https://your-server.example.com/YourCollection \
  -e AZDO_PAT=your_pat_here \
  -e AZDO_PROJECT=YourProject \
  your-registry/azure-devops-mcp:1.0.0
```

### Kubernetes

```bash
# 1. Create namespace
kubectl create namespace mcp-servers

# 2. Create secret (keep PAT out of git)
kubectl create secret generic azure-devops-mcp-secret \
  --namespace mcp-servers \
  --from-literal=AZDO_PAT='your_pat_here'

# 3. Edit k8s/configmap.yaml with your AZDO_ORG_URL and AZDO_PROJECT

# 4. Apply manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 5. Verify
kubectl -n mcp-servers rollout status deploy/azure-devops-mcp
```

In-cluster endpoint:
```
http://azure-devops-mcp.mcp-servers.svc.cluster.local/mcp
```

### Quick test with port-forward

```bash
# Terminal 1
kubectl -n mcp-servers port-forward deploy/azure-devops-mcp 3000:3000

# Terminal 2 — health check
curl http://127.0.0.1:3000/healthz

# Terminal 2 — list projects
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZDO_ORG_URL` | Yes | Collection URL, e.g. `https://your-server.example.com/YourCollection` |
| `AZDO_PAT` | Yes | Personal Access Token |
| `AZDO_PROJECT` | No | Default project — avoids passing project name in every request |
| `AZDO_API_VERSION` | No | Default: `7.0` |
| `MCP_TRANSPORT` | No | `http` for Kubernetes, `stdio` for local (default: `stdio`) |
| `PORT` | No | HTTP port, default: `3000` |
| `MCP_PATH` | No | Endpoint path, default: `/mcp` |

### `.env` example

```env
AZDO_ORG_URL=https://your-server.example.com/YourCollection
AZDO_PAT=your_pat_here
AZDO_PROJECT=YourProject
MCP_TRANSPORT=http
PORT=3000
```

---

## Project Structure

```
src/
├── index.ts          Entry point — selects transport based on MCP_TRANSPORT
├── config.ts         Env var reading and validation
├── server.ts         MCP server construction and tool registration
├── azureClient.ts    REST client with PAT Basic auth and 30s timeout
├── httpServer.ts     Stateless Streamable HTTP transport for Kubernetes
└── tools/
    ├── projects.ts   Project discovery tools
    ├── repos.ts      Repository, branch, and pull request tools
    ├── pipelines.ts  Pipeline and build tools
    ├── workitems.ts  Work item tools (WIQL, create, update)
    └── helpers.ts    Shared utilities (response formatting, truncation)

k8s/
├── configmap.yaml    Non-secret configuration
├── deployment.yaml   Kubernetes Deployment (non-root, read-only FS)
└── service.yaml      ClusterIP Service
```

---

## Technical Notes

- **Stateless HTTP:** Each request creates an independent MCP server instance — scales horizontally without sticky sessions.
- **Health check:** `GET /healthz` for Kubernetes liveness and readiness probes.
- **API version 7.0:** Azure DevOps Server 2022.0.x supports up to 7.0 only. Version 7.1 is available in Azure DevOps Services (cloud) and Server 2022.1+.
- **Response truncation:** Tool responses are capped at 24,000 characters to avoid flooding the model context window.
- **Request timeout:** All Azure DevOps API calls abort after 30 seconds with a clear error message.
- **Container security:** Runs as non-root user 1000, read-only root filesystem, all Linux capabilities dropped.
- **Weak model friendly:** Tools return pre-processed, ready-to-answer data rather than raw JSON — works well with smaller models that struggle to process large API responses.

---

## License

MIT
