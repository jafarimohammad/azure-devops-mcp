import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AzureDevOpsClient } from "./azureClient.js";
import { createMcpServer } from "./server.js";

export interface HttpOptions {
  port: number;
  host: string;
  /** Mount path for the MCP endpoint. */
  path: string;
}

/**
 * Run the MCP server over Streamable HTTP in stateless mode: a fresh
 * McpServer + transport is created per request and torn down afterwards.
 * This is the friendliest mode for Kubernetes — any pod can serve any
 * request, so it scales horizontally behind a Service with no sticky sessions.
 */
export async function startHttpServer(
  client: AzureDevOpsClient,
  opts: HttpOptions
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // Liveness/readiness probe endpoint for Kubernetes.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post(opts.path, async (req, res) => {
    // Stateless: no session id, brand new server per request.
    const server = createMcpServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET/DELETE on the MCP path aren't supported in stateless mode.
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null,
    });
  };
  app.get(opts.path, methodNotAllowed);
  app.delete(opts.path, methodNotAllowed);

  await new Promise<void>((resolve) => {
    app.listen(opts.port, opts.host, () => {
      console.error(
        `azure-devops-mcp listening on http://${opts.host}:${opts.port}${opts.path} (health: /healthz)`
      );
      resolve();
    });
  });
}
