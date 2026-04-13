import { Router } from "express";
import path from "path";
import { mkdirSync, existsSync, createReadStream, writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import FastGlob from "fast-glob";
import { romsDirPath, titledbPath } from "../helpers/envs.js";
import { extractTitleId } from "../helpers/helpers.js";
import { getAll, upsert, remove } from "../modules/titledb-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

const TITLE_ID_RE = /^[0-9A-Fa-f]{16}$/;

const validExtensions = ["nsp", "nsz", "xci", "zip"].map(
  (v) => `**.${v}`
);

// Cover image cache — sibling directory next to titledb.json
const coversDir = path.join(path.dirname(titledbPath), "covers");
mkdirSync(coversDir, { recursive: true });

// Normalize any Title ID to its base-game ID (last 3 hex chars → 000)
function toBaseId(titleId) {
  return titleId.slice(0, -3).toUpperCase() + "000";
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

  if (existsSync(cachePath)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return createReadStream(cachePath).pipe(res);
  }

  try {
    const ctrl     = new AbortController();
    const timeout  = setTimeout(() => ctrl.abort(), 10_000);
    const upstream = await fetch(
      `https://tinfoil.media/ti/${baseId}/240/240`,
      { signal: ctrl.signal, headers: { "User-Agent": "tinfoil-hat-server" } }
    );
    clearTimeout(timeout);

    if (!upstream.ok) return res.sendStatus(404);

    const buf = Buffer.from(await upstream.arrayBuffer());
    writeFileSync(cachePath, buf);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch {
    res.sendStatus(404);
  }
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
