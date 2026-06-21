import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { projectArg, jsonResult, errorResult } from "./helpers.js";

const WORK_ITEM_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.AssignedTo",
  "System.CreatedDate",
  "System.ChangedDate",
  "System.Description",
  "System.AreaPath",
  "System.IterationPath",
  "Microsoft.VSTS.Common.Priority",
].join(",");

function summarizeWorkItem(wi: any) {
  const f = wi.fields ?? {};
  const assignedTo = f["System.AssignedTo"];
  return {
    id: wi.id,
    type: f["System.WorkItemType"],
    title: f["System.Title"],
    state: f["System.State"],
    assignedTo: assignedTo?.displayName ?? assignedTo ?? null,
    priority: f["Microsoft.VSTS.Common.Priority"] ?? null,
    areaPath: f["System.AreaPath"] ?? null,
    iterationPath: f["System.IterationPath"] ?? null,
    createdDate: f["System.CreatedDate"],
    changedDate: f["System.ChangedDate"],
    url: wi._links?.html?.href ?? wi.url,
  };
}

export function registerWorkItemTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "list_work_items",
    {
      title: "List work items",
      description:
        "Query work items in a project. " +
        "Use this for: 'show open bugs', 'list tasks assigned to me', 'what user stories are in sprint', " +
        "'how many active issues are there?'. " +
        "Filter by type (Bug, Task, User Story, Epic, Feature), state (Active, New, Resolved, Closed), " +
        "or assignee. Returns id, title, state, assignedTo, priority, and URL.",
      inputSchema: {
        ...projectArg,
        type: z
          .string()
          .optional()
          .describe(
            "Work item type: Bug, Task, 'User Story', Epic, Feature, Issue. Omit for all types."
          ),
        state: z
          .string()
          .optional()
          .describe("State filter: Active, New, Resolved, Closed, Done. Omit for all states."),
        assignedTo: z
          .string()
          .optional()
          .describe(
            "Filter by assignee display name or email (exact or partial). Omit for all assignees."
          ),
        top: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Max items to return. Default: 50."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project, type, state, assignedTo, top }) => {
      try {
        const limit = top ?? 50;
        const conditions: string[] = ["[System.TeamProject] = @project"];

        if (type) {
          conditions.push(`[System.WorkItemType] = '${type.replace(/'/g, "''")}'`);
        }
        if (state) {
          conditions.push(`[System.State] = '${state.replace(/'/g, "''")}'`);
        }
        if (assignedTo) {
          conditions.push(`[System.AssignedTo] CONTAINS '${assignedTo.replace(/'/g, "''")}'`);
        }

        const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(
          " AND "
        )} ORDER BY [System.ChangedDate] DESC`;

        const wiqlResult = await client.request("_apis/wit/wiql", {
          project,
          method: "POST",
          body: { query: wiql },
          query: { "$top": limit },
        });

        const ids: number[] = (wiqlResult.workItems ?? []).slice(0, limit).map((w: any) => w.id);

        if (ids.length === 0) {
          return jsonResult({ count: 0, workItems: [] });
        }

        const data = await client.request("_apis/wit/workitems", {
          project,
          query: { ids: ids.join(","), fields: WORK_ITEM_FIELDS },
        });

        const items = (data.value ?? []).map(summarizeWorkItem);
        return jsonResult({ count: items.length, workItems: items });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_work_item",
    {
      title: "Get work item",
      description:
        "Get full details of a single work item by its numeric id. " +
        "Use when you have an id and need the title, state, description, assignee, and priority.",
      inputSchema: {
        ...projectArg,
        id: z.number().int().describe("Work item numeric id."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project, id }) => {
      try {
        const data = await client.request(`_apis/wit/workitems/${id}`, {
          project,
          query: { fields: WORK_ITEM_FIELDS },
        });
        return jsonResult(summarizeWorkItem(data));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "create_work_item",
    {
      title: "Create work item",
      description:
        "Create a new work item (Bug, Task, User Story, etc.) in a project. " +
        "Use when asked: 'create a bug', 'add a task', 'log an issue', 'open a new user story'. " +
        "Returns the new item's id, state, and URL.",
      inputSchema: {
        ...projectArg,
        type: z
          .string()
          .describe("Work item type: Bug, Task, 'User Story', Epic, Feature, Issue."),
        title: z.string().describe("Title of the work item."),
        description: z
          .string()
          .optional()
          .describe("Detailed description (plain text or HTML)."),
        assignedTo: z
          .string()
          .optional()
          .describe("Assignee email address or display name."),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Priority: 1 = highest, 4 = lowest."),
        iterationPath: z
          .string()
          .optional()
          .describe("Iteration/sprint path, e.g. 'MyProject\\\\Sprint 1'."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project, type, title, description, assignedTo, priority, iterationPath }) => {
      try {
        const patch: Array<{ op: string; path: string; value: unknown }> = [
          { op: "add", path: "/fields/System.Title", value: title },
        ];

        if (description) {
          patch.push({ op: "add", path: "/fields/System.Description", value: description });
        }
        if (assignedTo) {
          patch.push({ op: "add", path: "/fields/System.AssignedTo", value: assignedTo });
        }
        if (priority) {
          patch.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Priority",
            value: priority,
          });
        }
        if (iterationPath) {
          patch.push({ op: "add", path: "/fields/System.IterationPath", value: iterationPath });
        }

        const data = await client.request(
          `_apis/wit/workitems/$${encodeURIComponent(type)}`,
          {
            project,
            method: "POST",
            body: patch,
            contentType: "application/json-patch+json",
          }
        );

        return jsonResult({
          id: data.id,
          type: data.fields?.["System.WorkItemType"],
          title: data.fields?.["System.Title"],
          state: data.fields?.["System.State"],
          url: data._links?.html?.href ?? data.url,
          message: `Work item #${data.id} created successfully.`,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update work item",
      description:
        "Update fields of an existing work item. " +
        "Use for: 'close bug #42', 'assign task #10 to John', 'resolve issue #7', " +
        "'set priority of #5 to 1', 'add a comment to #20'. " +
        "Only provide fields you want to change.",
      inputSchema: {
        ...projectArg,
        id: z.number().int().describe("Work item id to update."),
        title: z.string().optional().describe("New title."),
        state: z
          .string()
          .optional()
          .describe("New state: Active, New, Resolved, Closed, Done."),
        assignedTo: z
          .string()
          .optional()
          .describe("New assignee email or display name."),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("New priority: 1 = highest, 4 = lowest."),
        comment: z
          .string()
          .optional()
          .describe("Comment to add to the work item history."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project, id, title, state, assignedTo, priority, comment }) => {
      try {
        const patch: Array<{ op: string; path: string; value: unknown }> = [];

        if (title) patch.push({ op: "add", path: "/fields/System.Title", value: title });
        if (state) patch.push({ op: "add", path: "/fields/System.State", value: state });
        if (assignedTo) {
          patch.push({ op: "add", path: "/fields/System.AssignedTo", value: assignedTo });
        }
        if (priority) {
          patch.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Priority",
            value: priority,
          });
        }
        if (comment) {
          patch.push({ op: "add", path: "/fields/System.History", value: comment });
        }

        if (patch.length === 0) {
          return jsonResult({ message: "No fields to update were provided." });
        }

        const data = await client.request(`_apis/wit/workitems/${id}`, {
          project,
          method: "PATCH",
          body: patch,
          contentType: "application/json-patch+json",
        });

        return jsonResult({
          id: data.id,
          title: data.fields?.["System.Title"],
          state: data.fields?.["System.State"],
          assignedTo: data.fields?.["System.AssignedTo"]?.displayName ?? null,
          url: data._links?.html?.href ?? data.url,
          message: `Work item #${data.id} updated successfully.`,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
