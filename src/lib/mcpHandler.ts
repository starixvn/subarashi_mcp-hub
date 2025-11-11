import { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { transportRegistry } from "./transportRegistry.js";
import { randomUUID } from "crypto";

/**
 * Handles MCP requests using StreamableHTTPServerTransport
 * Supports GET (SSE), POST (messages), and DELETE (session termination)
 */
export async function handleMCPRequest(
  server: Server,
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Check if we have an existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = transportRegistry.get(sessionId);

    // If no transport exists, create a new one
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (id: string) => {
          if (transport) {
            transportRegistry.register(id, transport);
            console.log(`[MCP] Session initialized: ${id} for ${req.path}`);
          }
        },
        onsessionclosed: async (id: string) => {
          transportRegistry.remove(id);
          console.log(`[MCP] Session closed: ${id} for ${req.path}`);
        },
      });

      // Connect the server to the new transport
      await server.connect(transport);
      console.log(`[MCP] New transport created for ${req.path}`);
    }

    // Let the transport handle the request (GET/POST/DELETE routing is automatic)
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error(`[MCP] Failed to handle request for ${req.path}:`, error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
}
