import { SonarQubeConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";

export const getIssuesTool: MCPTool = {
  name: "get_project_issues",
  description:
    "Fetch detailed project issues (bugs, vulnerabilities, code smells) with pagination and filtering support",
  inputSchema: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        description: "The project key to fetch issues for",
      },
      types: {
        type: "string",
        description:
          "Comma-separated issue types: BUG, VULNERABILITY, CODE_SMELL (optional)",
      },
      severities: {
        type: "string",
        description:
          "Comma-separated severities: BLOCKER, CRITICAL, MAJOR, MINOR, INFO (optional)",
      },
      statuses: {
        type: "string",
        description:
          "Comma-separated statuses: OPEN, CONFIRMED, REOPENED, RESOLVED, CLOSED (optional)",
      },
      page: {
        type: "number",
        description: "Page number (1-based, default: 1)",
      },
      page_size: {
        type: "number",
        description: "Items per page (default: 100, max: 500)",
      },
    },
    required: ["project_key"],
  },
};

interface GetIssuesArgs {
  project_key: string;
  types?: string;
  severities?: string;
  statuses?: string;
  page?: number;
  page_size?: number;
}

export function createGetIssuesHandler(config: SonarQubeConfig) {
  return async function (args: GetIssuesArgs): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "basic", token: config.token },
      timeout: 30000, // Longer timeout for potentially large responses
    });

    if (!client) {
      return {
        error:
          "❌ SonarQube not configured. Provide sonarqube_url and sonarqube_token headers.",
      };
    }

    if (!args.project_key) {
      return { error: "❌ project_key parameter is required" };
    }

    // Validate and set defaults for pagination
    const page = Math.max(1, args.page || 1);
    const pageSize = Math.min(500, Math.max(1, args.page_size || 100));

    try {
      const params: any = {
        componentKeys: args.project_key,
        p: page,
        ps: pageSize,
      };

      // Add optional filters
      if (args.types) {
        params.types = args.types;
      }
      if (args.severities) {
        params.severities = args.severities;
      }
      if (args.statuses) {
        params.statuses = args.statuses;
      }

      const response = await client.get("/api/issues/search", { params });

      const issues = response.data.issues || [];
      const paging = response.data.paging || {};

      // Format issues for better readability
      const formattedIssues = issues.map((issue: any) => ({
        key: issue.key,
        type: issue.type,
        severity: issue.severity,
        status: issue.status,
        message: issue.message,
        component: issue.component,
        line: issue.line,
        creationDate: issue.creationDate,
        updateDate: issue.updateDate,
        effort: issue.effort,
        tags: issue.tags || [],
      }));

      return {
        issues: formattedIssues,
        paging: {
          page: paging.pageIndex || page,
          pageSize: paging.pageSize || pageSize,
          total: paging.total || 0,
          totalPages: Math.ceil((paging.total || 0) / (paging.pageSize || pageSize)),
        },
        summary: {
          project_key: args.project_key,
          filters: {
            types: args.types || "all",
            severities: args.severities || "all",
            statuses: args.statuses || "all",
          },
        },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { error: `❌ Project '${args.project_key}' not found` };
      }
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.errors?.[0]?.msg || "Bad request";
        return { error: `❌ ${errorMsg}` };
      }
      const errorMessage = error.message || String(error);
      return { error: `❌ Failed to fetch issues: ${errorMessage}` };
    }
  };
}
