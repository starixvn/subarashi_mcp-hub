import { GitLabConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";
import { z } from "zod";

export const getMergeRequestTool: MCPTool = {
  name: "get-merge-request-details",
  description:
    "Get GitLab merge request details with code review comments. Returns a formatted Markdown summary with pagination support.",
  inputSchema: {
    url: z
      .string()
      .describe(
        "Full GitLab merge request URL (e.g., 'https://gitlab.nexdev.net/group/project/-/merge_requests/3')"
      ),
    page: z
      .number()
      .optional()
      .default(1)
      .describe("Page number for pagination (default: 1)"),
    per_page: z
      .number()
      .optional()
      .default(100)
      .describe("Notes per page (1-100, default: 100)"),
    sort: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .describe(
        "Sort order by creation date (asc=oldest first, desc=newest first, default: desc)"
      ),
  },
};

interface ParsedMRUrl {
  projectPath: string;
  mrId: number;
}

function parseGitLabMRUrl(url: string): ParsedMRUrl {
  if (!url || typeof url !== "string") {
    throw new Error("❌ Invalid merge request URL");
  }

  const urlWithoutProtocol = url.replace(/^https?:\/\/[^\/]+\//, "");
  const parts = urlWithoutProtocol.split("/-/merge_requests/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("❌ Invalid GitLab merge request URL format");
  }

  return {
    projectPath: parts[0],
    mrId: parseInt(parts[1], 10),
  };
}

interface MergeRequestArgs {
  url: string;
  page?: number;
  per_page?: number;
  sort?: "asc" | "desc";
}

export function createMergeRequestHandler(config: GitLabConfig) {
  return async function(args: MergeRequestArgs): Promise<ToolResult> {
    const client = createHttpClient({
      baseURL: config.url,
      auth: { type: "token", token: config.token },
      timeout: 15000,
    });

    if (!client) {
      return {
        error: "❌ GitLab not configured. Provide gitlab_url and gitlab_token query parameters.",
      };
    }
    console.log('call mcp')
    try {
      const parsed = parseGitLabMRUrl(args.url);
      const encodedProjectPath = encodeURIComponent(parsed.projectPath);
      const page = args.page || 1;
      const perPage = Math.min(args.per_page || 100, 100);
      const sort = args.sort || "desc";

      // Fetch MR
      const mrResponse = await client.get(
        `/api/v4/projects/${encodedProjectPath}/merge_requests/${parsed.mrId}`
      );
      const mergeRequest = mrResponse.data;

      // Fetch notes with pagination
      const notesResponse = await client.get(
        `/api/v4/projects/${encodedProjectPath}/merge_requests/${parsed.mrId}/notes`,
        {
          params: {
            page,
            per_page: perPage,
            sort,
            order_by: "created_at",
          },
        }
      );

      const notes = notesResponse.data;
      const totalPages = parseInt(
        notesResponse.headers["x-total-pages"] || "1",
        10
      );
      const totalCount = parseInt(
        notesResponse.headers["x-total"] || String(notes.length),
        10
      );
      const currentPage = parseInt(
        notesResponse.headers["x-page"] || String(page),
        10
      );

      // Process comments
      const codeReviewComments: any[] = [];
      const generalComments: any[] = [];
      let unresolvedCount = 0;

      for (const note of notes) {
        if (note.system) continue;

        const comment: any = {
          id: note.id,
          author: note.author?.name || "Unknown",
          author_username: note.author?.username || "",
          body: note.body,
          created_at: note.created_at,
          resolvable: note.resolvable || false,
          resolved: note.resolved || false,
        };

        if (note.position) {
          comment.file_path =
            note.position.new_path || note.position.old_path || "";
          comment.line = note.position.new_line || note.position.old_line || null;
          codeReviewComments.push(comment);
        } else {
          generalComments.push(comment);
        }

        if (comment.resolvable && !comment.resolved) {
          unresolvedCount++;
        }
      }

      // Build markdown
      const createdDate = new Date(mergeRequest.created_at)
        .toISOString()
        .split("T")[0];
      let markdown = `# [${mergeRequest.title}](${mergeRequest.web_url})

**Author:** ${mergeRequest.author?.name || "Unknown"}
**Created:** ${createdDate}

**📄 Page ${currentPage} of ${totalPages}** (Showing ${notes.length} of ${totalCount} total notes)

## Code Review Comments

`;

      if (codeReviewComments.length > 0) {
        for (const comment of codeReviewComments) {
          const status = comment.resolvable
            ? comment.resolved
              ? "✅ Resolved"
              : "⚠️ Unresolved"
            : "";

          markdown += `### File: ${comment.file_path}${
            comment.line ? ` (Line ${comment.line})` : ""
          }
**Author:** @${comment.author_username || comment.author}${
            status ? ` | **Status:** ${status}` : ""
          }

${comment.body}

---

`;
        }
      } else {
        markdown += "*No code review comments on this page.*\n\n---\n\n";
      }

      if (generalComments.length > 0) {
        markdown += `## General Discussion\n\n`;
        for (const comment of generalComments) {
          markdown += `**@${comment.author_username || comment.author}** (${
            comment.created_at
          }):

${comment.body}

---

`;
        }
      }

      markdown += `## Summary

- **Total Notes (All Pages):** ${totalCount}
- **Current Page:** ${currentPage} of ${totalPages}
- **Notes on This Page:** ${notes.length}
- **Code Review Comments (This Page):** ${codeReviewComments.length}
- **General Comments (This Page):** ${generalComments.length}
- **Unresolved (This Page):** ${unresolvedCount}
`;

      if (currentPage < totalPages) {
        markdown += `\n💡 **Tip:** Use \`"page": ${
          currentPage + 1
        }\` to fetch the next page.\n`;
      }

      return { markdown };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { error: "🔐 Unauthorized. Invalid GitLab token." };
      } else if (error.response?.status === 404) {
        return { error: "❌ Not found. Project or MR does not exist." };
      }
      const errorMessage = error.message || String(error);
      return { error: errorMessage };
    }
  };
}
