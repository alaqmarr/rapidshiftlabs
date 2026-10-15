import { createClient } from "@libsql/client";
import { WriteMutex } from "../src/shared/infrastructure/db/write-mutex";

const workerId = process.env.WORKER_ID!;
const dbPath = process.env.DB_PATH!;
const opsCount = parseInt(process.env.OPS_COUNT || "50", 10);

async function runChild() {
  const client = createClient({ url: `file:${dbPath}` });
  const mutex = new WriteMutex();

  // Crucial: Every connection handle MUST apply per-connection PRAGMAs
  await client.execute("PRAGMA busy_timeout = 5000;");
  await client.execute("PRAGMA synchronous = NORMAL;");
  await client.execute("PRAGMA foreign_keys = ON;");

  let successCount = 0;
  let writeCount = 0;
  let readCount = 0;

  for (let i = 0; i < opsCount; i++) {
    const isWrite = i % 2 === 0; // deterministic ~50% writes, 50% reads

    if (isWrite) {
      // Writes must acquire the in-process mutex and execute BEGIN IMMEDIATE
      await mutex.run(async () => {
        const tx = await client.transaction("write"); // BEGIN IMMEDIATE
        try {
          await tx.execute({
            sql: "INSERT INTO test_concurrency_records (worker_id, op_index, created_at) VALUES (?, ?, ?)",
            args: [workerId, i, Date.now()],
          });
          await tx.commit();
          writeCount++;
        } catch (err) {
          await tx.rollback();
          throw err;
        }
      });
    } else {
      // Reads bypass the write mutex entirely and query concurrently
      await client.execute("SELECT count(*) as cnt FROM test_concurrency_records;");
      readCount++;
    }
    successCount++;
  }

  client.close();

  if (process.send) {
    process.send({ workerId, successCount, writeCount, readCount });
  }
  process.exit(0);
}

runChild().catch((err) => {
  console.error(`Worker process ${workerId} failed:`, err);
  process.exit(1);
});
