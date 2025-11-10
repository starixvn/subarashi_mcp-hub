import { GitLabConfig } from '@/services/gitlab/config.js';
import { Express, Request, Response } from "express";
import { createMCPServer } from "@/lib/mcpServer.js";
import { handleSSEConnection } from "@/lib/sseHandler.js";
import gitlabService from "@/services/gitlab/index.js";
import { sessionRegistry } from "@/lib/sessionRegistry.js";

export function gitlabRoute(app: Express): void {
  // SSE endpoint for GitLab MCP server
  app.get("/gitlab/sse", async (req: Request, res: Response) => {
    console.log("📡 [GitLab] New SSE connection");

    // Require config from headers
    const gitlabUrl = req.headers['x-gitlab-url'] as string | undefined;
    const gitlabToken = req.headers['x-gitlab-token'] as string | undefined;

    // Headers are required - no environment variable fallback
    if (!gitlabUrl || !gitlabToken) {
      res.status(400).json({
        error: "Missing required headers",
        message: "X-GitLab-URL and X-GitLab-Token headers are required",
      });
      return;
    }

    try {
      const config:GitLabConfig ={
        url: gitlabUrl,
        token: gitlabToken,
      };
      console.log(`📡 [GitLab] Using header config: ${config.url}`);
      const executeTool = gitlabService.createExecutor(config);

      const server = createMCPServer({
        name: "gitlab-mcp-server",
        version: "1.0.0",
        tools: gitlabService.tools,
        executeTool,
      });

      await handleSSEConnection(server, req, res);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[GitLab] SSE setup failed: ${errorMessage}`, error);

      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to setup SSE connection" });
      }
    }
  });

  // Message endpoint for this service
  // IMPORTANT: Do not use express.json() or express.text() middleware here
  // The SSEServerTransport.handlePostMessage() needs to read the raw request body
  app.post("/gitlab/message", async (req: Request, res: Response) => {
    // Extract sessionId from query parameters
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      console.error("[GitLab] POST /gitlab/message: Missing sessionId in query");
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }

    // Look up the transport for this session
    const transport = sessionRegistry.get(sessionId);

    if (!transport) {
      console.error(`[GitLab] POST /gitlab/message: Session not found: ${sessionId}`);
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    try {
      // Route the POST message to the correct transport
      // The transport will read the raw body internally
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error(`[GitLab] Error handling POST message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });
}
