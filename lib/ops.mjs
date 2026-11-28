// Compatibility barrel (prefer importing domain modules directly).
export { cmdInstall, cmdUninstall } from './install.mjs';
export { cmdSource } from './skills.mjs';
export {
  cmdInit, cmdLink, cmdDocs, cmdMode, cmdDetect,
  cmdSync, cmdPull, cmdDoc, cmdMap, cmdCheck, cmdDoctor,
} from './project.mjs';
