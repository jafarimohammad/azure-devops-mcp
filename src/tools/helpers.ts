import { z } from "zod";

/** Optional project override accepted by every tool. */
export const projectArg = {
  project: z
    .string()
    .optional()
    .describe(
      "Azure DevOps project name or id. " +
      "Omit if AZDO_PROJECT env var is configured — the server uses it as the default. " +
      "If the project name is unknown, call list_projects first to discover available projects."
    ),
};

/** Max characters returned in a single tool response to avoid flooding the model context. */
export const CHARACTER_LIMIT = 24_000;

/** Standard MCP tool result wrapping a JSON-serialisable value as pretty text. */
export function jsonResult(value: unknown) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      `\n\n[Response truncated at ${CHARACTER_LIMIT} characters. Use filters or pagination to narrow results.]`;
  }
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** Standard MCP error result. */
export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}
