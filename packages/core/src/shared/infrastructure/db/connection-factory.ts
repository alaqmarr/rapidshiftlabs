import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../../config";
import { WriteMutex } from "./write-mutex";
import * as coreSchema from "./schema";

export type DatabaseName = "core" | "analytics" | "metrics";

interface DbInstanceCache {
  clients: Map<DatabaseName, Client>;
  drizzle: Map<DatabaseName, LibSQLDatabase<any>>;
  mutexes: Map<DatabaseName, WriteMutex>;
  initializedPragmas: Set<DatabaseName>;
}

declare global {
  // eslint-disable-next-line no-var
  var __rapidshift_db_instances: DbInstanceCache | undefined;
}

function getCache(): DbInstanceCache {
  if (!globalThis.__rapidshift_db_instances) {
    globalThis.__rapidshift_db_instances = {
      clients: new Map(),
      drizzle: new Map(),
      mutexes: new Map(),
      initializedPragmas: new Set(),
    };
  }
  return globalThis.__rapidshift_db_instances;
}

/**
 * Standard PRAGMAs required for libSQL SQLite WAL concurrency.
 */
export async function applyPragmas(client: Client): Promise<void> {
  await client.execute("PRAGMA journal_mode = WAL;");
  await client.execute("PRAGMA synchronous = NORMAL;");
  await client.execute("PRAGMA busy_timeout = 5000;");
  await client.execute("PRAGMA foreign_keys = ON;");
  await client.execute("PRAGMA temp_store = MEMORY;");
  await client.execute("PRAGMA cache_size = -64000;");
  await client.execute("PRAGMA mmap_size = 268435456;");
  await client.execute("PRAGMA wal_autocheckpoint = 1000;");
}

/**
 * Returns the singleton WriteMutex for the given database file.
 */
export function getWriteMutex(name: DatabaseName): WriteMutex {
  const cache = getCache();
  if (!cache.mutexes.has(name)) {
    cache.mutexes.set(name, new WriteMutex());
  }
  return cache.mutexes.get(name)!;
}

/**
 * Returns the raw @libsql/client Client singleton for the given database name.
 */
export function getRawClient(name: DatabaseName): Client {
  const cache = getCache();
  if (cache.clients.has(name)) {
    return cache.clients.get(name)!;
  }

  const config = getConfig();
  const dbPath = config.dbPaths[name];
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const client = createClient({
    url: `file:${dbPath}`,
  });

  cache.clients.set(name, client);
  return client;
}

/**
 * Ensures PRAGMAs have been applied to the client at least once.
 */
export async function ensurePragmas(name: DatabaseName): Promise<void> {
  const cache = getCache();
  if (!cache.initializedPragmas.has(name)) {
    const client = getRawClient(name);
    await applyPragmas(client);
    cache.initializedPragmas.add(name);
  }
}

/**
 * Returns the Drizzle ORM instance for the specified database.
 */
export function getDb(name: "core"): LibSQLDatabase<typeof coreSchema>;
export function getDb(name: DatabaseName): LibSQLDatabase<any>;
export function getDb(name: DatabaseName): LibSQLDatabase<any> {
  const cache = getCache();
  if (cache.drizzle.has(name)) {
    return cache.drizzle.get(name)!;
  }

  const client = getRawClient(name);
  const schema = name === "core" ? coreSchema : {};
  const db = drizzle(client, { schema });

  cache.drizzle.set(name, db);
  return db;
}

/**
 * Closes all open client handles (useful for test tear-downs and graceful process shutdown).
 */
export function closeAllDatabases(): void {
  const cache = getCache();
  for (const client of cache.clients.values()) {
    try {
      client.close();
    } catch {}
  }
  cache.clients.clear();
  cache.drizzle.clear();
  cache.mutexes.clear();
  cache.initializedPragmas.clear();
}
