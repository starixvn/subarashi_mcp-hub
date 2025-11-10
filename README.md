# Multi-SSE MCP Server

A TypeScript-based Model Context Protocol (MCP) server with multiple independent SSE (Server-Sent Events) endpoints. Each service (GitLab, SonarQube, etc.) runs as a separate MCP instance at its own endpoint.

## Features

- **Multiple SSE Endpoints**: Independent MCP servers for different services
- **TypeScript**: Type-safe implementation with full IDE support
- **Single Deployment**: One Docker image for all services
- **Easy to Extend**: Template-based service creation
- **Header-based Config**: Configuration passed via HTTP headers for security

## Architecture

```
GET  /                    → Auto-generated MCP config JSON
GET  /gitlab/sse          → GitLab MCP server instance
GET  /sonarqube/sse       → SonarQube MCP server instance
GET  /yourservice/sse     → Pattern for future services
GET  /health              → Health check endpoint
```

Each endpoint is an independent MCP server with its own tools and configuration.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Mode

```bash
npm run dev
```

Server starts with hot reload at `http://localhost:3000`

### 3. Production Build

```bash
npm run build
npm start
```

## Configuration

### Auto-Config

Visit `http://localhost:3000/` to get auto-generated config JSON with the correct server URL. Copy the entire `mcpServers` object and paste it into your Claude Desktop or Cursor settings.

**Important**: You must update the `headers` section with your actual service URLs and tokens.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gitlab": {
      "transport": "sse",
      "url": "http://localhost:3000/gitlab/sse",
      "headers": {
        "X-GitLab-URL": "https://gitlab.nexdev.net",
        "X-GitLab-Token": "your-gitlab-token-here"
      },
      "description": "GitLab merge requests and code review tools"
    },
    "sonarqube": {
      "transport": "sse",
      "url": "http://localhost:3000/sonarqube/sse",
      "headers": {
        "X-SonarQube-URL": "https://sonarqube.example.com",
        "X-SonarQube-Token": "your-sonarqube-token-here"
      },
      "description": "SonarQube code quality metrics and analysis"
    }
  }
}
```

### Cursor IDE

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gitlab": {
      "transport": "sse",
      "url": "http://localhost:3000/gitlab/sse",
      "headers": {
        "X-GitLab-URL": "https://gitlab.nexdev.net",
        "X-GitLab-Token": "your-gitlab-token-here"
      },
      "description": "GitLab merge requests and code review tools"
    },
    "sonarqube": {
      "transport": "sse",
      "url": "http://localhost:3000/sonarqube/sse",
      "headers": {
        "X-SonarQube-URL": "https://sonarqube.example.com",
        "X-SonarQube-Token": "your-sonarqube-token-here"
      },
      "description": "SonarQube code quality metrics and analysis"
    }
  }
}
```

### Configuration via Headers

This server uses HTTP headers for configuration instead of environment variables. Each service requires specific headers:

**GitLab:**
- `X-GitLab-URL`: Your GitLab instance URL (e.g., `https://gitlab.nexdev.net`)
- `X-GitLab-Token`: Your GitLab personal access token

**SonarQube:**
- `X-SonarQube-URL`: Your SonarQube server URL (e.g., `https://sonarqube.example.com`)
- `X-SonarQube-Token`: Your SonarQube authentication token

## Available Tools

### GitLab Tools (`/gitlab/sse`)

#### `get-merge-request-details`
Get merge request details with code review comments (supports pagination).

**Parameters:**
- `url` (string): Full GitLab MR URL
- OR `projectPath` + `mrId`
- `page` (number): Page number (default: 1)
- `per_page` (number): Notes per page (default: 100, max: 100)
- `sort` (string): "asc" or "desc" (default: "desc")

**Example:**
```json
{
  "url": "https://gitlab.nexdev.net/group/project/-/merge_requests/3",
  "page": 1,
  "per_page": 100
}
```

### SonarQube Tools (`/sonarqube/sse`)

#### `sonar_health_check`
Check SonarQube server health.

#### `get_project_metrics`
Fetch code quality metrics.

**Parameters:**
- `project_key` (string, required): SonarQube project key

**Example:**
```json
{
  "project_key": "my-project"
}
```

## Docker Deployment

### Build Image

```bash
docker build -t mcp-server .
```

### Run Container

```bash
docker run -p 3000:3000 mcp-server
```

Optionally override the port:

```bash
docker run -p 8080:8080 -e PORT=8080 mcp-server
```

### Using docker-compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    restart: unless-stopped
```

Run:

```bash
docker-compose up -d
```

**Note**: Configuration is passed via HTTP headers in client settings, not via Docker environment variables.

## Adding a New Service

### 1. Copy Template

```bash
cp -r src/services/_template src/services/yourservice
```

### 2. Implement Service

Edit files in `src/services/yourservice/`:
- `config.ts` - Configuration interface and header handling
- `tools/*.ts` - Tool implementations

See [src/services/_template/README.md](src/services/_template/README.md) for detailed instructions.

### 3. Create Route

Create [src/routes/yourservice.ts](src/routes/yourservice.ts) - see template README for complete example. Make sure to add header validation for required configuration.

### 4. Register Route

Edit [src/routes/index.ts](src/routes/index.ts):

```typescript
import { yourServiceRoute } from "./yourservice.js";

export function registerRoutes(app: Express): void {
  app.get("/", configRoute);
  gitlabRoute(app);
  sonarqubeRoute(app);
  yourServiceRoute(app);  // ADD THIS
}
```

### 5. Update Config Endpoint

Edit [src/routes/config.ts](src/routes/config.ts) to add your service to the JSON response with appropriate headers.

### 6. Restart

```bash
npm run dev
```

New endpoint available at `http://localhost:3000/yourservice/sse`

Configuration will be passed via headers `X-YourService-URL` and `X-YourService-Token`.

## Project Structure

```
mcp_server/
├── src/
│   ├── index.js              # Express SSE server
│   └── tools/
│       ├── index.js          # Tool registry
│       ├── gitlab.js         # GitLab tools
│       ├── sonarqube.js      # SonarQube tools
│       └── [your-tool].js    # Add more here
├── package.json
└── README.md
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000, Docker only) |

**Note**: Service configuration (URLs and tokens) is passed via HTTP headers, not environment variables. See [Configuration via Headers](#configuration-via-headers) section.

## Development

**Run with auto-reload:**
```bash
npm run dev
```

**Check health:**
```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Tools not working
- Check that headers are correctly configured in your client settings
- Verify `X-Service-URL` and `X-Service-Token` headers are present
- View server console for error messages
- Server returns 400 error if required headers are missing

### SSE connection fails
- Ensure server is running on correct port
- Check firewall/network settings
- Verify URL in client configuration

### Adding tools
- Tools are auto-discovered from `tools/` directory
- Each module must export `TOOLS` array and `executeTool` function
- Register in `tools/index.js`

## License

MIT
