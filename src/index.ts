#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(cors());
// NOTE: Do NOT use express.json() globally - it consumes request bodies
// and breaks SSE POST message handling which needs to read raw bodies

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Multi-SSE MCP Server is running",
    version: "1.0.0",
  });
});

// Register all service routes
registerRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Multi-MCP Server running on http://localhost:${PORT}`);
  console.log(`\n📡 Available MCP Endpoints:`);
  console.log(`   - http://localhost:${PORT}/gitlab/mcp`);
  console.log(`   - http://localhost:${PORT}/sonarqube/mcp`);
  console.log(`\n💚 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Config: http://localhost:${PORT}/\n`);
});
