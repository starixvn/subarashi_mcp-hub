import { GitLabConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";
import { z } from "zod";
import {
  parseGitLabMRUrl,
  cleanCommentBody,
  detectSeverity,
  extractCommentEssentials,
} from "../utils.js";

export const getMergeRequestIssuesTool: MCPTool = {
  name: "get-merge-request-issues",
  description:
    "Get GitLab merge request issues and code review comments (excludes nitpicks). Returns critical issues, potential issues, and general comments with pagination support.",
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
    filter_author: z
      .string()
      .optional()
      .describe(
        "Filter comments by author username (e.g., 'coderabbitai'). If not specified, all authors are included."
      ),
    unresolved_only: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Show only unresolved issues (default: false). When true, filters for resolvable comments that are not yet resolved."
      ),
  },
};

interface MergeRequestIssuesArgs {
  url: string;
  page?: number;
  per_page?: number;
  sort?: "asc" | "desc";
  filter_author?: string;
  unresolved_only?: boolean;
}

export function createMergeRequestIssuesHandler(config: GitLabConfig) {
  return async function(args: MergeRequestIssuesArgs): Promise<ToolResult> {
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

      let notes = notesResponse.data;
      const totalPages = parseInt(
        notesResponse.headers["x-total-pages"] || "1",
        10
      );
      const totalNotesCount = parseInt(
        notesResponse.headers["x-total"] || String(notes.length),
        10
      );
      const currentPage = parseInt(
        notesResponse.headers["x-page"] || String(page),
        10
      );

      // Apply filters
      const originalNotesCount = notes.length;

      // Filter out system notes
      notes = notes.filter((note: any) => !note.system);

      // Filter out nitpick comments entirely
      notes = notes.filter((note: any) => {
        const body = note.body || "";
        return !body.includes("🧹 Nitpick") && !body.includes("_🧹 Nitpick_");
      });

      // Filter by author if specified
      if (args.filter_author) {
        notes = notes.filter(
          (note: any) => note.author?.username === args.filter_author
        );
      }

      // Filter for unresolved only if specified
      if (args.unresolved_only) {
        notes = notes.filter(
          (note: any) => note.resolvable && !note.resolved
        );
      }

      // Process comments
      const codeReviewComments: any[] = [];
      const generalComments: any[] = [];
      let unresolvedCount = 0;

      for (const note of notes) {
        const severity = detectSeverity(note.body);
        const essentials = extractCommentEssentials(note.body, severity);

        const comment: any = {
          id: note.id,
          author: {
            name: note.author?.name || "Unknown",
            username: note.author?.username || "",
          },
          body: note.body,
          created_at: note.created_at,
          resolvable: note.resolvable || false,
          resolved: note.resolved || false,
          severity,
          essentials,
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

      // Build filter info
      const filterInfo: string[] = [];
      if (args.filter_author) {
        filterInfo.push(`Author: @${args.filter_author}`);
      }
      if (args.unresolved_only) {
        filterInfo.push("Unresolved only");
      }
      filterInfo.push("Excludes nitpicks");
      const filterText = `\n**Filters Applied:** ${filterInfo.join(", ")}\n`;

      let markdown = `# [${mergeRequest.title}](${mergeRequest.web_url})

**Author:** ${mergeRequest.author?.name || "Unknown"}
**Created:** ${createdDate}
${filterText}
**📄 Page ${currentPage} of ${totalPages}** (Showing ${notes.length} filtered notes from ${originalNotesCount} notes on this page, ${totalNotesCount} total in MR)

## Code Review Comments

`;

      if (codeReviewComments.length > 0) {
        // Group by severity
        const groupedComments = {
          Critical: codeReviewComments.filter((c) => c.severity === "Critical"),
          "Potential Issue": codeReviewComments.filter(
            (c) => c.severity === "Potential Issue"
          ),
          General: codeReviewComments.filter((c) => c.severity === "General"),
        };

        for (const [severity, comments] of Object.entries(groupedComments)) {
          if (comments.length === 0) continue;

          if (severity !== "General") {
            markdown += `### ${severity} (${comments.length})\n\n`;
          }

          for (const comment of comments) {
            const status = comment.resolvable
              ? comment.resolved
                ? "✅ Resolved"
                : "⚠️ Unresolved"
              : "";

            const { essentials } = comment;

            markdown += `#### File: ${comment.file_path}${
              comment.line ? ` (Line ${comment.line})` : ""
            }\n`;
            markdown += `**Author:** @${comment.author.username}${
              status ? ` | **Status:** ${status}` : ""
            }\n\n`;

            // Add title if available
            if (essentials.title) {
              markdown += `**${essentials.title}**\n\n`;
            }

            // Add description if available
            if (essentials.description) {
              markdown += `${essentials.description}\n\n`;
            }

            // Add fixes if available
            if (essentials.fixes.length > 0) {
              markdown += `**Fix:**\n\n`;
              for (const fix of essentials.fixes) {
                markdown += `\`\`\`diff\n${fix}\n\`\`\`\n\n`;
              }
            }

            // Add AI prompt if available (useful for automated fixing)
            if (essentials.aiPrompt) {
              markdown += `<details>\n<summary>🤖 AI Fix Prompt</summary>\n\n\`\`\`\n${essentials.aiPrompt}\n\`\`\`\n\n</details>\n\n`;
            }

            markdown += `---\n\n`;
          }
        }
      } else {
        markdown += "*No code review comments on this page.*\n\n---\n\n";
      }

      if (generalComments.length > 0) {
        markdown += `## General Discussion\n\n`;
        for (const comment of generalComments) {
          const cleanedBody = cleanCommentBody(comment.body);
          markdown += `**@${comment.author.username}** (${
            comment.created_at
          }):\n\n${cleanedBody}\n\n---\n\n`;
        }
      }

      // Calculate severity counts
      const criticalCount = codeReviewComments.filter(
        (c) => c.severity === "Critical"
      ).length;
      const potentialIssueCount = codeReviewComments.filter(
        (c) => c.severity === "Potential Issue"
      ).length;

      markdown += `## Summary

- **Total Notes in MR:** ${totalNotesCount}
- **Current Page:** ${currentPage} of ${totalPages}
- **Filtered Notes on This Page:** ${notes.length} (from ${originalNotesCount} before filtering)
- **Code Review Comments:** ${codeReviewComments.length}
  - Critical: ${criticalCount}
  - Potential Issue: ${potentialIssueCount}
- **General Comments:** ${generalComments.length}
- **Unresolved:** ${unresolvedCount}
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
