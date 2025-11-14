import { GitLabConfig } from "../config.js";
import { MCPTool, ToolResult } from "@/lib/mcpServer.js";
import { createHttpClient } from "@/lib/httpClient.js";
import { z } from "zod";
import {
  parseGitLabMRUrl,
  cleanCommentBody,
  detectSeverity,
  extractCommentEssentials,
  parseNitpickSummary,
  NitpickItem,
} from "../utils.js";

export const getMergeRequestNitpicksTool: MCPTool = {
  name: "get-merge-request-nitpicks",
  description:
    "Get GitLab merge request nitpick suggestions only. Returns optional improvements and code style suggestions with pagination support.",
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
  },
};

interface MergeRequestNitpicksArgs {
  url: string;
  page?: number;
  per_page?: number;
  sort?: "asc" | "desc";
  filter_author?: string;
}

export function createMergeRequestNitpicksHandler(config: GitLabConfig) {
  return async function(args: MergeRequestNitpicksArgs): Promise<ToolResult> {
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

      // Filter by author if specified
      if (args.filter_author) {
        notes = notes.filter(
          (note: any) => note.author?.username === args.filter_author
        );
      }

      // Filter for nitpick comments only
      const nitpickSummaryNotes = notes.filter(
        (note: any) => note.body.includes("🧹 Nitpick comments")
      );

      const individualNitpickNotes = notes.filter(
        (note: any) =>
          note.resolvable &&
          (note.body.includes("🧹 Nitpick") ||
            note.body.includes("_🧹 Nitpick_")) &&
          !note.body.includes("🧹 Nitpick comments") // Exclude summary
      );

      // Combine all nitpick notes
      const allNitpickNotes = [...nitpickSummaryNotes, ...individualNitpickNotes];

      // Process nitpicks
      const nitpickItems: NitpickItem[] = [];
      const individualNitpickComments: any[] = [];

      for (const note of allNitpickNotes) {
        // Check if this is a nitpick summary note
        if (note.body.includes("🧹 Nitpick comments")) {
          const parsedNitpicks = parseNitpickSummary(note.body);
          nitpickItems.push(...parsedNitpicks);
        } else {
          // Individual nitpick comment
          const severity = detectSeverity(note.body);
          const essentials = extractCommentEssentials(note.body, severity);

          const comment: any = {
            id: note.id,
            author: {
              name: note.author?.name || "Unknown",
              username: note.author?.username || "",
            },
            created_at: note.created_at,
            resolvable: note.resolvable || false,
            resolved: note.resolved || false,
            essentials,
          };

          if (note.position) {
            comment.file_path =
              note.position.new_path || note.position.old_path || "";
            comment.line = note.position.new_line || note.position.old_line || null;
          }

          individualNitpickComments.push(comment);
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
      filterInfo.push("Nitpicks only");
      const filterText = `\n**Filters Applied:** ${filterInfo.join(", ")}\n`;

      let markdown = `# [${mergeRequest.title}](${mergeRequest.web_url})

**Author:** ${mergeRequest.author?.name || "Unknown"}
**Created:** ${createdDate}
${filterText}
**📄 Page ${currentPage} of ${totalPages}** (Showing ${allNitpickNotes.length} nitpick notes from ${originalNotesCount} notes on this page, ${totalNotesCount} total in MR)

## 🧹 Nitpicks

*Optional improvements and suggestions*

`;

      // Add nitpicks from summary
      if (nitpickItems.length > 0) {
        markdown += `### From Nitpick Summary (${nitpickItems.length})\n\n`;

        for (const nitpick of nitpickItems) {
          markdown += `#### File: ${nitpick.file_path}`;
          if (nitpick.line_range) {
            markdown += ` (Line ${nitpick.line_range})`;
          }
          markdown += `\n\n`;

          if (nitpick.title) {
            markdown += `**${nitpick.title}**\n\n`;
          }

          if (nitpick.description) {
            markdown += `${nitpick.description}\n\n`;
          }

          if (nitpick.fixes.length > 0) {
            markdown += `**Suggested change:**\n\n`;
            for (const fix of nitpick.fixes) {
              markdown += `\`\`\`diff\n${fix}\n\`\`\`\n\n`;
            }
          }

          markdown += `---\n\n`;
        }
      }

      // Add individual nitpick comments
      if (individualNitpickComments.length > 0) {
        markdown += `### Individual Nitpick Comments (${individualNitpickComments.length})\n\n`;

        for (const comment of individualNitpickComments) {
          const status = comment.resolvable
            ? comment.resolved
              ? "✅ Resolved"
              : "⚠️ Unresolved"
            : "";

          const { essentials } = comment;

          if (comment.file_path) {
            markdown += `#### File: ${comment.file_path}${
              comment.line ? ` (Line ${comment.line})` : ""
            }\n`;
          }
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
            markdown += `**Suggested change:**\n\n`;
            for (const fix of essentials.fixes) {
              markdown += `\`\`\`diff\n${fix}\n\`\`\`\n\n`;
            }
          }

          markdown += `---\n\n`;
        }
      }

      if (nitpickItems.length === 0 && individualNitpickComments.length === 0) {
        markdown += "*No nitpick suggestions on this page.*\n\n";
      }

      markdown += `## Summary

- **Total Notes in MR:** ${totalNotesCount}
- **Current Page:** ${currentPage} of ${totalPages}
- **Nitpick Notes on This Page:** ${allNitpickNotes.length}
- **Nitpicks (from summary):** ${nitpickItems.length}
- **Individual Nitpick Comments:** ${individualNitpickComments.length}
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
