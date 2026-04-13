import path from "path";
import FastGlob from "fast-glob";

import debug from "./debug.js";
import { romsDirPath, welcomeMessage } from "./helpers/envs.js";
import {
  addFileInfoToPath,
  addRelativeStartPath,
  getJsonTemplateFile,
  addUrlEncodedFileInfo as encodeURL,
  extractTitleId,
} from "./helpers/helpers.js";
import { getAll as getTitledbOverrides } from "./modules/titledb-store.js";
import { downloadMissingCover, toBaseId } from "./routes/titledb-router.js";

const validExtensions = ["nsp", "nsz", "xci", "zip"].map(
  (value) => `**.${value.replace(".", "")}`
);

// Sorts files by Title ID so base game, updates and DLC appear grouped together.
// Files without a Title ID are placed at the end.
function sortByTitleId(files) {
  return [...files].sort((a, b) => {
    const idA = extractTitleId(a.url) ?? "\xFF";
    const idB = extractTitleId(b.url) ?? "\xFF";
    return idA.localeCompare(idB);
  });
}

export default async () => {

  const jsonTemplate = getJsonTemplateFile();
  let files = await FastGlob(validExtensions, {
    cwd: romsDirPath, // use path to resolve games
    dot: false, // ignore dot starting path
    onlyFiles: true, // only list files
    braceExpansion: false,
    absolute: false, // absolute path
  });
  let directories = await FastGlob(["**"], {
    cwd: romsDirPath, // use path to resolve games
    dot: false, // ignore dot starting path
    onlyFiles: true, // only list files
    braceExpansion: false,
    onlyDirectories: true,
    absolute: false, // absolute path
  });
  debug.log("total game/save files found:", files.length);
  debug.log("total directories found:", directories.length);

  if (welcomeMessage) {
    if (!jsonTemplate.success) {
      jsonTemplate.success = welcomeMessage;
    }
  }

  files = sortByTitleId(
    (await Promise.all(files.map(addFileInfoToPath)))
      .map(encodeURL)
      .map(addRelativeStartPath)
  );

  directories = directories
    .map((file) => {
      return { url: file };
    })
    .map(encodeURL)
    .map(addRelativeStartPath)
    .map((file) => {
      return file.url;
    });

  // Merge titledb: template entries are the base, server-side overrides take priority
  const titledb = Object.assign(
    {},
    jsonTemplate.titledb ?? {},
    getTitledbOverrides()
  );

  // Background fetch of missing covers for all found titleIDs (to speed up admin panel later)
  const allBaseIds = new Set();
  for (const f of files) {
    const tid = extractTitleId(f.url);
    if (tid) allBaseIds.add(toBaseId(tid));
  }
  setTimeout(() => {
    Promise.allSettled([...allBaseIds].map(id => downloadMissingCover(id)));
  }, 100);

  return Object.assign(jsonTemplate, {
    files,
    directories,
    titledb,
  });
};
