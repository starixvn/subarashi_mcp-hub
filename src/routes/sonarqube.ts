import { Express, Request, Response } from "express";
import { createMCPServer } from "@/lib/mcpServer.js";
import { handleMCPRequest } from "@/lib/mcpHandler.js";
import sonarqubeService from "@/services/sonarqube/index.js";
import { SonarQubeConfig } from "@/services/sonarqube/config.js";

export function sonarqubeRoute(app: Express): void {
  // Single MCP endpoint that handles GET (SSE), POST (messages), and DELETE (session close)
  app.all("/sonarqube/mcp", async (req: Request, res: Response) => {
    console.log(`[SonarQube] ${req.method} request to /sonarqube/mcp`);

    // Require config from headers
    const sonarqubeUrl = req.headers['x-sonarqube-url'] as string | undefined;
    const sonarqubeToken = req.headers['x-sonarqube-token'] as string | undefined;

    // Headers are required - no environment variable fallback
    if (!sonarqubeUrl || !sonarqubeToken) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Missing required headers: X-SonarQube-URL and X-SonarQube-Token are required",
        },
        id: null,
      });
      return;
    }

    try {
      const config: SonarQubeConfig = {
        url: sonarqubeUrl,
        token: sonarqubeToken,
      };
      console.log(`[SonarQube] Using header config: ${config.url}`);
      const executeTool = sonarqubeService.createExecutor(config);

      const server = createMCPServer({
        name: "sonarqube-mcp-server",
        version: "1.0.0",
        tools: sonarqubeService.tools,
        executeTool,
      });

      await handleMCPRequest(server, req, res);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SonarQube] MCP request failed: ${errorMessage}`, error);

      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Failed to handle MCP request",
          },
          id: null,
        });
      }
    }
  });
}
