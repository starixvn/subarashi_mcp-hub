import { Express } from "express";
import { configRoute } from "./config.js";
import { gitlabRoute } from "./gitlab.js";
import { sonarqubeRoute } from "./sonarqube.js";

export function registerRoutes(app: Express): void {
  // Root config endpoint
  app.get("/", configRoute);

  // Service SSE endpoints
  gitlabRoute(app);
  sonarqubeRoute(app);


  // Catch-all 404 handler (must be last)
  app.use((req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: "Path is not found",
      path: req.originalUrl,
    });
  });
}
