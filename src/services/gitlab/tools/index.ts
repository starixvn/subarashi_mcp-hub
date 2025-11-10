import { MCPTool, ToolResult, ToolExecutor } from "@/lib/mcpServer.js";
import {
  getMergeRequestTool,
  createMergeRequestHandler,
} from "./getMergeRequest.js";
import {
  healthCheckTool,
  createHealthCheckHandler,
} from "./healthCheck.js";
import { GitLabConfig } from "../config.js";

export const TOOLS: MCPTool[] = [healthCheckTool, getMergeRequestTool];

export function createExecutor(config: GitLabConfig): ToolExecutor {
  return async (name: string, args: any): Promise<ToolResult> => {
    switch (name) {
      case "gitlab_health_check": {
        const healthHandler = createHealthCheckHandler(config);
        return await healthHandler();
      }
      case "get-merge-request-details": {
        const mrHandler = createMergeRequestHandler(config);
        return await mrHandler(args);
      }
      default:
        throw new Error(`Unknown GitLab tool: ${name}`);
    }
  };
}
