import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * Registry for managing SSE transport sessions
 * Maps sessionId to SSEServerTransport instances for proper message routing
 */
class SessionRegistry {
  private sessions = new Map<string, SSEServerTransport>();

  /**
   * Register a new transport instance
   * @param sessionId - Unique session identifier from the transport
   * @param transport - The SSEServerTransport instance
   */
  register(sessionId: string, transport: SSEServerTransport): void {
    console.log(`[SessionRegistry] Registering session: ${sessionId}`);
    this.sessions.set(sessionId, transport);
  }

  /**
   * Get a transport instance by session ID
   * @param sessionId - The session identifier
   * @returns The transport instance or undefined if not found
   */
  get(sessionId: string): SSEServerTransport | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Remove a transport instance from the registry
   * @param sessionId - The session identifier to remove
   */
  remove(sessionId: string): void {
    console.log(`[SessionRegistry] Removing session: ${sessionId}`);
    this.sessions.delete(sessionId);
  }

  /**
   * Get the count of active sessions
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

// Export a singleton instance
export const sessionRegistry = new SessionRegistry();
