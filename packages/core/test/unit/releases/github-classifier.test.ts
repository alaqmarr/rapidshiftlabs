import { describe, it, expect } from "vitest";
import { GitHubCommitClassifier } from "../../../src/modules/releases/domain/github-commit-classifier";

describe("GitHubCommitClassifier", () => {
  it("classifies feat: conventional commits as features with clean title", () => {
    const raw = "feat(auth): support passkey webauthn authentication (#104)\n\nDetailed breakdown of WebAuthn credentials.";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("feature");
    expect(result.title).toBe("Support passkey webauthn authentication");
    expect(result.scope).toBe("auth");
    expect(result.isClientVisible).toBe(true);
    expect(result.description).toContain("Detailed breakdown of WebAuthn credentials.");
  });

  it("classifies fix: conventional commits as fixes with clean title", () => {
    const raw = "fix(billing): correct gst rounding on decimal line items (#108)";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("fix");
    expect(result.title).toBe("Correct gst rounding on decimal line items");
    expect(result.scope).toBe("billing");
    expect(result.isClientVisible).toBe(true);
  });

  it("classifies perf: conventional commits as performance", () => {
    const raw = "perf(db): optimize query indexes on changelog tables";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("performance");
    expect(result.title).toBe("Optimize query indexes on changelog tables");
    expect(result.isClientVisible).toBe(true);
  });

  it("identifies releases and extracts version tags", () => {
    const raw = "chore(release): v2.4.0 [skip ci]";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("release");
    expect(result.versionTag).toBe("v2.4.0");
    expect(result.isClientVisible).toBe(true);
  });

  it("hides internal technical chores from client view", () => {
    const raw = "ci: bump github actions checkout to v4";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("chore");
    expect(result.isClientVisible).toBe(false);
  });

  it("hides automated bot merge commits from client view", () => {
    const raw = "Merge pull request #55 from rapidshift/dependabot/npm_and_yarn/all";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.isClientVisible).toBe(false);
  });

  it("strips git trailers (Signed-off-by, Co-authored-by) from descriptions", () => {
    const raw = "feat: add webhook retry logic\n\nRetries up to 5 times with exponential backoff.\n\nSigned-off-by: Dev <dev@example.com>\nCo-authored-by: Lead <lead@example.com>";
    const result = GitHubCommitClassifier.classify(raw);

    expect(result.type).toBe("feature");
    expect(result.description).toBe("Retries up to 5 times with exponential backoff.");
    expect(result.description).not.toContain("Signed-off-by");
  });
});
