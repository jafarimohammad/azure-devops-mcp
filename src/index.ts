#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { AzureDevOpsClient } from "./azureClient.js";
import { createMcpServer } from "./server.js";
import { startHttpServer } from "./httpServer.js";

async function main() {
  const config = loadConfig();
  const client = new AzureDevOpsClient(config);

  // MCP_TRANSPORT=http runs a networked server (for Kubernetes/containers);
  // anything else (default) uses stdio for local subprocess use.
  const transportKind = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

  if (transportKind === "http") {
    await startHttpServer(client, {
      port: Number(process.env.PORT ?? 3000),
      host: process.env.HOST ?? "0.0.0.0",
      path: process.env.MCP_PATH ?? "/mcp",
    });
  } else {
    const server = createMcpServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdout is reserved for the MCP protocol stream; log to stderr.
    console.error(
      `azure-devops-mcp running (stdio). org=${config.orgUrl} project=${
        config.defaultProject ?? "(none)"
      } api-version=${config.apiVersion}`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error starting azure-devops-mcp:", err);
  process.exit(1);
});
