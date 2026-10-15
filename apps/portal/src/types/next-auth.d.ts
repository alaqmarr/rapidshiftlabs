import type { DefaultSession } from "next-auth";
import type { AdminRole, ClientRole } from "@rsl/core/kernel";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string;
    realm: "admin" | "client";
    role: AdminRole | ClientRole;
    supportLevel?: 1 | 2 | 3 | null;
    clientId?: string;
    sessionVersion: number;
    totpVerified?: boolean;
  }

  interface Session extends DefaultSession {
    user: {
      id: string;
      email: string;
      name: string;
      realm: "admin" | "client";
      role: AdminRole | ClientRole;
      supportLevel?: 1 | 2 | 3 | null;
      clientId?: string;
      sv: number;
      totpVerified?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    email?: string;
    name?: string;
    realm?: "admin" | "client";
    role?: AdminRole | ClientRole;
    supportLevel?: 1 | 2 | 3 | null;
    clientId?: string;
    sv?: number;
    totpVerified?: boolean;
  }
}

declare module "@auth/core/types" {
  interface User {
    id: string;
    email: string;
    name: string;
    realm: "admin" | "client";
    role: AdminRole | ClientRole;
    supportLevel?: 1 | 2 | 3 | null;
    clientId?: string;
    sessionVersion: number;
    totpVerified?: boolean;
  }

  interface Session extends DefaultSession {
    user: {
      id: string;
      email: string;
      name: string;
      realm: "admin" | "client";
      role: AdminRole | ClientRole;
      supportLevel?: 1 | 2 | 3 | null;
      clientId?: string;
      sv: number;
      totpVerified?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sub?: string;
    email?: string;
    name?: string;
    realm?: "admin" | "client";
    role?: AdminRole | ClientRole;
    supportLevel?: 1 | 2 | 3 | null;
    clientId?: string;
    sv?: number;
    totpVerified?: boolean;
  }
}
