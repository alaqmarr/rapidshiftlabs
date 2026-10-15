export type ChangelogType = "feature" | "fix" | "performance" | "security" | "release" | "chore";

export interface ClassifiedCommit {
  title: string;
  description: string | null;
  type: ChangelogType;
  isClientVisible: boolean;
  versionTag: string | null;
  scope: string | null;
}

export class GitHubCommitClassifier {
  /**
   * Classify a raw git commit message into a clean, human-readable summary for client changelogs.
   */
  public static classify(rawMessage: string): ClassifiedCommit {
    if (!rawMessage || !rawMessage.trim()) {
      return {
        title: "Miscellaneous updates",
        description: null,
        type: "chore",
        isClientVisible: false,
        versionTag: null,
        scope: null,
      };
    }

    const lines = rawMessage.trim().split("\n");
    const firstLine = lines[0]?.trim() || "";
    let body = lines.slice(1).join("\n").trim();

    // Clean body by removing git metadata
    if (body) {
      body = body
        .split("\n")
        .filter((line) => {
          const l = line.trim().toLowerCase();
          return (
            !l.startsWith("signed-off-by:") &&
            !l.startsWith("co-authored-by:") &&
            !l.startsWith("change-id:")
          );
        })
        .join("\n")
        .trim();
    }

    // Ignore bot automated commits from client visibility
    if (
      firstLine.startsWith("Merge branch") ||
      firstLine.startsWith("Merge pull request") ||
      firstLine.toLowerCase().includes("[dependabot]") ||
      firstLine.toLowerCase().includes("bump version")
    ) {
      // Check if it's a version release bump
      const versionMatch = firstLine.match(/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
      if (versionMatch && versionMatch[1]) {
        return {
          title: `Release v${versionMatch[1]}`,
          description: body || null,
          type: "release",
          isClientVisible: true,
          versionTag: `v${versionMatch[1]}`,
          scope: null,
        };
      }
      return {
        title: firstLine,
        description: body || null,
        type: "chore",
        isClientVisible: false,
        versionTag: null,
        scope: null,
      };
    }

    // Check conventional commit pattern: e.g. "feat(billing): add pdf download export (#42)"
    const ccRegex = /^([a-zA-Z]+)(?:\(([^)]+)\))?!?: (.+)$/;
    const match = firstLine.match(ccRegex);

    if (match && match[1] && match[3]) {
      const rawType = match[1];
      const scope = match[2];
      const rawSubject = match[3];
      const cleanSubject = this.humanizeSubject(rawSubject);
      const normalizedType = rawType.toLowerCase();

      let type: ChangelogType = "chore";
      let isClientVisible = true;

      switch (normalizedType) {
        case "feat":
        case "feature":
          type = "feature";
          break;
        case "fix":
        case "bugfix":
          type = "fix";
          break;
        case "perf":
        case "performance":
          type = "performance";
          break;
        case "sec":
        case "security":
          type = "security";
          break;
        case "release":
          type = "release";
          break;
        case "chore":
          if (scope?.toLowerCase() === "release") {
            type = "release";
            isClientVisible = true;
            break;
          }
          type = "chore";
          isClientVisible = false;
          break;
        case "docs":
        case "refactor":
        case "style":
        case "test":
        case "ci":
        case "build":
        default:
          type = "chore";
          // Internal technical chores (e.g. "ci: update github action") are hidden from clients
          isClientVisible = false;
          break;
      }

      const versionMatch = cleanSubject.match(/v?([0-9]+\.[0-9]+\.[0-9]+)/i);

      return {
        title: cleanSubject,
        description: body || null,
        type,
        isClientVisible,
        versionTag: versionMatch ? `v${versionMatch[1]}` : null,
        scope: scope ? this.humanizeScope(scope) : null,
      };
    }

    // Heuristics for non-conventional commit messages
    const lower = firstLine.toLowerCase();
    let type: ChangelogType = "feature";
    let isClientVisible = true;

    if (
      lower.startsWith("fix") ||
      lower.startsWith("resolve") ||
      lower.startsWith("prevent") ||
      lower.startsWith("patch") ||
      lower.startsWith("correct") ||
      lower.includes("bug")
    ) {
      type = "fix";
    } else if (
      lower.startsWith("perf") ||
      lower.startsWith("speed") ||
      lower.startsWith("optimize") ||
      lower.startsWith("improve performance")
    ) {
      type = "performance";
    } else if (lower.startsWith("sec") || lower.includes("vulnerability") || lower.includes("cve")) {
      type = "security";
    } else if (lower.startsWith("release") || lower.startsWith("tag") || lower.startsWith("version")) {
      type = "release";
    } else if (
      lower.startsWith("chore") ||
      lower.startsWith("refactor") ||
      lower.startsWith("wip") ||
      lower.startsWith("clean") ||
      lower.startsWith("test") ||
      lower.startsWith("build")
    ) {
      type = "chore";
      isClientVisible = false;
    }

    return {
      title: this.humanizeSubject(firstLine),
      description: body || null,
      type,
      isClientVisible,
      versionTag: null,
      scope: null,
    };
  }

  private static humanizeSubject(subject: string): string {
    let clean = subject.trim();
    // Remove PR suffix e.g. " (#12)"
    clean = clean.replace(/\s*\([#\d\s,]+\)$/, "").trim();

    // Capitalize first letter
    if (clean.length > 0) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    return clean;
  }

  private static humanizeScope(scope: string): string {
    return scope.trim().replace(/[-_]/g, " ");
  }
}
