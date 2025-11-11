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
    include_nitpicks: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Include nitpick comments regardless of resolution status (default: false). When true, includes comments with '🧹 Nitpick' markers."
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
  filter_author?: string;
  unresolved_only?: boolean;
  include_nitpicks?: boolean;
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

      // Include nitpicks if requested
      if (args.include_nitpicks) {
        // Get all nitpick comments that weren't already included
        const nitpickNotes = notesResponse.data.filter(
          (note: any) =>
            !note.system &&
            (note.body.includes("🧹 Nitpick") ||
              note.body.includes("_🧹 Nitpick_")) &&
            // Filter by author if specified
            (!args.filter_author || note.author?.username === args.filter_author)
        );

        // Merge with existing filtered notes (avoid duplicates)
        const existingIds = new Set(notes.map((n: any) => n.id));
        const newNitpicks = nitpickNotes.filter(
          (n: any) => !existingIds.has(n.id)
        );
        notes = [...notes, ...newNitpicks];
      }

      // Process comments
      const codeReviewComments: any[] = [];
      const generalComments: any[] = [];
      let unresolvedCount = 0;

      // Helper function to detect severity from comment body
      const detectSeverity = (body: string): string => {
        if (body.includes("🔴 Critical") || body.includes("_🔴 Critical_")) {
          return "Critical";
        }
        if (body.includes("⚠️ Potential issue") || body.includes("_⚠️ Potential issue_")) {
          return "Potential Issue";
        }
        if (body.includes("🧹 Nitpick") || body.includes("_🧹 Nitpick_")) {
          return "Nitpick";
        }
        return "General";
      };

      for (const note of notes) {
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
          severity: detectSeverity(note.body),
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
      if (args.include_nitpicks) {
        filterInfo.push("Include nitpicks");
      }
      const filterText = filterInfo.length > 0
        ? `\n**Filters Applied:** ${filterInfo.join(", ")}\n`
        : "";

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
          Nitpick: codeReviewComments.filter((c) => c.severity === "Nitpick"),
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

            markdown += `#### File: ${comment.file_path}${
              comment.line ? ` (Line ${comment.line})` : ""
            }
**Author:** @${comment.author.username}${
              status ? ` | **Status:** ${status}` : ""
            }

${comment.body}

---

`;
          }
        }
      } else {
        markdown += "*No code review comments on this page.*\n\n---\n\n";
      }

      if (generalComments.length > 0) {
        markdown += `## General Discussion\n\n`;
        for (const comment of generalComments) {
          markdown += `**@${comment.author.username}** (${
            comment.created_at
          }):

${comment.body}

---

`;
        }
      }

      // Calculate severity counts
      const criticalCount = codeReviewComments.filter(
        (c) => c.severity === "Critical"
      ).length;
      const potentialIssueCount = codeReviewComments.filter(
        (c) => c.severity === "Potential Issue"
      ).length;
      const nitpickCount = codeReviewComments.filter(
        (c) => c.severity === "Nitpick"
      ).length;

      markdown += `## Summary

- **Total Notes in MR:** ${totalNotesCount}
- **Current Page:** ${currentPage} of ${totalPages}
- **Filtered Notes on This Page:** ${notes.length} (from ${originalNotesCount} before filtering)
- **Code Review Comments:** ${codeReviewComments.length}
  - Critical: ${criticalCount}
  - Potential Issue: ${potentialIssueCount}
  - Nitpick: ${nitpickCount}
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
