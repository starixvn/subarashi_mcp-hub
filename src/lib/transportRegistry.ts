import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Registry for managing MCP transport instances per session
 * Maps sessionId to StreamableHTTPServerTransport instances
 */
class TransportRegistry {
  private transports = new Map<string, StreamableHTTPServerTransport>();

  /**
   * Register a new transport instance
   * @param sessionId - Unique session identifier
   * @param transport - The StreamableHTTPServerTransport instance
   */
  register(sessionId: string, transport: StreamableHTTPServerTransport): void {
    console.log(`[TransportRegistry] Registering session: ${sessionId}`);
    this.transports.set(sessionId, transport);
  }

  /**
   * Get a transport instance by session ID
   * @param sessionId - The session identifier
   * @returns The transport instance or undefined if not found
   */
  get(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    if (!sessionId) return undefined;
    return this.transports.get(sessionId);
  }

  /**
   * Remove a transport instance from the registry
   * @param sessionId - The session identifier to remove
   */
  remove(sessionId: string): void {
    console.log(`[TransportRegistry] Removing session: ${sessionId}`);
    this.transports.delete(sessionId);
  }

  /**
   * Get the count of active sessions
   */
  get size(): number {
    return this.transports.size;
  }

  /**
   * Check if a session exists
   */
  has(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    return this.transports.has(sessionId);
  }
}

// Export a singleton instance
export const transportRegistry = new TransportRegistry();
