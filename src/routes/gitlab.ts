import { GitLabConfig } from '@/services/gitlab/config.js';
import { Express, Request, Response } from "express";
import { createMCPServer } from "@/lib/mcpServer.js";
import { handleMCPRequest } from "@/lib/mcpHandler.js";
import gitlabService from "@/services/gitlab/index.js";

export function gitlabRoute(app: Express): void {
  // Single MCP endpoint that handles GET (SSE), POST (messages), and DELETE (session close)
  app.all("/gitlab/mcp", async (req: Request, res: Response) => {
    console.log(`[GitLab] ${req.method} request to /gitlab/mcp`);

    // Require config from headers
    const gitlabUrl = req.headers['x-gitlab-url'] as string | undefined;
    const gitlabToken = req.headers['x-gitlab-token'] as string | undefined;

    // Headers are required - no environment variable fallback
    if (!gitlabUrl || !gitlabToken) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Missing required headers: X-GitLab-URL and X-GitLab-Token are required",
        },
        id: null,
      });
      return;
    }

    try {
      const config: GitLabConfig = {
        url: gitlabUrl,
        token: gitlabToken,
      };
      console.log(`[GitLab] Using header config: ${config.url}`);
      const executeTool = gitlabService.createExecutor(config);

      const server = createMCPServer({
        name: "gitlab-mcp-server",
        version: "1.0.0",
        tools: gitlabService.tools,
        executeTool,
      });

      await handleMCPRequest(server, req, res);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[GitLab] MCP request failed: ${errorMessage}`, error);

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
