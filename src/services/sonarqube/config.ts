export interface SonarQubeConfig {
  url: string;
  token: string;
}

export function validateConfig(): void {
  console.warn("⚠️  SonarQube configuration must be provided via X-SonarQube-URL and X-SonarQube-Token headers.");
}

export function isConfigured(config?: SonarQubeConfig): boolean {
  if (config) {
    return !!(config.url && config.token);
  }
  return false;
}
