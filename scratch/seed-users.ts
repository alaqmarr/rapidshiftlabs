import { Argon2PasswordHasher } from "../packages/core/src/modules/identity/infrastructure/crypto/argon2-password-hasher";
import { getDb, ensurePragmas } from "../packages/core/src/shared/infrastructure/db/connection";
import { sql } from "drizzle-orm";

async function main() {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.AUTH_SECRET = "development-auth-secret-123456789";

  await ensurePragmas("core");
  const hasher = new Argon2PasswordHasher();
  const db = getDb("core");

  const adminHash = await hasher.hash("Admin@RapidShift2026!");
  await db.run(sql`UPDATE admin_users SET password_hash = ${adminHash} WHERE email = 'admin@rapidshiftlabs.com'`);
  console.log("Admin password updated to Admin@RapidShift2026!");

  const clients = await db.all<{ id: string; name: string; slug: string }>(sql`SELECT id, name, slug FROM clients`);
  console.log("Existing clients:", clients);

  let targetClientId = clients[0]?.id;
  if (!targetClientId) {
    targetClientId = "client_acme";
    const now = Date.now();
    await db.run(sql`INSERT INTO clients (id, name, slug, billing_mode, currency, status, created_at) VALUES (${targetClientId}, 'Acme Corporation', 'acme', 'gst', 'INR', 'active', ${now})`);
    console.log("Created client_acme");
  }

  const clientHash = await hasher.hash("Client@RapidShift2026!");
  const now = Date.now();
  await db.run(sql`INSERT OR REPLACE INTO client_users (id, client_id, name, email, password_hash, role, status, session_version, created_at, updated_at) VALUES ('cu_test', ${targetClientId}, 'Acme Admin', 'client@acme.com', ${clientHash}, 'client_admin', 'active', 1, ${now}, ${now})`);
  console.log("Created/updated client user: client@acme.com / Client@RapidShift2026!");
}

main().catch(console.error);
