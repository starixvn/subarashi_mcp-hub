/**
 * Shared utilities for GitLab MCP tools
 */

export interface ParsedMRUrl {
  projectPath: string;
  mrId: number;
}

export interface CleanedComment {
  title: string;
  description: string;
  fixes: string[];
  aiPrompt: string;
  severity: string;
}

export interface NitpickItem {
  file_path: string;
  line_range: string;
  title: string;
  description: string;
  fixes: string[];
}

/**
 * Parse GitLab merge request URL to extract project path and MR ID
 */
export function parseGitLabMRUrl(url: string): ParsedMRUrl {
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

/**
 * Clean comment body by removing verbose debugging artifacts
 * - Remove script execution blocks
 * - Remove analysis chain details (keep only conclusions)
 * - Remove HTML comments
 * - Remove duplicate "Committable suggestion" blocks
 * - Keep: issue description, diff blocks, AI prompts
 */
export function cleanCommentBody(body: string): string {
  if (!body) return "";

  let cleaned = body;

  // Remove all script execution blocks (🏁 Script executed: ... --- pattern)
  cleaned = cleaned.replace(/🏁 Script executed:\s*```[\s\S]*?```\s*Length of output:.*?\n---\n/g, "");

  // Remove Analysis chain details but keep the summary
  cleaned = cleaned.replace(
    /<details>\s*<summary>🧩 Analysis chain<\/summary>\s*\*\*(.+?)\*\*\s*[\s\S]*?<\/details>/g,
    "**$1**"
  );

  // Remove HTML comment artifacts
  cleaned = cleaned.replace(/<!-- suggestion_start -->\s*/g, "");
  cleaned = cleaned.replace(/<!-- suggestion_end -->\s*/g, "");
  cleaned = cleaned.replace(/<!-- This is an auto-generated comment by CodeRabbit -->\s*/g, "");
  cleaned = cleaned.replace(/<!-- .+? -->\s*/g, "");

  // Remove duplicate "Committable suggestion" blocks (keep only diff blocks)
  cleaned = cleaned.replace(
    /<details>\s*<summary>📝 Committable suggestion<\/summary>[\s\S]*?<\/details>\s*/g,
    ""
  );

  // Remove excessive blank lines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Detect severity from comment body
 */
export function detectSeverity(body: string): string {
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
}

/**
 * Extract essential information from comment body
 * Returns: { title, description, fixes, aiPrompt, severity }
 */
export function extractCommentEssentials(body: string, detectedSeverity: string): CleanedComment {
  const cleaned = cleanCommentBody(body);

  // Extract title (first **text** block)
  const titleMatch = cleaned.match(/\*\*(.+?)\*\*/);
  const title = titleMatch ? titleMatch[1] : "";

  // Extract description (text before first diff or details block)
  const descMatch = cleaned.match(/^([\s\S]*?)(?:```diff|<details|$)/);
  let description = descMatch ? descMatch[1].trim() : "";

  // Remove severity markers and metadata from description
  description = description
    .replace(/_[⚠️🚨🧹🛠️][^_]+_\s*\|\s*_[^_]+_/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold from title in description
    .trim();

  // Extract all diff blocks
  const diffMatches = cleaned.matchAll(/```diff\n([\s\S]*?)```/g);
  const fixes: string[] = [];
  for (const match of diffMatches) {
    if (match[1].trim()) {
      fixes.push(match[1].trim());
    }
  }

  // Extract AI prompt (from "Prompt for AI Agents" section)
  const aiPromptMatch = cleaned.match(
    /<summary>🤖 Prompt for AI Agents<\/summary>\s*```\s*([\s\S]*?)```/
  );
  const aiPrompt = aiPromptMatch ? aiPromptMatch[1].trim() : "";

  return {
    title,
    description,
    fixes,
    aiPrompt,
    severity: detectedSeverity,
  };
}

/**
 * Parse nitpick summary note to extract individual nitpicks
 * CodeRabbit posts nitpicks as a single summary note with nested details
 */
export function parseNitpickSummary(body: string): NitpickItem[] {
  const nitpicks: NitpickItem[] = [];

  // Check if this is a nitpick summary note
  if (!body.includes("🧹 Nitpick comments")) {
    return nitpicks;
  }

  // Match individual nitpick sections within the main summary
  // Pattern: <details><summary>file.tsx (line)</summary><blockquote>...content...</blockquote></details>
  // But skip the top-level summary and "Additional comments" section
  const nitpickPattern = /<details>\s*<summary>(.+?\.(?:tsx?|jsx?|json|css|scss|html|md|ya?ml).*?)\s+\((\d+(?:-\d+)?)\)<\/summary><blockquote>\s*([\s\S]*?)<\/blockquote><\/details>/g;

  let match;
  while ((match = nitpickPattern.exec(body)) !== null) {
    const filePath = match[1].trim(); // e.g., "client-app/src/features/component.tsx"
    const lineRange = match[2]; // e.g., "1" or "32-40"
    const content = match[3];

    // Extract title (first **text** after line reference like `32-32`: **Title**)
    const titleMatch = content.match(/`[\d-]+`:\s*\*\*(.+?)\*\*/);
    const title = titleMatch ? titleMatch[1] : "";

    // Extract description (text after title, before diff blocks or nested details)
    const descMatch = content.match(/\*\*.*?\*\*\s*([\s\S]*?)(?:```diff|Apply this diff|<details|Also applies to:|$)/);
    let description = descMatch ? descMatch[1].trim() : "";

    // Clean up description - remove excessive whitespace and artifacts
    description = description
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Extract diff blocks
    const diffMatches = content.matchAll(/```diff\n([\s\S]*?)```/g);
    const fixes: string[] = [];
    for (const diffMatch of diffMatches) {
      if (diffMatch[1].trim()) {
        fixes.push(diffMatch[1].trim());
      }
    }

    nitpicks.push({
      file_path: filePath,
      line_range: lineRange,
      title,
      description,
      fixes,
    });
  }

  return nitpicks;
}
