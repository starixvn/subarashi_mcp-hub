import { SonarQubeConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";

export const getFileDuplicationsTool: MCPTool = {
  name: "get_file_duplications",
  description:
    "Get duplication metrics for each file in the project with pagination support",
  inputSchema: {
    type: "object",
    properties: {
      project_key: {
        type: "string",
        description: "The project key to fetch duplications for",
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
          "Sort field: duplicated_lines_density, duplicated_lines, duplicated_blocks (optional, default: duplicated_lines_density)",
      },
    },
    required: ["project_key"],
  },
};

interface GetFileDuplicationsArgs {
  project_key: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export function createGetFileDuplicationsHandler(config: SonarQubeConfig) {
  return async function (args: GetFileDuplicationsArgs): Promise<ToolResult> {
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
    const sort = args.sort || "duplicated_lines_density";

    try {
      const metricKeys =
        "duplicated_lines_density,duplicated_lines,duplicated_blocks,duplicated_files";

      const params: any = {
        component: args.project_key,
        metricKeys,
        p: page,
        ps: pageSize,
        s: `metric,${sort}`, // Sort by metric name first, then by the specified metric
        metricSort: sort,
        asc: "false", // Descending order (highest duplication first)
      };

      const response = await client.get("/api/measures/component_tree", { params });

      const components = response.data.components || [];
      const paging = response.data.paging || {};

      // Format duplication data for better readability
      const duplicationData = components
        .map((component: any) => {
          const measures = component.measures || [];
          const metricsObj: Record<string, string> = {};

          for (const measure of measures) {
            metricsObj[measure.metric] = measure.value;
          }

          // Only include files that have duplications
          const duplicatedLinesDensity = parseFloat(
            metricsObj.duplicated_lines_density || "0"
          );

          return {
            file: component.path || component.name,
            key: component.key,
            duplicatedLinesDensity: metricsObj.duplicated_lines_density || "0",
            duplicatedLines: metricsObj.duplicated_lines || "0",
            duplicatedBlocks: metricsObj.duplicated_blocks || "0",
            duplicatedFiles: metricsObj.duplicated_files || "0",
            hasDuplication: duplicatedLinesDensity > 0,
          };
        })
        .filter((item: any) => item.hasDuplication); // Only show files with duplications

      return {
        files: duplicationData,
        paging: {
          page: paging.pageIndex || page,
          pageSize: paging.pageSize || pageSize,
          total: duplicationData.length, // Total count of files with duplications
          totalPages: Math.ceil(duplicationData.length / (paging.pageSize || pageSize)),
        },
        summary: {
          project_key: args.project_key,
          sortedBy: sort,
          filesWithDuplication: duplicationData.length,
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
      return { error: `❌ Failed to fetch file duplications: ${errorMessage}` };
    }
  };
}
