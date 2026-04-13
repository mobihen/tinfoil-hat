import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
}).parsed;

import path from "path";
import fileDirName from "./helpers.js";
const romsPath =
  process?.env?.ROMS_DIR_FULLPATH ??
  path.join(fileDirName(import.meta).__dirname, "/../games/");
const romsDirPath = path.resolve(romsPath);

const savesPath =
  process?.env?.SAVES_BACKUP_PATH ?? path.join(romsPath, "/Saves/");
const savesDirPath = path.resolve(savesPath);

const jsonTemplatePath = path.resolve(
  process?.env?.JSON_TEMPLATE_PATH ??
    path.join(fileDirName(import.meta).__dirname, "../../shop_template.jsonc")
);

// Path to the server-side titledb overrides JSON file
const titledbPath = path.resolve(
  process?.env?.TITLEDB_PATH ??
    path.join(fileDirName(import.meta).__dirname, "../../titledb.json")
);

const appPort = process?.env?.TINFOIL_HAT_PORT ?? "80"; // default listen port

const authUsers = process?.env?.AUTH_USERS ?? null; // default listen port
const unauthorizedMessage =
  process?.env?.UNAUTHORIZED_MSG ?? "No tricks and treats for you!!";
const welcomeMessage = process?.env?.WELCOME_MSG ?? null;

export {
  savesDirPath,
  romsDirPath,
  jsonTemplatePath,
  titledbPath,
  appPort,
  authUsers,
  unauthorizedMessage,
  welcomeMessage,
};
