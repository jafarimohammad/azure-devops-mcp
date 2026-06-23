import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { projectArg, jsonResult, errorResult } from "./helpers.js";

export function registerReleaseTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "list_release_definitions",
    {
      title: "List release definitions",
      description:
        "List classic release pipeline definitions in a project. " +
        "Use this to discover release pipeline names and IDs before calling list_releases. " +
        "Returns: id, name, environments/stages, last release date.",
      inputSchema: {
        ...projectArg,
        nameFilter: z
          .string()
          .optional()
          .describe("Filter by pipeline name (partial, case-insensitive)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, nameFilter }) => {
      try {
        const data = await client.request("_apis/release/definitions", {
          project,
          query: { $expand: "lastRelease", searchText: nameFilter },
        });

        const defs = (data.value ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          stages: (d.environments ?? []).map((e: any) => e.name),
          lastReleaseId: d.lastRelease?.id ?? null,
          lastReleaseName: d.lastRelease?.name ?? null,
          createdOn: d.createdOn,
          modifiedOn: d.modifiedOn,
        }));

        if (nameFilter) {
          const lower = nameFilter.toLowerCase();
          return jsonResult({
            count: defs.length,
            definitions: defs.filter((d: any) => d.name.toLowerCase().includes(lower)),
          });
        }
        return jsonResult({ count: defs.length, definitions: defs });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_releases",
    {
      title: "List releases",
      description:
        "List releases from a classic release pipeline, with per-stage deployment status. " +
        "Use this to answer: 'آخرین پابلیش روی stage X چه تاریخی بود؟', " +
        "'last release deployed to Shatel', 'last successful deployment to Production', " +
        "'which release is running on staging?'. " +
        "Filter by stageName to get only releases where that stage was attempted. " +
        "Each release shows all stages and their status (succeeded/inProgress/rejected/notStarted).",
      inputSchema: {
        ...projectArg,
        definitionName: z
          .string()
          .optional()
          .describe("Release definition (pipeline) name — partial match. Use list_release_definitions to discover names."),
        definitionId: z
          .number()
          .int()
          .optional()
          .describe("Release definition ID. Use instead of definitionName when you know the ID."),
        stageName: z
          .string()
          .optional()
          .describe(
            "Filter to releases where this stage/environment was deployed. Partial match. " +
            "Example: 'Shatel', 'Production', 'Staging'. " +
            "Only releases where this stage has status succeeded, inProgress, or rejected are returned."
          ),
        stageStatus: z
          .enum(["succeeded", "inProgress", "rejected", "notStarted", "partiallySucceeded", "queued"])
          .optional()
          .describe("Further filter by stage status. Default: any deployed status (succeeded/inProgress/rejected)."),
        top: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Max releases to return. Default: 10."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, definitionName, definitionId, stageName, stageStatus, top }) => {
      try {
        let resolvedDefinitionId = definitionId;

        // Resolve definition name → ID if needed
        if (!resolvedDefinitionId && definitionName) {
          const defs = await client.request("_apis/release/definitions", {
            project,
            query: { searchText: definitionName },
          });
          const lower = definitionName.toLowerCase();
          const match = (defs.value ?? []).find((d: any) =>
            d.name.toLowerCase().includes(lower)
          );
          if (!match) {
            return jsonResult({
              error: `No release definition found matching "${definitionName}". Call list_release_definitions to see available pipelines.`,
            });
          }
          resolvedDefinitionId = match.id;
        }

        const query: Record<string, any> = {
          $top: top ?? 10,
          $expand: "environments",
        };
        if (resolvedDefinitionId) query.definitionId = resolvedDefinitionId;

        const data = await client.request("_apis/release/releases", { project, query });
        let releases: any[] = data.value ?? [];

        // Filter by stage name and status
        if (stageName) {
          const stLower = stageName.toLowerCase();
          const targetStatuses = stageStatus
            ? [stageStatus]
            : ["succeeded", "inProgress", "rejected", "partiallySucceeded", "queued"];

          releases = releases.filter((r: any) => {
            const env = (r.environments ?? []).find((e: any) =>
              e.name.toLowerCase().includes(stLower)
            );
            return env && targetStatuses.includes(env.status);
          });
        }

        const result = releases.map((r: any) => ({
          id: r.id,
          name: r.name,
          createdOn: r.createdOn,
          createdBy: r.createdBy?.displayName,
          status: r.status,
          stages: (r.environments ?? []).map((e: any) => ({
            name: e.name,
            status: e.status,
            deployedOn: e.deploySteps?.slice(-1)[0]?.lastModifiedOn ?? null,
          })),
        }));

        return jsonResult({
          definitionId: resolvedDefinitionId ?? null,
          stageName: stageName ?? null,
          count: result.length,
          releases: result,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_release_changes",
    {
      title: "Get release changes",
      description:
        "Get the list of code changes (commits / TFVC changesets) included in a release. " +
        "Use this to answer: 'چه تغییراتی در این release اعمال شده؟', " +
        "'what was committed in Release-322?', 'which changesets are in this deployment?'. " +
        "Returns each change: changeset/commit ID, message, author, and timestamp.",
      inputSchema: {
        ...projectArg,
        releaseId: z.number().int().describe("Release ID (from list_releases or get_release)."),
        top: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max changes to return. Default: 50."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, releaseId, top }) => {
      try {
        const data = await client.request(`_apis/release/releases/${releaseId}/changes`, {
          project,
          query: { $top: top ?? 50 },
        });

        const changes = (data.value ?? []).map((c: any) => ({
          id: c.id,
          message: c.message,
          author: c.author?.displayName ?? c.pushedBy?.displayName ?? null,
          timestamp: c.timestamp ?? c.pushedAt ?? null,
          type: c.changeType ?? null,
          location: c.location ?? null,
        }));

        return jsonResult({
          releaseId,
          count: changes.length,
          changes,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_release",
    {
      title: "Get release",
      description:
        "Get full details of a single release, including all stage deployment times and statuses. " +
        "Use after list_releases to drill into a specific release. " +
        "To see what code was included, call get_release_changes separately.",
      inputSchema: {
        ...projectArg,
        releaseId: z.number().int().describe("Release ID (from list_releases)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, releaseId }) => {
      try {
        const r = await client.request(`_apis/release/releases/${releaseId}`, { project });
        return jsonResult({
          id: r.id,
          name: r.name,
          status: r.status,
          createdOn: r.createdOn,
          createdBy: r.createdBy?.displayName,
          description: r.description ?? null,
          stages: (r.environments ?? []).map((e: any) => {
            const lastDeploy = e.deploySteps?.slice(-1)[0];
            return {
              name: e.name,
              status: e.status,
              rank: e.rank,
              scheduledDeploymentTime: e.scheduledDeploymentTime ?? null,
              deployStartedOn: lastDeploy?.queuedOn ?? null,
              deployCompletedOn: lastDeploy?.lastModifiedOn ?? null,
              deployedBy: lastDeploy?.requestedFor?.displayName ?? null,
            };
          }),
          artifacts: (r.artifacts ?? []).map((a: any) => ({
            alias: a.alias,
            buildId: a.definitionReference?.version?.id,
            buildName: a.definitionReference?.version?.name,
            branch: a.definitionReference?.branch?.name ?? null,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
