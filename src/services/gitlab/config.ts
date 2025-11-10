export interface GitLabConfig {
  url: string;
  token: string;
}

export function validateConfig(): void {
  console.warn("⚠️  GitLab configuration must be provided via X-GitLab-URL and X-GitLab-Token headers.");
}

export function isConfigured(config?: GitLabConfig): boolean {
  if (config) {
    return !!(config.url && config.token);
  }
  return false;
}
