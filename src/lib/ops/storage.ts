import { openDB } from "idb";

const DB_NAME = "wolf-ops";
const DB_VERSION = 1;

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("kv")) database.createObjectStore("kv");
      if (!database.objectStoreNames.contains("blobs")) database.createObjectStore("blobs");
    },
  });
}

export async function loadWizard(): Promise<unknown | null> {
  const database = await db();
  return (await database.get("kv", "wizard")) ?? null;
}

export async function saveWizard(value: unknown): Promise<void> {
  const database = await db();
  await database.put("kv", value, "wizard");
}

export async function clearWizard(): Promise<void> {
  const database = await db();
  await database.delete("kv", "wizard");
  await database.clear("blobs");
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const database = await db();
  await database.put("blobs", blob, id);
}

export async function loadBlob(id: string): Promise<Blob | null> {
  const database = await db();
  const value = await database.get("blobs", id);
  return value instanceof Blob ? value : null;
}
