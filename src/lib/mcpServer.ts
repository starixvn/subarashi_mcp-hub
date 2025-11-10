import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
}: MCPServerConfig): Server {
  const server = new Server(
    { name, version },
    { capabilities: { tools: {} } }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log(`📋 [${name}] Listing ${tools.length} tools`);
    return { tools };
  });

  // Execute tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    try {
      const result = await executeTool(toolName, args || {});
      if (!result) {
        return {
          content: [
            {
              type: "text",
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
              type: "text",
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
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [${name}] Error executing ${toolName}:`, errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
