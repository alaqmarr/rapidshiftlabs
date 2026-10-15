export type ApiKeyType = "secret" | "publishable";

export const API_KEY_TYPES: readonly ApiKeyType[] = ["secret", "publishable"] as const;
