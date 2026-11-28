import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = os.homedir();
export const DATA = process.env.SPECBOOT_DATA || path.join(HOME, '.specboot-data');
export const STORES = path.join(DATA, 'stores');
export const GENERATED = path.join(DATA, 'generated-skills');
export const PROJECTS = path.join(DATA, 'projects.json');
export const SOURCES = path.join(DATA, 'sources.json');
export const LINKS = path.join(DATA, 'links.json');
export const DEFAULT_FRONTS = path.join(DATA, 'fronts.default.json');
export const DATA_PRESETS = path.join(DATA, 'presets');
export const HARNESS_PRESETS = path.join(HARNESS, 'presets');
export const HARNESS_MANIFESTS = path.join(HARNESS_PRESETS, 'manifests');
export const OPENSPEC = process.env.SPECBOOT_OPENSPEC_BIN || 'openspec';
export const IS_WIN = process.platform === 'win32';

export const EXCLUDES = [
  '/openspec', '/.claude/', '/.cursor/', '/.codex/', '/.opencode/', '/.agents/', '/.atl/', '/.codegraph/',
  '/CLAUDE.md', '/AGENTS.md', '/GEMINI.md', '/codex.md',
];
export const BLOCK_RE = String.raw`^(openspec(/|$)|\.claude/|\.cursor/|\.codex/|\.opencode/|\.agents/|\.atl/|\.codegraph/|(CLAUDE|AGENTS|GEMINI)\.md$|codex\.md$)`;
export const EFFICIENCY_SKILLS = path.join(DATA, 'efficiency-skills');
export const EFFICIENCY_INSTALL = path.join(HARNESS, 'scripts', 'efficiency', 'install-all.sh');
export const EFFICIENCY_INSTALL_PS1 = path.join(HARNESS, 'scripts', 'efficiency', 'install-all.ps1');

export const MARK = { start: '<!-- specboot:start -->', end: '<!-- specboot:end -->' };
export const YMARK = { start: '# >>> specboot (managed block; rewrite with `specboot detect --write`)', end: '# <<< specboot' };
export const XMARK = { start: '# >>> specboot', end: '# <<< specboot' };
