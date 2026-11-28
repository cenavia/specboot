// Public library surface for the specboot CLI (domain modules under lib/).
export { DATA, HARNESS } from './paths.mjs';
export { detectStack } from './detect.mjs';
export {
  DETECT_PRESET_MAP,
  detectLabelMapping,
  preferDetectedTechs,
  planPresetFromDetect,
  formatPresetPlan,
  createPresetFromDetect,
  cmdPreset,
} from './preset.mjs';
export { cmdSource } from './skills.mjs';
export { cmdInstall, cmdUninstall } from './install.mjs';
export {
  cmdInit, cmdLink, cmdDocs, cmdMode, cmdDetect,
  cmdSync, cmdPull, cmdDoc, cmdMap, cmdCheck, cmdDoctor,
} from './project.mjs';
