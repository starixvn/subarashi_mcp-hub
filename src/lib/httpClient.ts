import axios, { AxiosInstance } from "axios";

export interface AuthConfig {
  type: "token" | "basic" | "bearer";
  token: string;
}

export interface HttpClientOptions {
  baseURL: string;
  auth: AuthConfig;
  timeout?: number;
}

/**
 * Creates a configured axios client instance with authentication
 * @param options Client configuration options
 * @returns Configured AxiosInstance or null if config is invalid
 */
export function createHttpClient(options: HttpClientOptions): AxiosInstance | null {
  if (!options.baseURL.trim() || !options.auth?.token?.trim) {
    return null;
  }

  const headers: Record<string, string> = {};

  // Configure authentication based on type
  switch (options.auth.type) {
    case "token":
      // GitLab-style Private-Token header
      headers["Private-Token"] = options.auth.token;
      break;
    case "basic":
      // Basic authentication with base64-encoded token
      headers["Authorization"] = `Basic ${Buffer.from(options.auth.token + ":", "utf-8").toString("base64")}`;
      break;
    case "bearer":
      // Bearer token authentication
      headers["Authorization"] = `Bearer ${options.auth.token}`;
      break;
  }

  return axios.create({
    baseURL: options.baseURL.replace(/\/$/, ""), // Remove trailing slash
    headers,
    timeout: options.timeout ?? 15000, // Default 15s timeout
  });
}
