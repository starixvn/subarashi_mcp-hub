import { Express, Request, Response } from "express";
import { createMCPServer } from "@/lib/mcpServer.js";
import { handleSSEConnection } from "@/lib/sseHandler.js";
import sonarqubeService from "@/services/sonarqube/index.js";
import { SonarQubeConfig } from "@/services/sonarqube/config.js";
import { sessionRegistry } from "@/lib/sessionRegistry.js";

export function sonarqubeRoute(app: Express): void {
  // SSE endpoint for SonarQube MCP server
  app.get("/sonarqube/sse", async (req: Request, res: Response) => {
    console.log("📡 [SonarQube] New SSE connection");

    // Require config from headers
    const sonarqubeUrl = req.headers['x-sonarqube-url'] as string | undefined;
    const sonarqubeToken = req.headers['x-sonarqube-token'] as string | undefined;

    // Headers are required - no environment variable fallback
    if (!sonarqubeUrl || !sonarqubeToken) {
      res.status(400).json({
        error: "Missing required headers",
        message: "X-SonarQube-URL and X-SonarQube-Token headers are required",
      });
      return;
    }

    try {
      const config: SonarQubeConfig = {
        url: sonarqubeUrl,
        token: sonarqubeToken,
      };
      console.log(`📡 [SonarQube] Using header config: ${config.url}`);
      const executeTool = sonarqubeService.createExecutor(config);

      const server = createMCPServer({
        name: "sonarqube-mcp-server",
        version: "1.0.0",
        tools: sonarqubeService.tools,
        executeTool,
      });

      await handleSSEConnection(server, req, res);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SonarQube] SSE setup failed: ${errorMessage}`, error);

      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to setup SSE connection" });
      }
    }
  });

  // Message endpoint for this service
  // IMPORTANT: Do not use express.json() or express.text() middleware here
  // The SSEServerTransport.handlePostMessage() needs to read the raw request body
  app.post("/sonarqube/message", async (req: Request, res: Response) => {
    // Extract sessionId from query parameters
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      console.error("[SonarQube] POST /sonarqube/message: Missing sessionId in query");
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }

    // Look up the transport for this session
    const transport = sessionRegistry.get(sessionId);

    if (!transport) {
      console.error(`[SonarQube] POST /sonarqube/message: Session not found: ${sessionId}`);
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    try {
      // Route the POST message to the correct transport
      // The transport will read the raw body internally
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error(`[SonarQube] Error handling POST message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });
}
