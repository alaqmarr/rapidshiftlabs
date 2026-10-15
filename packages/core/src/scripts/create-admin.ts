if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "development-auth-secret-123456789";
}

import { CreateAdminUserUseCase } from "../modules/identity/application/use-cases/create-admin-user.usecase";
import { Argon2PasswordHasher } from "../modules/identity/infrastructure/crypto/argon2-password-hasher";
import { DrizzleAdminUserRepository } from "../modules/identity/infrastructure/repositories/drizzle-admin-user.repository";
import { getDb, ensurePragmas } from "../shared/infrastructure/db/connection";

async function main() {
  const email = process.argv[2] || "admin@rapidshiftlabs.com";
  const password = process.argv[3] || "Admin@RapidShift2026!";

  const hasher = new Argon2PasswordHasher();
  await ensurePragmas("core");
  const coreDb = getDb("core");
  const repo = new DrizzleAdminUserRepository(coreDb);
  const useCase = new CreateAdminUserUseCase(repo, hasher);

  try {
    const admin = await useCase.execute({
      email,
      password,
      name: "System Admin",
      role: "owner",
    });
    console.log(`Successfully created admin user: ${admin.email.value} (ID: ${admin.id})`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`Admin user already exists: ${email}`);
    } else {
      console.error("Error creating admin:", error.message);
    }
  }
}

main();
