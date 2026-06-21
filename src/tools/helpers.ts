import { z } from "zod";

/** Optional project override accepted by every tool. */
export const projectArg = {
  project: z
    .string()
    .optional()
    .describe("Azure DevOps project name or id. Defaults to AZDO_PROJECT if set."),
};

/** Standard MCP tool result wrapping a JSON-serialisable value as pretty text. */
export function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
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
