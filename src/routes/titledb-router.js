import { Router } from "express";
import path from "path";
import { mkdirSync, existsSync, createReadStream, writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import FastGlob from "fast-glob";
import { romsDirPath, titledbPath, coversDirPath } from "../helpers/envs.js";
import { extractTitleId } from "../helpers/helpers.js";
import { getAll, upsert, remove } from "../modules/titledb-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

const TITLE_ID_RE = /^[0-9A-Fa-f]{16}$/;

const validExtensions = ["nsp", "nsz", "xci", "zip"].map(
  (v) => `**.${v}`
);

// Cover image cache
const coversDir = coversDirPath;
mkdirSync(coversDir, { recursive: true });

// Normalize any Title ID to its base-game ID (using Switch title ID bitmask)
export function toBaseId(titleId) {
  try {
    return (BigInt("0x" + titleId) & 0xFFFFFFFFFFFFE000n).toString(16).toUpperCase().padStart(16, "0");
  } catch {
    return titleId.slice(0, -3).toUpperCase() + "000";
  }
}

// Background method to download cover missing on disk
export async function downloadMissingCover(baseId) {
  if (!TITLE_ID_RE.test(baseId)) return;
  const cachePath = path.join(coversDir, `${baseId}.jpg`);
  if (existsSync(cachePath)) return;

  try {
    const ctrl     = new AbortController();
    const timeout  = setTimeout(() => ctrl.abort(), 10_000);
    const upstream = await fetch(
      `https://tinfoil.media/ti/${baseId}/240/240`,
      { signal: ctrl.signal, headers: { "User-Agent": "tinfoil-hat-server" } }
    );
    clearTimeout(timeout);

    if (upstream.ok) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      writeFileSync(cachePath, buf);
    }
  } catch (err) {
    // suppress connection errors during background logic
  }
}

// ─── REST API ────────────────────────────────────────────────────────────────

router.get("/api/titledb", (_req, res) => {
  res.json(getAll());
});

router.get("/api/titledb/games", async (_req, res) => {
  const files = await FastGlob(validExtensions, {
    cwd: romsDirPath,
    dot: false,
    onlyFiles: true,
    braceExpansion: false,
    absolute: false,
  });

  const seen = new Map();
  for (const f of files) {
    const id = extractTitleId(f);
    if (id && !seen.has(id)) seen.set(id, path.basename(f));
  }

  const result = [...seen.entries()]
    .map(([titleId, filename]) => ({ titleId, filename }))
    .sort((a, b) => a.titleId.localeCompare(b.titleId));

  res.json(result);
});

// Cover art: fetch from tinfoil.media with a 10-second timeout, cache on disk
router.get("/api/titledb/cover/:titleId", async (req, res) => {
  const { titleId } = req.params;
  if (!TITLE_ID_RE.test(titleId)) return res.sendStatus(400);

  const baseId    = toBaseId(titleId);
  const cachePath = path.join(coversDir, `${baseId}.jpg`);

  await downloadMissingCover(baseId);

  if (existsSync(cachePath)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return createReadStream(cachePath).pipe(res);
  }
  return res.sendStatus(404);
});

router.put("/api/titledb/:titleId", (req, res) => {
  const { titleId } = req.params;
  if (!TITLE_ID_RE.test(titleId)) {
    return res.status(400).json({ error: "Invalid Title ID format" });
  }
  const allowed = ["id","name","version","region","releaseDate","rating","publisher","description","size","rank"];
  const entry = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== "") entry[key] = req.body[key];
  }
  res.json(upsert(titleId, entry));
});

router.delete("/api/titledb/:titleId", (req, res) => {
  const { titleId } = req.params;
  if (!TITLE_ID_RE.test(titleId)) {
    return res.status(400).json({ error: "Invalid Title ID format" });
  }
  remove(titleId);
  res.sendStatus(204);
});

// ─── GUI ─────────────────────────────────────────────────────────────────────

router.get("/admin", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(GUI_HTML);
});


// ─── HTML ───────────────────────────────────────────────────────────────────────────────

const GUI_HTML = readFileSync(path.join(__dirname, "admin.html"), "utf-8");


export default router;
