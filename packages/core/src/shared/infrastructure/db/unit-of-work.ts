import type { LibSQLDatabase } from "drizzle-orm/libsql";
import {
  getDb,
  getWriteMutex,
  ensurePragmas,
  type DatabaseName,
} from "./connection-factory";
import * as coreSchema from "./schema";

export type CoreTransaction = Parameters<
  Parameters<LibSQLDatabase<typeof coreSchema>["transaction"]>[0]
>[0];

export interface IUnitOfWork {
  runInTransaction<T>(
    dbName: "core",
    fn: (tx: CoreTransaction) => Promise<T>,
  ): Promise<T>;
  runInTransaction<T>(
    dbName: DatabaseName,
    fn: (tx: any) => Promise<T>,
  ): Promise<T>;
}

export class UnitOfWork implements IUnitOfWork {
  async runInTransaction<T>(
    dbName: DatabaseName,
    fn: (tx: any) => Promise<T>,
  ): Promise<T> {
    await ensurePragmas(dbName);
    const mutex = getWriteMutex(dbName);
    const db = getDb(dbName);

    // 1. Acquire in-process mutex (serializes in-process writes, lets readers bypass)
    return mutex.run(async () => {
      // 2. Execute BEGIN IMMEDIATE via Drizzle/libSQL transaction (mode: "write")
      return db.transaction(async (tx) => {
        return fn(tx);
      });
    });
  }
}

export const uow = new UnitOfWork();
