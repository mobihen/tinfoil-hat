// Use the file system fs promises
import { readFile, writeFile } from "fs/promises";
import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { fileURLToPath } from "url";
import { dirname } from "path";
import urlencode from "urlencode";
import url from "url";

/**
 * Extracts the 16-character hex Title ID from a file path.
 * e.g. "Game [010010401BC1A000][v0] (0.39 GB).nsz" → "010010401BC1A000"
 * Returns null if no Title ID found.
 * @param {string} filePath
 * @returns {string|null}
 */
function extractTitleId(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/\[([0-9A-Fa-f]{16})\]/);
  return match ? match[1].toUpperCase() : null;
}

import { romsDirPath, jsonTemplatePath } from "./envs.js";

const addRelativeStartPath = (path) => {
  path.url = "../" + path.url;
  return path;
};

/**
 *  This function remove special characters that could affect tinfoil listings
 *
 * @param {any} value
 * @returns
 */
function stringNormalizer(value) {
  const replacer = [
    [/\[/gim, "%5B"],
    [/\]/gim, "%5D"],
    [/\(/gim, "%28"],
    [/\)/gim, "%29"],
    [/\=/gim, "%3D"],
    [/\+/gim, "%2B"],
    [/\,/gim, "%2C"],
    [/\;/gim, "%3B"],
    [/\//gim, "%2F"],
    [/\\/gim, "%5C"],
  ];

  if (!value) return value;

  for (const replace of replacer) {
    value = value.replace(replace[0], replace[1]);
  }

  return value;
}
const addUrlEncodedFileInfo = (filePath) => {
  const toReturn = stringNormalizer(url.parse(filePath.url).path);
  filePath.url = toReturn;
  return filePath;
};
const addFileInfoToPath = async (filePath) => {
  const status = fs.statSync(
    path.join(romsDirPath, filePath.replace(/^\.\.\//gim, ""))
  );
  return { url: filePath, size: status.size };
}; //  Shop template file to use
const getJsonTemplateFile = () =>
  JSON5.parse(fs.readFileSync(jsonTemplatePath));

export default function fileDirName(meta) {
  const __filename = fileURLToPath(meta.url);

  const __dirname = dirname(__filename);

  return { __dirname, __filename };
}
export {
  addUrlEncodedFileInfo,
  addFileInfoToPath,
  addRelativeStartPath,
  getJsonTemplateFile,
  fileDirName,
  extractTitleId,
};
