import { Router } from "express";
import path from "path";
import { mkdirSync, existsSync, createReadStream, writeFileSync } from "fs";
import FastGlob from "fast-glob";
import { romsDirPath, titledbPath } from "../helpers/envs.js";
import { extractTitleId } from "../helpers/helpers.js";
import { getAll, upsert, remove } from "../modules/titledb-store.js";

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

// GET /api/titledb  →  all overrides
router.get("/api/titledb", (_req, res) => {
  res.json(getAll());
});

// GET /api/titledb/games  →  Title IDs detected in the games folder
router.get("/api/titledb/games", async (_req, res) => {
  const files = await FastGlob(validExtensions, {
    cwd: romsDirPath,
    dot: false,
    onlyFiles: true,
    braceExpansion: false,
    absolute: false,
  });

  const seen = new Map(); // titleId → first filename found
  for (const f of files) {
    const id = extractTitleId(f);
    if (id && !seen.has(id)) seen.set(id, path.basename(f));
  }

  const result = [...seen.entries()].map(([titleId, filename]) => ({
    titleId,
    filename,
  }));
  result.sort((a, b) => a.titleId.localeCompare(b.titleId));
  res.json(result);
});

// GET /api/titledb/cover/:titleId
// Fetches cover art from tinfoil.media, caches locally, returns image bytes.
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
    const upstream = await fetch(
      `https://tinfoil.media/ti/${baseId}/240/240`,
      { headers: { "User-Agent": "tinfoil-hat-server" } }
    );
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

// PUT /api/titledb/:titleId  →  create / update an entry
router.put("/api/titledb/:titleId", (req, res) => {
  const { titleId } = req.params;
  if (!TITLE_ID_RE.test(titleId)) {
    return res.status(400).json({ error: "Invalid Title ID format" });
  }
  const allowed = ["id","name","version","region","releaseDate","rating","publisher","description","size","rank"];
  const entry = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== "") {
      entry[key] = req.body[key];
    }
  }
  res.json(upsert(titleId, entry));
});

// DELETE /api/titledb/:titleId
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

// ─── HTML ─────────────────────────────────────────────────────────────────────

const GUI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TitleDB Editor · TinfoilHat</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f6f8fa;color:#24292f;min-height:100vh}
header{background:#24292f;color:#fff;padding:.75rem 1.5rem;display:flex;align-items:center;gap:.75rem}
header h1{font-size:1.1rem;font-weight:600}
header span{opacity:.6;font-size:.85rem}
.container{max-width:1200px;margin:0 auto;padding:1.5rem}
.tabs{display:flex;gap:0;border-bottom:2px solid #d0d7de;margin-bottom:1.5rem}
.tab{padding:.5rem 1.25rem;cursor:pointer;border:none;background:none;font-size:.9rem;color:#57606a;border-bottom:2px solid transparent;margin-bottom:-2px;font-weight:500}
.tab.active{color:#0969da;border-bottom-color:#0969da}
.tab:hover:not(.active){color:#24292f}
.panel{display:none}.panel.active{display:block}
.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
.toolbar h2{font-size:1rem;font-weight:600}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;font-size:.875rem}
th{background:#f6f8fa;padding:.6rem .75rem;text-align:left;font-weight:600;border-bottom:1px solid #d0d7de;white-space:nowrap}
td{padding:.45rem .75rem;border-bottom:1px solid #d0d7de;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f6f8fa}
code{font-family:monospace;background:#eaeef2;padding:.1rem .3rem;border-radius:3px;font-size:.8rem}
.badge{display:inline-block;padding:.15rem .5rem;border-radius:10px;font-size:.75rem;font-weight:500}
.badge-green{background:#dafbe1;color:#116329}
.badge-gray{background:#eaeef2;color:#57606a}
.btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .75rem;border:1px solid transparent;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:500;white-space:nowrap}
.btn-primary{background:#0969da;color:#fff;border-color:#0969da}.btn-primary:hover{background:#0860ca}
.btn-danger{background:#fff;color:#cf222e;border-color:#d0d7de}.btn-danger:hover{background:#fff1f0;border-color:#cf222e}
.btn-outline{background:#fff;color:#24292f;border-color:#d0d7de}.btn-outline:hover{background:#f6f8fa}
.btn-sm{padding:.2rem .5rem;font-size:.75rem}
.empty{text-align:center;padding:2rem;color:#57606a;font-size:.9rem}
.cover-thumb{width:48px;height:48px;object-fit:cover;border-radius:4px;background:#eaeef2;display:block}
.cover-thumb.loading{opacity:.3}
/* modal */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;align-items:center;justify-content:center}
.overlay.open{display:flex}
.modal{background:#fff;border-radius:8px;width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.18)}
.modal-header{padding:1rem 1.25rem;border-bottom:1px solid #d0d7de;display:flex;align-items:center;gap:1rem;justify-content:space-between}
.modal-header h3{font-size:1rem;font-weight:600}
.modal-cover{width:72px;height:72px;object-fit:cover;border-radius:6px;background:#eaeef2;flex-shrink:0}
.modal-close{background:none;border:none;cursor:pointer;font-size:1.25rem;color:#57606a;line-height:1;padding:.2rem}
.modal-body{padding:1.25rem}
.modal-footer{padding:1rem 1.25rem;border-top:1px solid #d0d7de;display:flex;justify-content:flex-end;gap:.5rem}
.field{margin-bottom:.9rem}
.field label{display:block;font-size:.8rem;font-weight:600;margin-bottom:.3rem}
.field input,.field textarea,.field select{width:100%;padding:.4rem .6rem;border:1px solid #d0d7de;border-radius:6px;font-size:.875rem;color:#24292f}
.field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:#0969da;box-shadow:0 0 0 3px rgba(9,105,218,.1)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;background:#24292f;color:#fff;padding:.6rem 1rem;border-radius:6px;font-size:.85rem;opacity:0;transition:opacity .3s;pointer-events:none;z-index:200}
.toast.show{opacity:1}
</style>
</head>
<body>
<header>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
  <h1>TinfoilHat</h1>
  <span>TitleDB Editor</span>
</header>

<div class="container">
  <div class="tabs">
    <button class="tab active" onclick="showTab('detected',this)">Detected Games</button>
    <button class="tab" onclick="showTab('overrides',this)">Custom Overrides</button>
  </div>

  <div id="panel-detected" class="panel active">
    <div class="toolbar">
      <h2 id="detected-title">Detected Games</h2>
      <button class="btn btn-outline btn-sm" onclick="loadData()">↻ Refresh</button>
    </div>
    <table>
      <thead><tr><th style="width:56px"></th><th>Title ID</th><th>Filename</th><th>Override</th><th></th></tr></thead>
      <tbody id="detected-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>

  <div id="panel-overrides" class="panel">
    <div class="toolbar">
      <h2>Custom Overrides</h2>
      <button class="btn btn-primary btn-sm" onclick="openModal(null)">+ Add Override</button>
    </div>
    <table>
      <thead><tr><th style="width:56px"></th><th>Title ID</th><th>Name</th><th>Publisher</th><th>Region</th><th></th></tr></thead>
      <tbody id="overrides-body"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
    </table>
  </div>
</div>

<!-- Edit Modal -->
<div class="overlay" id="overlay">
  <div class="modal">
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:.75rem;min-width:0">
        <img id="modal-cover" class="modal-cover" src="" alt="" onerror="this.style.visibility='hidden'">
        <h3 id="modal-title">Edit Override</h3>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="entry-form" onsubmit="saveEntry(event)">
        <div class="field">
          <label>Title ID <span style="color:#cf222e">*</span></label>
          <input id="f-id" required pattern="[0-9A-Fa-f]{16}" maxlength="16" placeholder="010010401BC1A000" autocomplete="off" style="font-family:monospace">
        </div>
        <div class="field">
          <label>Name</label>
          <input id="f-name" placeholder="Game display name">
        </div>
        <div class="grid2">
          <div class="field">
            <label>Publisher</label>
            <input id="f-publisher" placeholder="Publisher / developer">
          </div>
          <div class="field">
            <label>Region</label>
            <select id="f-region">
              <option value="">— Any —</option>
              <option>US</option><option>EU</option><option>JP</option>
              <option>CN</option><option>KR</option><option>TW</option><option>HK</option>
            </select>
          </div>
          <div class="field">
            <label>Version</label>
            <input id="f-version" type="number" min="0" value="0">
          </div>
          <div class="field">
            <label>Release Date <small style="color:#57606a;font-weight:400">(YYYYMMDD)</small></label>
            <input id="f-releaseDate" type="number" placeholder="20180801">
          </div>
          <div class="field">
            <label>Rating</label>
            <select id="f-rating">
              <option value="">— Unknown —</option>
              <option value="3">3 · Early Childhood</option>
              <option value="6">6 · Everyone</option>
              <option value="10">10 · Everyone 10+</option>
              <option value="13">13 · Teen</option>
              <option value="18">18 · Mature</option>
            </select>
          </div>
          <div class="field">
            <label>Size <small style="color:#57606a;font-weight:400">(bytes)</small></label>
            <input id="f-size" type="number" min="0" placeholder="auto from file">
          </div>
          <div class="field">
            <label>Rank</label>
            <input id="f-rank" type="number" min="1" value="1">
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea id="f-description" rows="3" placeholder="Short description shown in Tinfoil"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="document.getElementById('entry-form').requestSubmit()">Save</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let overrides = {};
let detected  = [];

function coverUrl(titleId) {
  return '/api/titledb/cover/' + titleId;
}

function toBaseId(titleId) {
  return titleId.slice(0, -3).toUpperCase() + '000';
}

async function loadData() {
  document.getElementById('detected-body').innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
  [overrides, detected] = await Promise.all([
    fetch('/api/titledb').then(r => r.json()),
    fetch('/api/titledb/games').then(r => r.json()),
  ]);
  document.getElementById('detected-title').textContent = 'Detected Games (' + detected.length + ')';
  renderDetected();
  renderOverrides();
}

function renderDetected() {
  const tbody = document.getElementById('detected-body');
  if (!detected.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No game files found in the library folder.</td></tr>';
    return;
  }
  tbody.innerHTML = detected.map(({ titleId, filename }) => {
    const ov    = overrides[titleId];
    const base  = toBaseId(titleId);
    const badge = ov
      ? \`<span class="badge badge-green">✓ \${escHtml(ov.name || titleId)}</span>\`
      : '<span class="badge badge-gray">none</span>';
    return \`<tr>
      <td><img class="cover-thumb loading" src="\${coverUrl(base)}"
           onload="this.classList.remove('loading')" onerror="this.style.opacity='.15'" alt=""></td>
      <td><code>\${titleId}</code></td>
      <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\${escHtml(filename)}">\${escHtml(filename)}</td>
      <td>\${badge}</td>
      <td style="text-align:right">
        <button class="btn btn-outline btn-sm" onclick="openModal('\${titleId}',\`\${escHtml(filename)}\`)">Edit</button>
      </td>
    </tr>\`;
  }).join('');
}

function renderOverrides() {
  const tbody = document.getElementById('overrides-body');
  const entries = Object.values(overrides);
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No overrides yet. Go to "Detected Games" to add one.</td></tr>';
    return;
  }
  entries.sort((a,b) => a.id.localeCompare(b.id));
  tbody.innerHTML = entries.map(e => {
    const base = toBaseId(e.id);
    return \`<tr>
      <td><img class="cover-thumb loading" src="\${coverUrl(base)}"
           onload="this.classList.remove('loading')" onerror="this.style.opacity='.15'" alt=""></td>
      <td><code>\${e.id}</code></td>
      <td>\${escHtml(e.name || '')  || '<span style="color:#57606a">—</span>'}</td>
      <td>\${escHtml(e.publisher || '') || '<span style="color:#57606a">—</span>'}</td>
      <td>\${e.region || '<span style="color:#57606a">—</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openModal('\${e.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEntry('\${e.id}')">Delete</button>
      </td>
    </tr>\`;
  }).join('');
}

function showTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');
}

function openModal(titleId, filename) {
  const e       = overrides[titleId] || {};
  const guessed = filename ? filename.replace(/\\[.*$/, '').trim() : '';
  const base    = titleId ? toBaseId(titleId) : '';
  document.getElementById('modal-title').textContent  = titleId ? 'Edit · ' + titleId : 'Add Override';
  const covEl = document.getElementById('modal-cover');
  if (base) { covEl.src = coverUrl(base); covEl.style.visibility = ''; }
  else       { covEl.src = ''; covEl.style.visibility = 'hidden'; }
  document.getElementById('f-id').value        = titleId || '';
  document.getElementById('f-id').readOnly     = !!titleId;
  document.getElementById('f-id').style.background = titleId ? '#f6f8fa' : '';
  document.getElementById('f-name').value         = e.name        ?? guessed;
  document.getElementById('f-publisher').value    = e.publisher   ?? '';
  document.getElementById('f-region').value       = e.region      ?? '';
  document.getElementById('f-version').value      = e.version     ?? 0;
  document.getElementById('f-releaseDate').value  = e.releaseDate ?? '';
  document.getElementById('f-rating').value       = e.rating      ?? '';
  document.getElementById('f-size').value         = e.size        ?? '';
  document.getElementById('f-rank').value         = e.rank        ?? 1;
  document.getElementById('f-description').value  = e.description ?? '';
  document.getElementById('overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
}

async function saveEntry(ev) {
  ev.preventDefault();
  const id   = document.getElementById('f-id').value.toUpperCase();
  const body = {
    name:        document.getElementById('f-name').value        || undefined,
    publisher:   document.getElementById('f-publisher').value   || undefined,
    region:      document.getElementById('f-region').value      || undefined,
    version:     numOrUndef(document.getElementById('f-version').value),
    releaseDate: numOrUndef(document.getElementById('f-releaseDate').value),
    rating:      numOrUndef(document.getElementById('f-rating').value),
    size:        numOrUndef(document.getElementById('f-size').value),
    rank:        numOrUndef(document.getElementById('f-rank').value),
    description: document.getElementById('f-description').value || undefined,
  };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  const res = await fetch('/api/titledb/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    overrides[id] = await res.json();
    closeModal();
    renderDetected();
    renderOverrides();
    toast('Saved!');
  } else {
    toast('Error: ' + res.status, true);
  }
}

async function deleteEntry(titleId) {
  if (!confirm('Delete override for ' + titleId + '?')) return;
  await fetch('/api/titledb/' + titleId, { method: 'DELETE' });
  delete overrides[titleId];
  renderDetected();
  renderOverrides();
  toast('Deleted');
}

function numOrUndef(v) { const n = Number(v); return (v !== '' && !isNaN(n)) ? n : undefined; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let toastTimer;
function toast(msg, err) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = err ? '#cf222e' : '#24292f';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

loadData();
</script>
</body>
</html>`;

export default router;
