import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Data Layer Concurrency & Multi-Process Stress Test", () => {
  const testDataDir = path.join(__dirname, "temp_concurrency_test");
  const coreDbPath = path.join(testDataDir, "core.db");
  const workerScriptPath = path.join(__dirname, "concurrency_worker_child.ts");

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Initialize core.db with PRAGMAs and schema
    const client = createClient({ url: `file:${coreDbPath}` });
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA synchronous = NORMAL;");
    await client.execute("PRAGMA busy_timeout = 5000;");
    await client.execute("PRAGMA foreign_keys = ON;");
    await client.execute("PRAGMA temp_store = MEMORY;");
    await client.execute("PRAGMA cache_size = -64000;");
    await client.execute("PRAGMA mmap_size = 268435456;");
    await client.execute("PRAGMA wal_autocheckpoint = 1000;");

    await client.execute(`
      CREATE TABLE IF NOT EXISTS test_concurrency_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id TEXT NOT NULL,
        op_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    client.close();
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("spawns 3 OS child processes doing 50 concurrent mixed read/writes with zero SQLITE_BUSY", async () => {
    const numWorkers = 3;
    const opsPerWorker = 50;
    const workerPromises: Promise<{
      workerId: string;
      successCount: number;
      writeCount: number;
      readCount: number;
    }>[] = [];

    for (let i = 0; i < numWorkers; i++) {
      const workerId = `proc_${i + 1}`;
      const p = new Promise<{
        workerId: string;
        successCount: number;
        writeCount: number;
        readCount: number;
      }>((resolve, reject) => {
        const child = fork(workerScriptPath, [], {
          env: {
            ...process.env,
            CHILD_WORKER: "true",
            WORKER_ID: workerId,
            DB_PATH: coreDbPath,
            OPS_COUNT: opsPerWorker.toString(),
          },
          execArgv: ["--import", "tsx"],
        });

        let workerResult: any = null;
        child.on("message", (msg) => {
          workerResult = msg;
        });

        child.on("exit", (code) => {
          if (code === 0 && workerResult) {
            resolve(workerResult);
          } else {
            reject(
              new Error(
                `Worker ${workerId} failed with exit code ${code}. Result: ${JSON.stringify(workerResult)}`,
              ),
            );
          }
        });

        child.on("error", (err) => reject(err));
      });

      workerPromises.push(p);
    }

    const results = await Promise.all(workerPromises);

    // 1. Assert all workers completed without errors
    expect(results).toHaveLength(numWorkers);
    let totalExpectedWrites = 0;
    for (const res of results) {
      expect(res.successCount).toBe(opsPerWorker);
      totalExpectedWrites += res.writeCount;
    }

    // 2. Verify WAL mode persistence
    const verifyClient = createClient({ url: `file:${coreDbPath}` });
    const journalRes = await verifyClient.execute("PRAGMA journal_mode;");
    const mode = (journalRes.rows[0] as any)?.journal_mode;
    expect(mode.toLowerCase()).toBe("wal");

    // 3. Verify total rows written match sum of all worker writes
    const countRes = await verifyClient.execute(
      "SELECT count(*) as total FROM test_concurrency_records;",
    );
    const totalRows = Number((countRes.rows[0] as any)?.total);
    expect(totalRows).toBe(totalExpectedWrites);

    verifyClient.close();
  }, 30000);
});
