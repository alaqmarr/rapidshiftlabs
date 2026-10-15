import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";

export interface GitHubTestResult {
  ok: boolean;
  message: string;
  login?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export class TestGitHubConnectionUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(tokenOverride?: string, actorId?: string): Promise<GitHubTestResult> {
    const settings = await this.repo.getGitHubSettings();
    const token = tokenOverride?.trim() || settings.token?.trim();

    if (!token) {
      return {
        ok: false,
        message: "No GitHub token provided or configured.",
      };
    }

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RapidShift-Control-Panel",
        },
      });

      const remainingHeader = res.headers.get("x-ratelimit-remaining");
      const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const reset = resetHeader ? parseInt(resetHeader, 10) : undefined;

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown GitHub API error");
        let parsedMessage = `GitHub API error (${res.status})`;
        try {
          const json = JSON.parse(errorText);
          if (json.message) parsedMessage = `${parsedMessage}: ${json.message}`;
        } catch {
          // fallback
        }

        await this.repo.saveGitHubSettings(
          {
            ...settings,
            lastTestedAt: Date.now(),
            lastTestStatus: "error",
            lastTestMessage: parsedMessage,
            rateLimitRemaining: remaining,
          },
          actorId,
        );

        return {
          ok: false,
          message: parsedMessage,
          rateLimitRemaining: remaining,
          rateLimitReset: reset,
        };
      }

      const user = (await res.json().catch(() => ({}))) as { login?: string };
      const successMsg = `Successfully connected as @${user.login || "user"}`;

      await this.repo.saveGitHubSettings(
        {
          ...settings,
          lastTestedAt: Date.now(),
          lastTestStatus: "ok",
          lastTestMessage: successMsg,
          rateLimitRemaining: remaining,
        },
        actorId,
      );

      return {
        ok: true,
        message: successMsg,
        login: user.login,
        rateLimitRemaining: remaining,
        rateLimitReset: reset,
      };
    } catch (err: any) {
      const errorMsg = `Connection failed: ${err.message || String(err)}`;
      await this.repo.saveGitHubSettings(
        {
          ...settings,
          lastTestedAt: Date.now(),
          lastTestStatus: "error",
          lastTestMessage: errorMsg,
        },
        actorId,
      );

      return {
        ok: false,
        message: errorMsg,
      };
    }
  }
}
