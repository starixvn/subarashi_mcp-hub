import { SonarQubeConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";

export const getFileCoverageTool: MCPTool = {
  name: "get_file_coverage",
  description:
    "Get code coverage metrics for each file in the project with pagination support",
  inputSchema: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        description: "The project key to fetch coverage for",
      },
      page: {
        type: "number",
        description: "Page number (1-based, default: 1)",
      },
      page_size: {
        type: "number",
        description: "Items per page (default: 100, max: 500)",
      },
      sort: {
        type: "string",
        description:
          "Sort field: coverage, uncovered_lines, lines_to_cover (optional, default: coverage)",
      },
    },
    required: ["project_key"],
  },
};

interface GetFileCoverageArgs {
  project_key: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export function createGetFileCoverageHandler(config: SonarQubeConfig) {
  return async function (args: GetFileCoverageArgs): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "basic", token: config.token },
      timeout: 30000,
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

    // Validate and set defaults
    const page = Math.max(1, args.page || 1);
    const pageSize = Math.min(500, Math.max(1, args.page_size || 100));
    const sort = args.sort || "coverage";

    try {
      const metricKeys = "coverage,uncovered_lines,lines_to_cover,line_coverage";

      const params: any = {
        component: args.project_key,
        metricKeys,
        p: page,
        ps: pageSize,
        s: `metric,${sort}`, // Sort by metric name first, then by the specified metric
        metricSort: sort,
        asc: "false", // Descending order (worst coverage first)
      };

      const response = await client.get("/api/measures/component_tree", { params });

      const components = response.data.components || [];
      const paging = response.data.paging || {};

      // Format coverage data for better readability
      const coverageData = components.map((component: any) => {
        const measures = component.measures || [];
        const metricsObj: Record<string, string> = {};

        for (const measure of measures) {
          metricsObj[measure.metric] = measure.value;
        }

        return {
          file: component.path || component.name,
          key: component.key,
          coverage: metricsObj.coverage || "0",
          linesToCover: metricsObj.lines_to_cover || "0",
          uncoveredLines: metricsObj.uncovered_lines || "0",
          lineCoverage: metricsObj.line_coverage || "0",
        };
      });

      return {
        files: coverageData,
        paging: {
          page: paging.pageIndex || page,
          pageSize: paging.pageSize || pageSize,
          total: paging.total || 0,
          totalPages: Math.ceil((paging.total || 0) / (paging.pageSize || pageSize)),
        },
        summary: {
          project_key: args.project_key,
          sortedBy: sort,
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
      return { error: `❌ Failed to fetch file coverage: ${errorMessage}` };
    }
  };
}
