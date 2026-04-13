import path from "path";
import FastGlob from "fast-glob";

import debug from "./debug.js";
import { romsDirPath, welcomeMessage } from "./helpers/envs.js";
import {
  addFileInfoToPath,
  addRelativeStartPath,
  getJsonTemplateFile,
  addUrlEncodedFileInfo as encodeURL,
} from "./helpers/helpers.js";

const validExtensions = ["nsp", "nsz", "xci", "zip"].map(
  (value) => `**.${value.replace(".", "")}`
);

// Extracts the 16-character hex Title ID from a filename.
// e.g. "Game Name [010010401BC1A000][v0] (0.39 GB).nsz" → "010010401BC1A000"
// Returns null if no Title ID is found.
function extractTitleId(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/\[([0-9A-Fa-f]{16})\]/);
  return match ? match[1].toUpperCase() : null;
}

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

  return Object.assign(jsonTemplate, {
    files,
    directories,
  });
};
