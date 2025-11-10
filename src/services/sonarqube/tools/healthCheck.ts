import { SonarQubeConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";

export const healthCheckTool: MCPTool = {
  name: "sonar_health_check",
  description: "Check SonarQube server health status",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export function createHealthCheckHandler(config: SonarQubeConfig) {
  return async function(): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "basic", token: config.token },
      timeout: 10000,
    });

    if (!client) {
      return { error: "❌ SonarQube not configured. Provide sonarqube_url and sonarqube_token query parameters." };
    }

    try {
      const response = await client.get("/api/system/status");
      return { status: response.data.status || "Unknown" };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { error: "🔐 Unauthorized. Invalid SonarQube token." };
      }
      const errorMessage = error.message || String(error);
      return { error: errorMessage };
    }
  };
}
