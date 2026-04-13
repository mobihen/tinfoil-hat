import { readFileSync, writeFileSync, existsSync } from "fs";
import { titledbPath } from "../helpers/envs.js";

function load() {
  if (!existsSync(titledbPath)) return {};
  try {
    return JSON.parse(readFileSync(titledbPath, "utf-8"));
  } catch {
    return {};
  }
}

function save(db) {
  writeFileSync(titledbPath, JSON.stringify(db, null, 2), "utf-8");
}

export function getAll() {
  return load();
}

export function upsert(titleId, entry) {
  const db = load();
  const id = titleId.toUpperCase();
  db[id] = { ...entry, id };
  save(db);
  return db[id];
}

export function remove(titleId) {
  const db = load();
  delete db[titleId.toUpperCase()];
  save(db);
}
