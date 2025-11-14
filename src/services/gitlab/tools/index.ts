import { MCPTool, ToolResult, ToolExecutor } from "@/lib/mcpServer.js";
import {
  healthCheckTool,
  createHealthCheckHandler,
} from "./healthCheck.js";
import {
  getMergeRequestIssuesTool,
  createMergeRequestIssuesHandler,
} from "./getMergeRequestIssues.js";
import {
  getMergeRequestNitpicksTool,
  createMergeRequestNitpicksHandler,
} from "./getMergeRequestNitpicks.js";
import { GitLabConfig } from "../config.js";

export const TOOLS: MCPTool[] = [
  healthCheckTool,
  getMergeRequestIssuesTool,
  getMergeRequestNitpicksTool,
];

export function createExecutor(config: GitLabConfig): ToolExecutor {
  return async (name: string, args: any): Promise<ToolResult> => {
    switch (name) {
      case "gitlab_health_check": {
        const healthHandler = createHealthCheckHandler(config);
        return await healthHandler();
      }
      case "get-merge-request-issues": {
        const mrIssuesHandler = createMergeRequestIssuesHandler(config);
        return await mrIssuesHandler(args);
      }
      case "get-merge-request-nitpicks": {
        const mrNitpicksHandler = createMergeRequestNitpicksHandler(config);
        return await mrNitpicksHandler(args);
      }
      default:
        throw new Error(`Unknown GitLab tool: ${name}`);
    }
  };
}
