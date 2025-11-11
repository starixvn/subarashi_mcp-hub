import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

export interface ToolResult {
  markdown?: string;
  error?: string;
  [key: string]: any;
}

export type ToolExecutor = (name: string, args: any) => Promise<ToolResult>;

export interface MCPServerConfig {
  name: string;
  version: string;
  tools: MCPTool[];
  executeTool: ToolExecutor;
}

export function createMCPServer({
  name,
  version,
  tools,
  executeTool,
}: MCPServerConfig): McpServer {
  const mcpServer = new McpServer(
    { name, version },
    { capabilities: { tools: {} } }
  );

  // Register each tool dynamically
  console.log(`📋 [${name}] Registering ${tools.length} tools`);
  for (const tool of tools) {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as any,
      },
      async (args: any) => {
        try {
          const result = await executeTool(tool.name, args || {});
          if (!result) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Tool returned no result",
                },
              ],
              isError: true,
            };
          }

          if (result?.error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: ${result.error}`,
                },
              ],
              isError: true,
            };
          }

          const text = result.markdown || JSON.stringify(result, null, 2);
          return {
            content: [
              {
                type: "text" as const,
                text,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ [${name}] Error executing ${tool.name}:`, errorMessage);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  return mcpServer;
}
