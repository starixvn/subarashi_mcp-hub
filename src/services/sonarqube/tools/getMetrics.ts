import { SonarQubeConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";

export const getMetricsTool: MCPTool = {
  name: "get_project_metrics",
  description: "Fetch SonarQube metrics (bugs, coverage, code smells, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        description: "The project key to fetch metrics for",
      },
    },
    required: ["project_key"],
  },
};

interface GetMetricsArgs {
  project_key: string;
}

export function createGetMetricsHandler(config: SonarQubeConfig) {
  return async function(args: GetMetricsArgs): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "basic", token: config.token },
      timeout: 10000,
    });

    if (!client) {
      return { error: "❌ SonarQube not configured. Provide sonarqube_url and sonarqube_token query parameters." };
    }

    if (!args.project_key) {
      return { error: "❌ project_key parameter is required" };
    }

    try {
      const metrics =
        "bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density";
      const response = await client.get("/api/measures/component", {
        params: { component: args.project_key, metricKeys: metrics },
      });

      const measures = response.data.component?.measures || [];
      const metricsObj: Record<string, string> = {};
      for (const m of measures) {
        metricsObj[m.metric] = m.value;
      }

      return { project: args.project_key, metrics: metricsObj };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { error: "❌ Project not found" };
      }
      const errorMessage = error.message || String(error);
      return { error: errorMessage };
    }
  };
}
