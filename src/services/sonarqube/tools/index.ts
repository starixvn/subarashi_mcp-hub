import { MCPTool, ToolResult, ToolExecutor } from "@/lib/mcpServer.js";
import { healthCheckTool, createHealthCheckHandler } from "./healthCheck.js";
import { getMetricsTool, createGetMetricsHandler } from "./getMetrics.js";
import { SonarQubeConfig } from "../config.js";

export const TOOLS: MCPTool[] = [healthCheckTool, getMetricsTool];

export function createExecutor(config: SonarQubeConfig): ToolExecutor {
  return async (name: string, args: any): Promise<ToolResult> => {
    switch (name) {
      case "sonar_health_check": {
        const healthHandler = createHealthCheckHandler(config);
        return await healthHandler();
      }
      case "get_project_metrics": {
        const metricsHandler = createGetMetricsHandler(config);
        return await metricsHandler(args);
      }
      default:
        throw new Error(`Unknown SonarQube tool: ${name}`);
    }
  };
}
