import { GitLabConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";
import { z } from "zod";

export const healthCheckTool: MCPTool = {
  name: "gitlab_health_check",
  description: "Check GitLab server health and connectivity",
  inputSchema: {},
};

export function createHealthCheckHandler(config: GitLabConfig) {
  return async function(): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "token", token: config.token },
      timeout: 15000,
    });

    if (!client) {
      return {
        error: "❌ GitLab not configured. Set GITLAB_URL and GITLAB_TOKEN environment variables or provide X-GitLab-URL and X-GitLab-Token headers.",
      };
    }

    try {
      // Try to get version info as a health check
      const response = await client.get("/api/v4/version");
      return {
        status: "healthy",
        version: response.data.version || "Unknown",
        revision: response.data.revision || "Unknown",
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { error: "🔐 Unauthorized. Invalid GitLab token." };
      }
      const errorMessage = error.message || String(error);
      return { error: `❌ GitLab health check failed: ${errorMessage}` };
    }
  };
}
