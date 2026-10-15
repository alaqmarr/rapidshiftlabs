import { CreateAdminUserUseCase } from "./src/modules/identity/application/use-cases/create-admin-user.usecase";
import { Argon2PasswordHasher } from "./src/modules/identity/infrastructure/crypto/argon2-password-hasher";
import { DrizzleAdminUserRepository } from "./src/modules/identity/infrastructure/repositories/drizzle-admin-user.repository";
import { getDb, ensurePragmas } from "./src/shared/infrastructure/db/connection";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  
  if (!email || !password) {
    console.error("Usage: tsx create-admin.ts <email> <password>");
    process.exit(1);
  }

  const hasher = new Argon2PasswordHasher();
  await ensurePragmas("core");
  const coreDb = getDb("core");
  const repo = new DrizzleAdminUserRepository(coreDb);
  const useCase = new CreateAdminUserUseCase(repo, hasher);

  try {
    const result = await useCase.execute({ email, password, name: "Admin" });
    if (result.isOk()) {
      console.log(`Successfully created admin user: ${email}`);
    } else {
      console.error(`Failed to create admin user:`, result.error);
    }
  } catch (error) {
    console.error("Error executing use case:", error);
  }
}

main();
