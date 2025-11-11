import { MCPTool, ToolResult, ToolExecutor } from "@/lib/mcpServer.js";
import { healthCheckTool, createHealthCheckHandler } from "./healthCheck.js";
import { getMetricsTool, createGetMetricsHandler } from "./getMetrics.js";
import { getIssuesTool, createGetIssuesHandler } from "./getIssues.js";
import { getFileCoverageTool, createGetFileCoverageHandler } from "./getFileCoverage.js";
import { getFileDuplicationsTool, createGetFileDuplicationsHandler } from "./getFileDuplications.js";
import { SonarQubeConfig } from "../config.js";

export const TOOLS: MCPTool[] = [
  healthCheckTool,
  getMetricsTool,
  getIssuesTool,
  getFileCoverageTool,
  getFileDuplicationsTool,
];

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
      case "get_project_issues": {
        const issuesHandler = createGetIssuesHandler(config);
        return await issuesHandler(args);
      }
      case "get_file_coverage": {
        const coverageHandler = createGetFileCoverageHandler(config);
        return await coverageHandler(args);
      }
      case "get_file_duplications": {
        const duplicationsHandler = createGetFileDuplicationsHandler(config);
        return await duplicationsHandler(args);
      }
      default:
        throw new Error(`Unknown SonarQube tool: ${name}`);
    }
  };
}
