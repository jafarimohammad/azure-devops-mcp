import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { projectArg, jsonResult, errorResult } from "./helpers.js";

/**
 * Registers Pipelines and Build tools.
 * Uses both the newer /_apis/pipelines endpoints and the classic
 * /_apis/build/builds endpoints, since Azure DevOps Server 2022 exposes both.
 */
export function registerPipelineTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "get_last_build",
    {
      title: "Get last build status",
      description:
        "Get the status and result of the most recent build in a project. " +
        "Use this to answer questions like 'what is the last pipeline status?', " +
        "'did the last build succeed?', 'what ran last?'. " +
        "Optionally filter by pipeline name (partial match). " +
        "Returns: buildNumber, status (inProgress/completed), result (succeeded/failed/partiallySucceeded/canceled), " +
        "pipeline name, branch, who triggered it, and start/finish time.",
      inputSchema: {
        ...projectArg,
        pipelineName: z
          .string()
          .optional()
          .describe("Filter by pipeline name (partial, case-insensitive). Omit to get the last build across all pipelines."),
      },
    },
    async ({ project, pipelineName }) => {
      try {
        // First get the list of builds sorted by queue time descending.
        const data = await client.request("_apis/build/builds", {
          project,
          query: {
            "$top": 50,
            queryOrder: "queueTimeDescending",
          },
        });

        let builds: any[] = data.value ?? [];

        if (pipelineName) {
          const lower = pipelineName.toLowerCase();
          builds = builds.filter((b: any) =>
            b.definition?.name?.toLowerCase().includes(lower)
          );
        }

        if (builds.length === 0) {
          return jsonResult({
            message: pipelineName
              ? `No builds found for pipeline matching "${pipelineName}".`
              : "No builds found in this project.",
          });
        }

        const last = builds[0];
        return jsonResult({
          buildId: last.id,
          buildNumber: last.buildNumber,
          status: last.status,
          result: last.result ?? "in progress",
          pipeline: last.definition?.name,
          branch: last.sourceBranch?.replace(/^refs\/heads\//, ""),
          requestedBy: last.requestedFor?.displayName,
          queueTime: last.queueTime,
          startTime: last.startTime,
          finishTime: last.finishTime,
          url: last._links?.web?.href,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_failed_builds",
    {
      title: "List failed builds",
      description:
        "Find builds that failed or partially succeeded in the last N hours. " +
        "Use this for questions like 'آیا build شکست‌خورده‌ای داشتیم؟', " +
        "'failed builds in the last 24 hours', 'what broke today?', 'build failures this week'. " +
        "Returns: pipeline name, result, branch, who triggered it, and when it ran.",
      inputSchema: {
        ...projectArg,
        hours: z
          .number()
          .positive()
          .optional()
          .describe("Look back this many hours. Default: 24."),
        includePartial: z
          .boolean()
          .optional()
          .describe("Include partiallySucceeded builds. Default: true."),
        top: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max builds to return. Default: 50."),
      },
    },
    async ({ project, hours, includePartial, top }) => {
      try {
        const lookbackHours = hours ?? 24;
        const minTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
        const withPartial = includePartial !== false;
        const resultFilter = withPartial ? "failed,partiallySucceeded" : "failed";

        const data = await client.request("_apis/build/builds", {
          project,
          query: {
            minTime,
            resultFilter,
            statusFilter: "completed",   // resultFilter is only valid on completed builds
            "$top": top ?? 50,
            queryOrder: "finishTimeDescending",  // queueTimeDescending is invalid with statusFilter=completed
          },
        });

        const builds = (data.value ?? []).map((b: any) => ({
          buildId: b.id,
          buildNumber: b.buildNumber,
          result: b.result,
          pipeline: b.definition?.name,
          branch: b.sourceBranch?.replace(/^refs\/heads\//, ""),
          requestedBy: b.requestedFor?.displayName,
          startTime: b.startTime,
          finishTime: b.finishTime,
          url: b._links?.web?.href,
        }));

        return jsonResult({
          lookbackHours,
          since: minTime,
          failedCount: builds.length,
          builds,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_pipelines",
    {
      title: "List pipelines",
      description: "List pipelines defined in a project.",
      inputSchema: { ...projectArg },
    },
    async ({ project }) => {
      try {
        const data = await client.request("_apis/pipelines", { project });
        const pipelines = (data.value ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          folder: p.folder,
          revision: p.revision,
          url: p.url,
        }));
        return jsonResult({ count: pipelines.length, pipelines });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_builds",
    {
      title: "List builds",
      description: "List recent builds in a project, optionally filtered by pipeline/definition.",
      inputSchema: {
        ...projectArg,
        definitionId: z
          .number()
          .int()
          .optional()
          .describe("Filter by pipeline/definition id."),
        top: z.number().int().positive().max(200).optional().describe("Max builds to return."),
        statusFilter: z
          .enum(["inProgress", "completed", "cancelling", "postponed", "notStarted", "all"])
          .optional()
          .describe("Filter by build status."),
      },
    },
    async ({ project, definitionId, top, statusFilter }) => {
      try {
        const data = await client.request("_apis/build/builds", {
          project,
          query: {
            definitions: definitionId,
            "$top": top ?? 20,
            statusFilter: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
            queryOrder: "queueTimeDescending",
          },
        });
        const builds = (data.value ?? []).map(summarizeBuild);
        return jsonResult({ count: builds.length, builds });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_build",
    {
      title: "Get build",
      description: "Get details of a single build by id.",
      inputSchema: {
        ...projectArg,
        buildId: z.number().int().describe("Build id."),
      },
    },
    async ({ project, buildId }) => {
      try {
        const data = await client.request(`_apis/build/builds/${buildId}`, { project });
        return jsonResult(summarizeBuild(data, true));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_build_logs",
    {
      title: "Get build logs",
      description:
        "Fetch the console log output of a build. " +
        "Use this when the user asks for build logs, error details, failure reason, or what went wrong in a build. " +
        "Returns log text per stage/task. Large logs are automatically truncated to the last 150 lines per entry.",
      inputSchema: {
        ...projectArg,
        buildId: z.number().int().describe("Build id (from get_last_build or list_builds)."),
        maxLinesPerEntry: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max lines to return per log entry. Default: 150."),
      },
    },
    async ({ project, buildId, maxLinesPerEntry }) => {
      try {
        const limit = maxLinesPerEntry ?? 150;

        // 1. Get list of log entries for this build.
        const logList = await client.request(`_apis/build/builds/${buildId}/logs`, { project });
        const entries: any[] = logList.value ?? [];

        if (entries.length === 0) {
          return jsonResult({ message: "No logs found for this build." });
        }

        // 2. Fetch content of each entry; use startLine to get only the tail.
        const results: { id: number; lines: string }[] = [];
        for (const entry of entries) {
          try {
            // Request content as plain text.
            const text = await client.request(
              `_apis/build/builds/${buildId}/logs/${entry.id}`,
              {
                project,
                query: { "$format": "text" },
                apiVersion: "7.0",
              }
            );
            const lines: string[] = (typeof text === "string" ? text : JSON.stringify(text))
              .split("\n");
            const tail = lines.slice(-limit).join("\n");
            results.push({ id: entry.id, lines: tail });
          } catch {
            // skip unreadable log entries
          }
        }

        return jsonResult({ buildId, logCount: entries.length, logs: results });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "run_pipeline_by_name",
    {
      title: "Run pipeline by name",
      description:
        "Find a pipeline by name and run it. " +
        "Use this when the user says 'run pipeline X', 'اجرا کن pipeline X', 'trigger X'. " +
        "Searches for the pipeline by partial name match, then queues a run automatically. " +
        "No need to call list_pipelines first.",
      inputSchema: {
        ...projectArg,
        pipelineName: z
          .string()
          .describe("Pipeline name or partial name to search for, e.g. 'mdp-monitoring-service [alpha]'."),
        branch: z
          .string()
          .optional()
          .describe("Branch to run on (without refs/heads/). Defaults to pipeline default."),
      },
    },
    async ({ project, pipelineName, branch }) => {
      try {
        // Search for the pipeline by name.
        const listData = await client.request("_apis/pipelines", { project });
        const all: any[] = listData.value ?? [];
        const lower = pipelineName.toLowerCase();
        const matches = all.filter((p: any) =>
          p.name?.toLowerCase().includes(lower)
        );

        if (matches.length === 0) {
          return jsonResult({
            error: `No pipeline found matching "${pipelineName}". Available pipelines: ${all.slice(0, 10).map((p: any) => p.name).join(", ")}...`,
          });
        }
        if (matches.length > 1) {
          return jsonResult({
            error: `Multiple pipelines match "${pipelineName}". Please be more specific.`,
            matches: matches.map((p: any) => ({ id: p.id, name: p.name, folder: p.folder })),
          });
        }

        const pipeline = matches[0];
        const body: Record<string, unknown> = {};
        if (branch) {
          body.resources = {
            repositories: { self: { refName: `refs/heads/${branch}` } },
          };
        }

        const data = await client.request(`_apis/pipelines/${pipeline.id}/runs`, {
          project,
          method: "POST",
          body,
        });

        return jsonResult({
          message: `Pipeline "${pipeline.name}" queued successfully.`,
          runId: data.id,
          name: data.name,
          state: data.state,
          webUrl: data._links?.web?.href,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "run_pipeline",
    {
      title: "Run pipeline",
      description: "Queue a new run of a pipeline by its numeric id. Use run_pipeline_by_name if you only know the name.",
      inputSchema: {
        ...projectArg,
        pipelineId: z.number().int().describe("Pipeline id (from list_pipelines)."),
        branch: z
          .string()
          .optional()
          .describe("Branch to run against, without refs/heads/. Defaults to the pipeline default."),
      },
    },
    async ({ project, pipelineId, branch }) => {
      try {
        const body: Record<string, unknown> = {};
        if (branch) {
          body.resources = {
            repositories: { self: { refName: `refs/heads/${branch}` } },
          };
        }
        const data = await client.request(`_apis/pipelines/${pipelineId}/runs`, {
          project,
          method: "POST",
          body,
        });
        return jsonResult({
          runId: data.id,
          name: data.name,
          state: data.state,
          result: data.result,
          url: data.url,
          webUrl: data._links?.web?.href,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

function summarizeBuild(b: any, detailed = false) {
  const base = {
    id: b.id,
    buildNumber: b.buildNumber,
    status: b.status,
    result: b.result,
    definition: b.definition?.name,
    sourceBranch: b.sourceBranch,
    requestedFor: b.requestedFor?.displayName,
    queueTime: b.queueTime,
    startTime: b.startTime,
    finishTime: b.finishTime,
  };
  if (!detailed) return base;
  return { ...base, reason: b.reason, sourceVersion: b.sourceVersion, url: b._links?.web?.href };
}
