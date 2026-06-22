import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { projectArg, jsonResult, errorResult } from "./helpers.js";

export function registerPipelineTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "get_last_build",
    {
      title: "Get last build status",
      description:
        "Get the status and result of the most recent build in a project. " +
        "Use this to answer questions like 'what is the last pipeline status?', " +
        "'did the last build succeed?', 'what ran last?', " +
        "'what was the last build on agent pool X?', 'last pipeline run on agent win19-prod-bi'. " +
        "Optionally filter by pipeline name (partial match) or agent pool name. " +
        "Returns: buildNumber, status, result, pipeline name, branch, agent pool, who triggered it, and start/finish time.",
      inputSchema: {
        ...projectArg,
        pipelineName: z
          .string()
          .optional()
          .describe("Filter by pipeline name (partial, case-insensitive). Omit to get the last build across all pipelines."),
        agentPoolName: z
          .string()
          .optional()
          .describe("Filter by agent pool name (exact or partial match), e.g. 'win19-prod-bi'. Use list_agent_pools to discover available pools."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project, pipelineName, agentPoolName }) => {
      try {
        const query: Record<string, any> = {
          "$top": 200,
          queryOrder: "queueTimeDescending",
        };

        // Resolve agent pool name → queue ID so the API can filter server-side
        if (agentPoolName) {
          const queues = await client.request("_apis/distributedtask/queues", {
            project,
            query: { queueName: agentPoolName },
          });
          const queue = (queues.value ?? []).find((q: any) =>
            q.name?.toLowerCase().includes(agentPoolName.toLowerCase())
          );
          if (!queue) {
            return jsonResult({
              error: `No agent pool found matching "${agentPoolName}". Call list_agent_pools to see available pools.`,
            });
          }
          query.queues = queue.id;
        }

        const data = await client.request("_apis/build/builds", { project, query });
        let builds: any[] = data.value ?? [];

        if (pipelineName) {
          const lower = pipelineName.toLowerCase();
          builds = builds.filter((b: any) =>
            b.definition?.name?.toLowerCase().includes(lower)
          );
        }

        if (builds.length === 0) {
          return jsonResult({
            message: agentPoolName
              ? `No builds found on agent pool "${agentPoolName}"${pipelineName ? ` for pipeline matching "${pipelineName}"` : ""}.`
              : pipelineName
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
          agentPool: last.queue?.name,
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
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
            statusFilter: "completed",
            "$top": top ?? 50,
            queryOrder: "finishTimeDescending",
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
      description:
        "List builds in a project, optionally filtered by pipeline, status, agent pool, or date range. " +
        "Use minTime/maxTime to count builds in a specific period — e.g. to compare this week vs last week. " +
        "When date filters are used, top is automatically raised to 500 to avoid missing builds. " +
        "Use agentPoolName to answer 'show builds that ran on agent pool X'.",
      inputSchema: {
        ...projectArg,
        definitionId: z
          .number()
          .int()
          .optional()
          .describe("Filter by pipeline/definition id."),
        agentPoolName: z
          .string()
          .optional()
          .describe("Filter by agent pool name (partial match), e.g. 'win19-prod-bi'. Use list_agent_pools to discover pool names."),
        minTime: z
          .string()
          .optional()
          .describe("Return builds queued on or after this ISO 8601 date-time, e.g. '2026-06-15T00:00:00Z'."),
        maxTime: z
          .string()
          .optional()
          .describe("Return builds queued before or on this ISO 8601 date-time, e.g. '2026-06-22T00:00:00Z'."),
        top: z.number().int().positive().max(2000).optional().describe("Max builds to return. Default: 20 (500 when minTime/maxTime are set)."),
        statusFilter: z
          .enum(["inProgress", "completed", "cancelling", "postponed", "notStarted", "all"])
          .optional()
          .describe("Filter by build status."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project, definitionId, agentPoolName, minTime, maxTime, top, statusFilter }) => {
      try {
        const defaultTop = minTime || maxTime ? 500 : 20;
        const query: Record<string, any> = {
          definitions: definitionId,
          "$top": top ?? defaultTop,
          statusFilter: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
          queryOrder: "queueTimeDescending",
          minTime,
          maxTime,
        };

        if (agentPoolName) {
          const queues = await client.request("_apis/distributedtask/queues", {
            project,
            query: { queueName: agentPoolName },
          });
          const queue = (queues.value ?? []).find((q: any) =>
            q.name?.toLowerCase().includes(agentPoolName.toLowerCase())
          );
          if (!queue) {
            return jsonResult({
              error: `No agent pool found matching "${agentPoolName}". Call list_agent_pools to see available pools.`,
            });
          }
          query.queues = queue.id;
        }

        const data = await client.request("_apis/build/builds", { project, query });
        const builds = (data.value ?? []).map(summarizeBuild);
        return jsonResult({ count: builds.length, minTime: minTime ?? null, maxTime: maxTime ?? null, builds });
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project, buildId, maxLinesPerEntry }) => {
      try {
        const limit = maxLinesPerEntry ?? 150;

        const logList = await client.request(`_apis/build/builds/${buildId}/logs`, { project });
        const entries: any[] = logList.value ?? [];

        if (entries.length === 0) {
          return jsonResult({ message: "No logs found for this build." });
        }

        const results: { id: number; lines: string }[] = [];
        for (const entry of entries) {
          try {
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
    "list_agent_pools",
    {
      title: "List agent pools",
      description:
        "List all agent pools (queues) available in a project. " +
        "Use this to discover pool names when the user asks about a specific agent pool, " +
        "or before calling get_last_build / list_builds with agentPoolName.",
      inputSchema: { ...projectArg },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project }) => {
      try {
        // Try project-level queues first; fall back to collection-level pools.
        let pools: any[] = [];
        try {
          const queues = await client.request("_apis/distributedtask/queues", { project });
          pools = (queues.value ?? []).map((q: any) => ({
            id: q.id,
            name: q.name,
            isHosted: q.pool?.isHosted ?? false,
          }));
        } catch {
          // Fall back to collection-level pools (requires Agent Pools read permission)
          const collPools = await client.request("_apis/distributedtask/pools", { raw: true });
          pools = (collPools.value ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            isHosted: p.isHosted ?? false,
          }));
        }
        return jsonResult({ count: pools.length, agentPools: pools });
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
          .describe("Pipeline name or partial name to search for."),
        branch: z
          .string()
          .optional()
          .describe("Branch to run on (without refs/heads/). Defaults to pipeline default."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project, pipelineName, branch }) => {
      try {
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
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
