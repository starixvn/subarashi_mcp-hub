import { Request, Response } from "express";

export function configRoute(req: Request, res: Response): void {
  const host = req.get("host");
  if (!host) {
    res.status(400).json({ error: "Host header is required" });
    return;
  }
  const baseUrl = `${req.protocol}://${host}`;

  res.json({
    _note: "Replace all placeholder URLs and tokens with your actual service credentials",
    mcpServers: {
      gitlab: {
        transport: "sse",
        url: `${baseUrl}/gitlab/sse`,
        headers: {
          "X-GitLab-URL": "https://gitlab.example.com",
          "X-GitLab-Token": "your-gitlab-token-here",
        },
        description: "GitLab merge requests and code review tools",
      },
      sonarqube: {
        transport: "sse",
        url: `${baseUrl}/sonarqube/sse`,
        headers: {
          "X-SonarQube-URL": "https://sonarqube.example.com",
          "X-SonarQube-Token": "your-sonarqube-token-here",
        },
        description: "SonarQube code quality metrics and analysis",
      },
    },
  });
}
