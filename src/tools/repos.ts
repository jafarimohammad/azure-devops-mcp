import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { projectArg, jsonResult, errorResult } from "./helpers.js";

/**
 * Registers Git repository and pull-request tools.
 * Endpoints documented under /_apis/git of the Azure DevOps REST API.
 */
export function registerRepoTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "list_repositories",
    {
      title: "List repositories",
      description: "List all Git repositories in a project.",
      inputSchema: { ...projectArg },
    },
    async ({ project }) => {
      try {
        const data = await client.request("_apis/git/repositories", { project });
        const repos = (data.value ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          defaultBranch: r.defaultBranch,
          webUrl: r.webUrl,
          size: r.size,
        }));
        return jsonResult({ count: repos.length, repositories: repos });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_branches",
    {
      title: "List branches",
      description: "List branches (refs/heads) of a repository.",
      inputSchema: {
        ...projectArg,
        repositoryId: z.string().describe("Repository id or name."),
      },
    },
    async ({ project, repositoryId }) => {
      try {
        const data = await client.request(
          `_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs`,
          { project, query: { filter: "heads/" } }
        );
        const branches = (data.value ?? []).map((r: any) => ({
          name: r.name.replace(/^refs\/heads\//, ""),
          objectId: r.objectId,
        }));
        return jsonResult({ count: branches.length, branches });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_file_content",
    {
      title: "Get file content",
      description: "Read the content of a file from a repository at an optional branch.",
      inputSchema: {
        ...projectArg,
        repositoryId: z.string().describe("Repository id or name."),
        path: z.string().describe("File path within the repo, e.g. /src/index.ts"),
        branch: z
          .string()
          .optional()
          .describe("Branch name (without refs/heads/). Defaults to the repo default branch."),
      },
    },
    async ({ project, repositoryId, path, branch }) => {
      try {
        const query: Record<string, string> = {
          path,
          includeContent: "true",
          "$format": "json",
        };
        if (branch) {
          query["versionDescriptor.version"] = branch;
          query["versionDescriptor.versionType"] = "branch";
        }
        const data = await client.request(
          `_apis/git/repositories/${encodeURIComponent(repositoryId)}/items`,
          { project, query }
        );
        return jsonResult({ path: data.path, content: data.content });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_pull_requests",
    {
      title: "List pull requests",
      description:
        "List pull requests across ALL repositories in a project, or filter to one repository. " +
        "Use this for questions like 'show all open PRs', 'which PRs have no reviewer', " +
        "'list PRs in project X'. " +
        "Leave repositoryId empty to search the whole project at once.",
      inputSchema: {
        ...projectArg,
        repositoryId: z
          .string()
          .optional()
          .describe("Repository id or name. Omit to get PRs across all repositories in the project."),
        status: z
          .enum(["active", "completed", "abandoned", "all"])
          .optional()
          .describe("PR status filter. Default: active."),
        top: z.number().int().positive().max(200).optional().describe("Max PRs to return. Default: 100."),
      },
    },
    async ({ project, repositoryId, status, top }) => {
      try {
        // Project-level endpoint returns PRs across all repos when no repositoryId is given.
        const path = repositoryId
          ? `_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullrequests`
          : `_apis/git/pullrequests`;

        const data = await client.request(path, {
          project,
          query: {
            "searchCriteria.status": status ?? "active",
            "$top": top ?? 100,
          },
        });
        const prs = (data.value ?? []).map(summarizePr);

        // Flag PRs with no reviewers assigned.
        const withReviewerFlag = prs.map((pr: any) => ({
          ...pr,
          hasReviewers: Array.isArray((pr as any).reviewers)
            ? (pr as any).reviewers.length > 0
            : undefined,
        }));

        const noReviewer = withReviewerFlag.filter((pr: any) => pr.hasReviewers === false);

        return jsonResult({
          count: prs.length,
          withoutReviewer: noReviewer.length,
          pullRequests: withReviewerFlag,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_prs_without_reviewer",
    {
      title: "List PRs without reviewer",
      description:
        "Find open pull requests that have no reviewer assigned, optionally within a time window. " +
        "Use this for: 'which PRs have no reviewer?', 'unreviewed PRs in last 24 hours', " +
        "'PRs waiting for review this week'. " +
        "Use the hours parameter to filter by creation date (e.g. hours=24 for last 24 hours). " +
        "Omit hours to return all open PRs without a reviewer regardless of age.",
      inputSchema: {
        ...projectArg,
        hours: z
          .number()
          .positive()
          .optional()
          .describe("Only include PRs created in the last N hours. Omit for all time."),
        top: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max PRs to fetch. Default: 200."),
      },
    },
    async ({ project, hours, top }) => {
      try {
        const data = await client.request("_apis/git/pullrequests", {
          project,
          query: {
            "searchCriteria.status": "active",
            "$top": top ?? 200,
          },
        });

        const all: any[] = data.value ?? [];

        // Filter by creation date if hours is specified.
        const minDate = hours
          ? new Date(Date.now() - hours * 60 * 60 * 1000)
          : null;

        const filtered = all.filter((pr: any) => {
          const noReviewer = !pr.reviewers || pr.reviewers.length === 0;
          if (!noReviewer) return false;
          if (minDate && new Date(pr.creationDate) < minDate) return false;
          return true;
        });

        const result = filtered.map((pr: any) => ({
          pullRequestId: pr.pullRequestId,
          title: pr.title,
          repository: pr.repository?.name,
          createdBy: pr.createdBy?.displayName,
          sourceBranch: pr.sourceRefName?.replace(/^refs\/heads\//, ""),
          targetBranch: pr.targetRefName?.replace(/^refs\/heads\//, ""),
          creationDate: pr.creationDate,
          webUrl: pr._links?.web?.href ?? pr.url,
        }));

        return jsonResult({
          totalChecked: all.length,
          hoursFilter: hours ?? null,
          withoutReviewer: result.length,
          pullRequests: result,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_pull_request",
    {
      title: "Get pull request",
      description: "Get details of a single pull request by id.",
      inputSchema: {
        ...projectArg,
        repositoryId: z.string().describe("Repository id or name."),
        pullRequestId: z.number().int().describe("Pull request id."),
      },
    },
    async ({ project, repositoryId, pullRequestId }) => {
      try {
        const data = await client.request(
          `_apis/git/repositories/${encodeURIComponent(
            repositoryId
          )}/pullrequests/${pullRequestId}`,
          { project }
        );
        return jsonResult(summarizePr(data, true));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "create_pull_request",
    {
      title: "Create pull request",
      description: "Create a new pull request from a source branch into a target branch.",
      inputSchema: {
        ...projectArg,
        repositoryId: z.string().describe("Repository id or name."),
        sourceBranch: z.string().describe("Source branch name (without refs/heads/)."),
        targetBranch: z.string().describe("Target branch name (without refs/heads/)."),
        title: z.string().describe("Pull request title."),
        description: z.string().optional().describe("Pull request description."),
        isDraft: z.boolean().optional().describe("Create as a draft PR. Default: false."),
      },
    },
    async ({ project, repositoryId, sourceBranch, targetBranch, title, description, isDraft }) => {
      try {
        const data = await client.request(
          `_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullrequests`,
          {
            project,
            method: "POST",
            body: {
              sourceRefName: `refs/heads/${sourceBranch}`,
              targetRefName: `refs/heads/${targetBranch}`,
              title,
              description,
              isDraft: isDraft ?? false,
            },
          }
        );
        return jsonResult(summarizePr(data, true));
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

function summarizePr(pr: any, detailed = false) {
  const reviewers = (pr.reviewers ?? []).map((r: any) => ({
    displayName: r.displayName,
    vote: r.vote,
  }));

  const base = {
    pullRequestId: pr.pullRequestId,
    title: pr.title,
    status: pr.status,
    isDraft: pr.isDraft,
    createdBy: pr.createdBy?.displayName,
    repository: pr.repository?.name,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    creationDate: pr.creationDate,
    reviewers,
    webUrl: pr.url,
  };
  if (!detailed) return base;
  return { ...base, description: pr.description, mergeStatus: pr.mergeStatus };
}
