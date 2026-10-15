import { hash, verify } from "@node-rs/argon2";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";

export class Argon2PasswordHasher implements IPasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    if (!plainPassword || plainPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }
    return hash(plainPassword, {
      algorithm: 2, // Algorithm.Argon2id = 2 (numeric literal avoids const enum isolatedModules error)
      memoryCost: 19456, // 19 MiB
      timeCost: 2, // 2 passes
      parallelism: 1,
      outputLen: 32,
    });
  }

  async verify(hashedPassword: string, plainPassword: string): Promise<boolean> {
    if (!hashedPassword || !plainPassword) return false;
    try {
      return await verify(hashedPassword, plainPassword);
    } catch {
      return false;
    }
  }
}
