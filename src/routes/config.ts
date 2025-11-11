import { Request, Response } from "express";

export function configRoute(req: Request, res: Response): void {
  const host = req.get("host");
  if (!host) {
    res.status(400).json({ error: "Host header is required" });
    return;
  }
  const baseUrl = `${req.protocol}://${host}`;

  res.json({
    mcpServers: {
      gitlab: {
        url: `${baseUrl}/gitlab/mcp`,
        headers: {
          "X-GitLab-URL": "https://gitlab.example.com",
          "X-GitLab-Token": "your-gitlab-token-here",
        },
      },
      sonarqube: {
        url: `${baseUrl}/sonarqube/mcp`,
        headers: {
          "X-SonarQube-URL": "https://sonarqube.example.com",
          "X-SonarQube-Token": "your-sonarqube-token-here",
        },
      },
    },
  });
}
