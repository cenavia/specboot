#!/usr/bin/env node
// specboot — global harness for OpenSpec-driven work that keeps client repos clean.
// Zero dependencies. Requires Node >= 20 and git. OpenSpec CLI is used when present.

import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const DATA = process.env.SPECBOOT_DATA || path.join(HOME, '.specboot-data');
const STORES = path.join(DATA, 'stores');
const GENERATED = path.join(DATA, 'generated-skills');
const PROJECTS = path.join(DATA, 'projects.json');
const SOURCES = path.join(DATA, 'sources.json');
const LINKS = path.join(DATA, 'links.json');
const DEFAULT_FRONTS = path.join(DATA, 'fronts.default.json');
const OPENSPEC = process.env.SPECBOOT_OPENSPEC_BIN || 'openspec';
const IS_WIN = process.platform === 'win32';

// Paths that must never be added to a client repository.
const EXCLUDES = [
  '/openspec', '/.claude/', '/.cursor/', '/.codex/', '/.opencode/', '/.agents/', '/.atl/', '/.codegraph/',
  '/CLAUDE.md', '/AGENTS.md', '/GEMINI.md', '/codex.md',
];
const BLOCK_RE = String.raw`^(openspec(/|$)|\.claude/|\.cursor/|\.codex/|\.opencode/|\.agents/|\.atl/|\.codegraph/|(CLAUDE|AGENTS|GEMINI)\.md$|codex\.md$)`;
const EFFICIENCY_SKILLS = path.join(DATA, 'efficiency-skills');
const EFFICIENCY_INSTALL = path.join(HARNESS, 'scripts', 'efficiency', 'install-all.sh');
const EFFICIENCY_INSTALL_PS1 = path.join(HARNESS, 'scripts', 'efficiency', 'install-all.ps1');

const MARK = { start: '<!-- specboot:start -->', end: '<!-- specboot:end -->' };
const YMARK = { start: '# >>> specboot (managed block; rewrite with `specboot detect --write`)', end: '# <<< specboot' };
const XMARK = { start: '# >>> specboot', end: '# <<< specboot' };

// ---------------------------------------------------------------- helpers

const log = (m) => console.log(m);
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  warn  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
function die(m) { console.error(`specboot: ${m}`); process.exit(1); }

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: IS_WIN && cmd !== 'git', ...opts }).trim();
}
function tryRun(cmd, args, opts) { try { return run(cmd, args, opts); } catch { return null; } }
const git = (cwd, ...args) => run('git', args, { cwd });
const tryGit = (cwd, ...args) => tryRun('git', args, { cwd });

const exists = (p) => fs.existsSync(p);
const read = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : '');
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
function lstat(p) { try { return fs.lstatSync(p); } catch { return null; } }
function real(p) { try { return fs.realpathSync(p); } catch { return null; } }
function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function writeJson(p, v) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); }

function linkDir(target, linkPath) {
  mkdirp(path.dirname(linkPath));
  fs.symlinkSync(target, linkPath, IS_WIN ? 'junction' : 'dir');
}

// Replace (or append) a marked block inside a text file, leaving everything else untouched.
function upsertBlock(file, start, end, body) {
  const block = `${start}\n${body.trim()}\n${end}`;
  const cur = read(file);
  const i = cur.indexOf(start);
  const j = cur.indexOf(end);
  let next;
  if (i !== -1 && j > i) next = cur.slice(0, i) + block + cur.slice(j + end.length);
  else next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + (cur ? '\n' : '') + block + '\n';
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, next);
}
function removeBlock(file, start, end) {
  const cur = read(file);
  const i = cur.indexOf(start);
  const j = cur.indexOf(end);
  if (i === -1 || j < i) return false;
  fs.writeFileSync(file, (cur.slice(0, i) + cur.slice(j + end.length)).replace(/\n{3,}/g, '\n\n'));
  return true;
}

function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-m') flags.message = argv[++i];
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (['remote', 'message', 'fronts', 'front', 'docs'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

// ---------------------------------------------------------------- project / store resolution

function repoInfo(cwd = process.cwd()) {
  const root = tryGit(cwd, 'rev-parse', '--show-toplevel');
  if (!root) return null;
  const common = real(path.resolve(root, git(root, 'rev-parse', '--git-common-dir')));
  return { root, common };
}
function requireRepo() {
  const info = repoInfo();
  if (!info) die('run this inside a git repository (the client project).');
  return info;
}
function clientFor(info) { return (readJson(PROJECTS, {})[info.common] || {}).client || null; }
const storeDir = (client) => path.join(STORES, client);

// ---------------------------------------------------------------- stack detection

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', 'out', 'coverage', 'openspec']);

function candidateDirs(root, depth = 2) {
  const out = [root];
  const walk = (dir, d) => {
    if (d === 0 || out.length > 300) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      out.push(p); walk(p, d - 1);
    }
  };
  walk(root, depth);
  return out;
}

const NODE_DEPS = [
  ['typescript', 'TypeScript'], ['react', 'React'], ['next', 'Next.js'], ['@angular/core', 'Angular'], ['vue', 'Vue'],
  ['svelte', 'Svelte'], ['express', 'Express'], ['@nestjs/core', 'NestJS'], ['fastify', 'Fastify'], ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'], ['typeorm', 'TypeORM'], ['jest', 'Jest'], ['vitest', 'Vitest'], ['@playwright/test', 'Playwright'],
  ['cypress', 'Cypress'], ['tailwindcss', 'Tailwind CSS'], ['react-native', 'React Native'], ['expo', 'Expo'],
];
const PY_DEPS = [
  ['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'], ['sqlalchemy', 'SQLAlchemy'], ['pydantic', 'Pydantic'],
  ['pytest', 'pytest'], ['langchain', 'LangChain'], ['langgraph', 'LangGraph'], ['pandas', 'pandas'], ['celery', 'Celery'],
];
const TEXT_RULES = [
  // [file, language label, [[regex, label], ...]]
  ['pom.xml', 'Java', [[/spring-boot/i, 'Spring Boot'], [/quarkus/i, 'Quarkus'], [/junit/i, 'JUnit']]],
  ['build.gradle', 'JVM (Gradle)', [[/spring-boot|springframework\.boot/i, 'Spring Boot'], [/kotlin/i, 'Kotlin'], [/com\.android/i, 'Android']]],
  ['build.gradle.kts', 'JVM (Gradle)', [[/spring-boot|springframework\.boot/i, 'Spring Boot'], [/kotlin/i, 'Kotlin'], [/com\.android/i, 'Android']]],
  ['go.mod', 'Go', [[/gin-gonic/, 'Gin'], [/labstack\/echo/, 'Echo'], [/gofiber/, 'Fiber']]],
  ['Cargo.toml', 'Rust', [[/actix-web/, 'Actix'], [/axum/, 'Axum'], [/tokio/, 'Tokio']]],
  ['composer.json', 'PHP', [[/laravel\/framework/, 'Laravel'], [/symfony\//, 'Symfony']]],
  ['Gemfile', 'Ruby', [[/['"]rails['"]/, 'Rails'], [/rspec/, 'RSpec']]],
  ['pubspec.yaml', 'Dart', [[/flutter/, 'Flutter']]],
];

function detectStack(root) {
  const found = new Map(); // label -> Set(relative dir)
  const add = (label, dir) => {
    const rel = path.relative(root, dir) || '.';
    if (!found.has(label)) found.set(label, new Set());
    found.get(label).add(rel);
  };
  for (const dir of candidateDirs(root)) {
    const f = (name) => path.join(dir, name);
    if (exists(f('package.json'))) {
      const pkg = readJson(f('package.json'), {});
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      add('Node.js', dir);
      for (const [dep, label] of NODE_DEPS) if (deps[dep]) add(label, dir);
    }
    const py = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'].map((n) => read(f(n))).join('\n').toLowerCase();
    if (py.trim()) {
      add('Python', dir);
      for (const [dep, label] of PY_DEPS) if (new RegExp(`(^|[^a-z0-9_-])${dep}([^a-z0-9_-]|$)`, 'm').test(py)) add(label, dir);
    }
    for (const [file, lang, rules] of TEXT_RULES) {
      const txt = read(f(file));
      if (!txt) continue;
      add(lang, dir);
      for (const [re, label] of rules) if (re.test(txt)) add(label, dir);
    }
    let names = [];
    try { names = fs.readdirSync(dir); } catch { /* unreadable */ }
    if (names.some((n) => /\.(csproj|sln|fsproj)$/.test(n))) add('.NET', dir);
    if (names.includes('Dockerfile')) add('Docker', dir);
    if (names.some((n) => /^(docker-)?compose\.ya?ml$/.test(n))) add('Docker Compose', dir);
    if (names.some((n) => /\.tf$/.test(n))) add('Terraform', dir);
  }
  return [...found.entries()].map(([tech, dirs]) => ({ tech, dirs: [...dirs].sort() })).sort((a, b) => a.tech.localeCompare(b.tech));
}

function stackYaml(stack, fr = { mode: 'brownfield', fronts: {} }) {
  const oneLine = (v) => String(v).replace(/\s+/g, ' ').trim();
  const greenfield = fr.mode === 'greenfield';
  const lines = stack.length
    ? stack.map((s) => `  - ${s.tech} (${s.dirs.join(', ')})`)
    : [greenfield ? '  - No code yet.' : '  - No known manifests found. Inspect the code before assuming a stack.'];
  const fronts = Object.entries(fr.fronts || {}).map(([name, f]) => {
    const decisions = Object.entries(f.decisions || {}).map(([k, v]) => `${k}: ${oneLine(v)}`).join('; ');
    return `  - ${name} (${f.path || '.'}/): standards in ${name}-standards.md${(f.core || []).length ? `; base skills ${f.core.join(', ')}` : ''}${decisions ? `; decided ${decisions}` : ''}`;
  });
  return [
    YMARK.start,
    'context: |',
    '  Technology stack detected by specboot from project manifests:',
    ...lines,
    ...(fronts.length ? ['  Fronts declared for this project:', ...fronts] : []),
    ...((fr.documents || []).length ? [
      `  Architecture documents provided by the team (they outrank the base skills): ${fr.documents.map((d) => docLabel(d.file)).join(', ')}`,
      '  Read openspec/standards/overrides.md before those documents: where it renames or replaces a term,',
      '  the override wins. Never reintroduce the original term of a document.',
    ] : []),
    ...(isPrivate(fr.docs) ? ['  docs/ holds planning and architecture documents and is private: never commit it to the code repository.'] : []),
    ...(((fr.planning || {}).skills || []).length ? [`  For a new product, an epic or a large feature, load the specboot-plan skill before proposing changes; its output goes to ${(fr.planning || {}).output || 'docs/planning'}/.`] : []),
    ...(fr.docs === 'client' ? ['  docs/ holds planning and architecture documents and is versioned in the code repository.'] : []),
    greenfield
      ? '  This is a new project. Its standards are prescribed in openspec/standards/ from the base skills above:'
      : '  This is an existing codebase. Its own standards are mapped in openspec/standards/:',
    '  read base-standards.md and the standards file for the area you touch before creating',
    '  any artifact or code. Project standards override any generic technology skill;',
    '  generic skills apply only where the project standards are silent.',
    '  The openspec/ folder and all agent configuration are private to the developer:',
    '  never stage or commit them to the code repository.',
    'rules:',
    '  design:',
    '    - Name the existing files and patterns the change will follow, citing openspec/standards/',
    '    - Flag explicitly any point where the design departs from the project standards and why',
    '  tasks:',
    '    - The first task creates a branch following the branch convention in base-standards.md',
    '    - Before creating a new file, read two or three sibling files in the same module and mirror their structure',
    '    - Include tasks that run the automated tests and record the results in the change folder',
    '    - The last implementation task runs `specboot check` and it must pass',
    '    - Never add tasks that commit openspec/ or agent configuration files to the code repository',
    'operations:',
    '  apply:',
    '    guidance:',
    '      - Run `specboot check` before marking a group of tasks complete; fix failures instead of skipping them',
    '      - Run tests and manual checks yourself; do not delegate them to the user',
    '      - Follow the commit convention in base-standards.md; no references to OpenSpec changes or AI tooling',
    '  archive:',
    '    guidance:',
    '      - Archive only after `specboot check` passes, an adversarial-review in a fresh session ends in PASS or PASS WITH GAPS, and judgment-day ends in APPROVED',
    '      - If the change altered folder layout, routes, naming or language rules, update openspec/standards/ (and overrides.md when it departs from an architecture document) before archiving',
    '      - After archiving, run `specboot sync` to version the specs in the private store',
    YMARK.end,
  ].join('\n');
}

// Write the managed block into the store's openspec/config.yaml.
function writeStackConfig(configPath, stack, fr) {
  const cur = read(configPath);
  const i = cur.indexOf(XMARK.start);
  const j = cur.lastIndexOf(XMARK.end);
  const outside = i !== -1 && j > i ? cur.slice(0, i) + cur.slice(j + XMARK.end.length) : cur;
  const clash = ['context', 'rules', 'operations'].filter((k) => new RegExp(`^${k}:`, 'm').test(outside));
  if (clash.length) {
    warn(`config.yaml already defines ${clash.join(', ')} outside the specboot block; left untouched.`);
    return false;
  }
  const next = outside.replace(/\s*$/, '\n') + '\n' + stackYaml(stack, fr) + '\n';
  fs.writeFileSync(configPath, next);
  return true;
}

// ---------------------------------------------------------------- install / uninstall

const sha = (file) => crypto.createHash('sha256').update(read(file)).digest('hex').slice(0, 12);
const VALID_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function skillName(dir) {
  const t = read(path.join(dir, 'SKILL.md')).replace(/^\uFEFF/, '');
  if (!t.startsWith('---')) return null;
  const end = t.indexOf('\n---', 3);
  const m = t.slice(3, end === -1 ? 3 : end).match(/^name:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1] : null;
}

// Directories that contain a SKILL.md, without descending into a skill once found.
function findSkillDirs(base, depth = 6) {
  const out = [];
  const walk = (dir, d) => {
    if (exists(path.join(dir, 'SKILL.md'))) { out.push(dir); return; }
    if (d === 0) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() && !['node_modules', '.git'].includes(e.name)) walk(path.join(dir, e.name), d - 1);
    }
  };
  walk(base, depth);
  return out;
}

const listSources = () => readJson(SOURCES, { sources: [] }).sources || [];

// Every skill specboot manages: its own, the generated openspec-* ones, and the user's skill sources
// (for example a plugins repository). The link is named after the skill's declared name, so a folder
// whose name differs from the skill name still works. First occurrence of a name wins.
function skillCatalog() {
  const skills = []; const issues = []; const seen = new Map();
  const add = (dir, origin) => {
    const declared = skillName(dir);
    const name = declared || path.basename(dir);
    if (!declared) issues.push(`${origin}/${path.basename(dir)}: no "name" in the frontmatter; some agents ignore such skills`);
    if (!VALID_NAME.test(name)) { issues.push(`${origin}: "${name}" is not a valid skill name (lowercase letters, digits, hyphens); skipped`); return; }
    const hash = sha(path.join(dir, 'SKILL.md'));
    const prev = seen.get(name);
    // The harness ships a few openspec-* skills only as fallbacks: the copy OpenSpec generates wins silently.
    if (prev && origin === 'specboot' && prev.origin === 'openspec') return;
    if (prev) {
      if (prev.hash !== hash) issues.push(`skill "${name}" exists twice with different content: kept ${prev.origin}, ignored ${origin}`);
      return;
    }
    const s = { name, dir, origin, hash };
    seen.set(name, s); skills.push(s);
  };
  if (exists(GENERATED)) for (const dir of findSkillDirs(GENERATED, 1)) add(dir, 'openspec');
  for (const dir of findSkillDirs(path.join(HARNESS, 'skills'), 1)) add(dir, 'specboot');
  if (exists(EFFICIENCY_SKILLS)) for (const dir of findSkillDirs(EFFICIENCY_SKILLS, 1)) add(dir, 'efficiency');
  for (const src of listSources()) {
    if (!exists(src)) { issues.push(`skill source not found: ${src}`); continue; }
    for (const dir of findSkillDirs(src)) add(dir, path.join(path.basename(src), path.relative(src, path.dirname(dir))));
  }
  return { skills, issues };
}
const skillSources = () => skillCatalog().skills;

function cmdSource(args) {
  const { pos } = parseArgs(args);
  const [action, target] = pos;
  const sources = listSources();
  if (action === 'add' && target) {
    const p = real(path.resolve(target));
    if (!p) die(`path not found: ${target}`);
    const n = findSkillDirs(p).length;
    if (!n) die(`no SKILL.md found under ${p}`);
    if (!sources.includes(p)) sources.push(p);
    writeJson(SOURCES, { sources });
    log(`source added: ${p} (${n} skills). Run: specboot install`);
  } else if (action === 'remove' && target) {
    const p = real(path.resolve(target)) || path.resolve(target);
    writeJson(SOURCES, { sources: sources.filter((s) => s !== p) });
    log(`source removed: ${p}. Run: specboot install`);
  } else if (action === 'list' || !action) {
    if (!sources.length) log('No skill sources. Add one with: specboot source add <path>');
    for (const s of sources) log(`${s}  (${exists(s) ? findSkillDirs(s).length + ' skills' : 'missing'})`);
  } else die('usage: specboot source add <path> | remove <path> | list');
}
const skillTargets = () => [path.join(HOME, '.claude', 'skills'), path.join(HOME, '.agents', 'skills')];
const isOurs = (p) => { const r = real(p); return !!r && (r.startsWith(real(HARNESS) + path.sep) || (exists(DATA) && r.startsWith(real(DATA) + path.sep))); };

function instructionFiles() {
  return [
    path.join(HOME, '.claude', 'CLAUDE.md'),
    path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'AGENTS.md'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'opencode', 'AGENTS.md'),
  ];
}
const GLOBAL_RULE = `## specboot
When the project root contains an \`openspec/\` folder (it may be a symlink), load the \`specboot-start\` skill before planning or changing code, and work through OpenSpec changes. Never stage or commit \`openspec/\`, \`.codegraph/\`, or agent configuration files to the code repository.

### Efficiency pack (installed with \`specboot install\`)
- Prefer **codegraph** when a project has been indexed (\`codegraph init\`): query the graph before broad file exploration on map/explore/apply.
- On OpenSpec **apply**, load **ponytail**: smallest diff that meets tasks and standards; never cut validation, security, or required tests.
- **rtk** / **Headroom** compress tool/CLI output on the machine when installed — use them transparently; do not duplicate both proxies for debugging.
- **caveman** may shorten ordinary chat; never shorten \`specboot-start\` gates, \`specboot doctor\`, quality-gate evidence (\`adversarial-review\`, \`judgment-day\`, \`specboot check\`), or PR/commit bodies.
- Skip the pack for one install with \`SPECBOOT_SKIP_EFFICIENCY=1\`.`;

// Cursor keeps User Rules in its own settings, not in a file, so the global rule cannot be written there.
// Instead each project gets an always-applied project rule. It lives under .cursor/, which the exclude and
// the pre-commit guard already keep out of the client repository.
const CURSOR_RULE_MARK = 'specboot:managed';
const cursorRuleFile = (info) => path.join(info.root, '.cursor', 'rules', 'specboot.mdc');
const cursorRuleText = () => `---
description: specboot harness rule (managed by specboot; rewritten by specboot link and map)
alwaysApply: true
---
<!-- ${CURSOR_RULE_MARK}: edit the harness, not this file -->
${GLOBAL_RULE}
`;
function cursorRuleState(info) {
  const cur = read(cursorRuleFile(info));
  if (!cur) return 'missing';
  if (!cur.includes(CURSOR_RULE_MARK)) return 'foreign';
  return cur === cursorRuleText() ? 'current' : 'outdated';
}
function ensureCursorRule(info, quiet = false) {
  const state = cursorRuleState(info);
  if (state === 'current') return;
  if (state === 'foreign') { if (!quiet) warn(`${cursorRuleFile(info)} exists and is not managed by specboot; Cursor rule not written`); return; }
  mkdirp(path.dirname(cursorRuleFile(info)));
  fs.writeFileSync(cursorRuleFile(info), cursorRuleText());
  if (!quiet) ok('Cursor rule written to .cursor/rules/specboot.mdc (local, never pushed)');
}

// What the harness adds around each OpenSpec skill. It is written into the generated skill itself, so every
// agent that loads the skill (Claude Code, Cursor, Codex, opencode) gets it without the user invoking anything.
// specboot-start §5b is the readable copy of this table: change both together.
const PROPOSE_BINDINGS = {
  before: [
    '`specboot-plan` first, when the request is a product, an epic or a feature with several stories',
    '`enrich-us` first, when the story is vague or lacks acceptance criteria',
    '`playwright-qa-scenarios` (case catalog), when the change has frontend behavior',
  ],
};
const ARCHIVE_BINDINGS = {
  before: [
    'The quality gate (`specboot-start` §5c) must have completed for each change, ending in `judgment-day` `APPROVED`. If it has not, run it now instead of archiving (start with `openspec-verify-change` when that skill exists, else with `specboot check`)',
    '`specboot-map`, when the change altered folder layout, routes, naming or language rules, or a library choice',
  ],
  after: ['Run `specboot sync` to version the specs in the private store'],
};
const BINDINGS = {
  'openspec-explore': { during: ['`enrich-us`, when the story is vague', '`explain`, when the user needs the concepts behind the question'] },
  'openspec-propose': PROPOSE_BINDINGS,
  'openspec-new-change': PROPOSE_BINDINGS,
  'openspec-ff-change': PROPOSE_BINDINGS,
  'openspec-apply-change': {
    before: ['`using-git-worktrees`, when the work needs isolation from the current checkout'],
    during: [
      '`ponytail` (always): the smallest diff that meets the tasks and the standards',
      'Query codegraph before broad file exploration, when the project has a `.codegraph/` index',
      '`playwright-qa-scenarios` (suite) and `playwright-skill`, when the tasks include frontend E2E tests',
    ],
    after: [
      'Run `specboot check`; a failing check is not done',
      '`work-unit-commits` (always)',
      '`chained-pr`, when the change exceeds about 400 changed lines',
      '`branch-pr`, when opening a pull request; `commit`, when the team packages work through Jira',
      '`update-docs`, when the change made documentation stale',
      '`show-spec-working`, when the user asks to see it working',
      'Do not offer to archive yet: the next step is the quality gate (`openspec-verify-change` when that skill exists, else `specboot-start` §5c)',
    ],
  },
  // Onboard walks every phase inline without invoking the other skills, so their bindings would never fire.
  'openspec-onboard': {
    during: [
      'At each phase, apply the specboot bindings of the matching skill: `openspec-propose` when writing the artifacts, `openspec-apply-change` when implementing',
      'Before the archive phase, run the quality gate (`specboot-start` §5c) and archive only on `judgment-day` `APPROVED`; then run `specboot sync`',
    ],
  },
  'openspec-verify-change': {
    after: [
      'Continue with the rest of the quality gate without waiting to be asked, in this order',
      'Run `specboot check`',
      '`adversarial-review`, by a reviewer that did not implement the change: a subagent when the runtime has them; otherwise stop and ask the user to run it in a new session',
      '`mutation-testing`, when the change includes or depends on tests',
      '`code-auditing`, when the change touches auth, payments, PII, security or irreversible data',
      '`judgment-day` (always): the terminal verdict is `APPROVED` or `ESCALATED`',
      'When a step fails, follow the routing table in `specboot-start` §5c',
    ],
  },
  'openspec-archive-change': ARCHIVE_BINDINGS,
  'openspec-bulk-archive-change': ARCHIVE_BINDINGS,
};
const BINDINGS_MARK = '<!-- specboot:bindings -->';

function bindingsBlock(name) {
  const b = BINDINGS[name] || {};
  const section = (title, items) => (items?.length ? [`**${title}**`, ...items.map((i) => `- ${i}`), ''] : []);
  return [
    BINDINGS_MARK,
    '## specboot bindings',
    '',
    'These steps are part of this skill when the project root contains `openspec/standards/` (a specboot project); ignore this section otherwise. Load each named skill yourself, by whatever means this agent loads skills. Do not wait for the user to invoke it.',
    '',
    '**Before starting**',
    '- `specboot-start`, unless it was already loaded in this session',
    ...(b.before || []).map((i) => `- ${i}`),
    '',
    ...section('While working', b.during),
    ...section('After finishing', b.after),
  ].join('\n');
}

// Puts the bindings right after the frontmatter, so the agent reads them before the OpenSpec instructions.
function injectBindings(skillDir) {
  const file = path.join(skillDir, 'SKILL.md');
  const txt = fs.readFileSync(file, 'utf8');
  if (txt.includes(BINDINGS_MARK)) return;
  const fm = txt.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const head = fm ? fm[0] : '';
  const name = path.basename(skillDir);
  // OpenSpec's own text ends by declaring the work ready for archive; repeat the hand-off where the agent stops reading.
  const b = BINDINGS[name] || {};
  const tail = b.after || b.during
    ? '\n\n## specboot: before you finish\n\nIn a specboot project (`openspec/standards/` exists) this skill is not finished until the steps under `## specboot bindings` above have run. "Ready for archive" in the text above means this OpenSpec step passed, not that the quality gate did.\n'
    : '';
  fs.writeFileSync(file, `${head}\n${bindingsBlock(name)}\n${txt.slice(head.length).trimEnd()}${tail || '\n'}`);
}

function generateOpenspecSkills() {
  if (tryRun(OPENSPEC, ['--version']) === null) {
    warn('openspec CLI not found; skipped generating openspec-* skills (npm install -g @fission-ai/openspec@latest, then re-run install).');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specboot-gen-'));
  // OpenSpec 2.x installs its skills under the user's home (~/.agents/skills, ~/.claude/skills) instead of the
  // project. Point HOME at a scratch folder so it writes there and never touches the real agent folders,
  // while the global config (profile, workflows) is still read from the real location.
  const fakeHome = path.join(tmp, 'home');
  const proj = path.join(tmp, 'project');
  mkdirp(fakeHome); mkdirp(proj);
  const env = { ...process.env, OPENSPEC_TELEMETRY: '0', HOME: fakeHome };
  if (IS_WIN) env.USERPROFILE = fakeHome;
  else env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
  try {
    run(OPENSPEC, ['init', '--tools', 'claude'], { cwd: proj, env });
    fs.rmSync(GENERATED, { recursive: true, force: true });
    mkdirp(GENERATED);
    let n = 0;
    // 2.x writes to the (scratch) home; 1.x writes to the project.
    for (const root of [fakeHome, proj]) for (const base of [path.join(root, '.agents', 'skills'), path.join(root, '.claude', 'skills')]) {
      if (!exists(base)) continue;
      for (const name of fs.readdirSync(base)) {
        const src = real(path.join(base, name));
        const dest = path.join(GENERATED, name);
        if (!src || !name.startsWith('openspec-') || exists(dest) || !exists(path.join(src, 'SKILL.md'))) continue;
        fs.cpSync(src, dest, { recursive: true });
        injectBindings(dest);
        n++;
      }
    }
    n ? ok(`generated ${n} openspec-* skills with OpenSpec ${tryRun(OPENSPEC, ['--version'])}`)
      : warn(`OpenSpec ${tryRun(OPENSPEC, ['--version'])} generated no openspec-* skills; check: openspec config get workflows`);
  } catch (e) {
    warn(`could not generate openspec-* skills: ${String(e.stderr || e.message).split('\n')[0]}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function runEfficiencyPack() {
  if (process.env.SPECBOOT_SKIP_EFFICIENCY === '1') {
    warn('efficiency pack skipped (SPECBOOT_SKIP_EFFICIENCY=1)');
    return;
  }
  log(`efficiency pack (always on install; platform=${process.platform})`);
  mkdirp(EFFICIENCY_SKILLS);
  const env = { ...process.env, SPECBOOT_DATA: DATA, HARNESS, HOME };
  try {
    if (IS_WIN) {
      if (!exists(EFFICIENCY_INSTALL_PS1)) {
        warn(`efficiency pack script missing: ${EFFICIENCY_INSTALL_PS1}`);
        return;
      }
      // Native Windows path — no Git Bash/WSL required.
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', EFFICIENCY_INSTALL_PS1,
      ], { encoding: 'utf8', stdio: 'inherit', env });
    } else {
      if (!exists(EFFICIENCY_INSTALL)) {
        warn(`efficiency pack script missing: ${EFFICIENCY_INSTALL}`);
        return;
      }
      if (tryRun('bash', ['-c', 'echo ok']) === null) {
        warn('bash not available; efficiency pack skipped');
        return;
      }
      execFileSync('bash', [EFFICIENCY_INSTALL], { encoding: 'utf8', stdio: 'inherit', env });
    }
    ok('efficiency pack finished');
  } catch (e) {
    warn(`efficiency pack reported failures (skills/OpenSpec install continues): ${e.message || e}`);
  }
}

// A skill folder that something other than specboot put in an agent's skills folder, under a name specboot manages.
// OpenSpec 2.x installs its own openspec-* skills there; specboot regenerates the same skills, so those are safe
// to take over. Anything else is only replaced with `specboot install --adopt`, after a backup.
function conflictOwner(dest) {
  const r = real(dest);
  const md = r ? read(path.join(r, 'SKILL.md')) : '';
  if (path.basename(dest).startsWith('openspec-') && /^\s*author:\s*["']?openspec["']?\s*$/m.test(md)) return 'openspec';
  return 'other';
}
function describeConflict(dest) {
  const st = lstat(dest);
  if (!st) return `${dest} is missing`;
  const what = st.isSymbolicLink() ? `a link to ${fs.readlinkSync(dest)}` : 'a folder';
  const who = conflictOwner(dest) === 'openspec' ? 'installed by OpenSpec' : 'not created by specboot';
  return `${dest} is ${what} ${who}`;
}
let backupDir = null;
function backupEntry(dest) {
  if (!backupDir) backupDir = path.join(DATA, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  const out = path.join(backupDir, (path.basename(path.dirname(path.dirname(dest))) + '-' + path.basename(path.dirname(dest))).replace(/^\./, ''), path.basename(dest));
  mkdirp(path.dirname(out));
  const st = lstat(dest);
  if (st.isSymbolicLink()) { fs.writeFileSync(out + '.link', fs.readlinkSync(dest) + '\n'); fs.rmSync(dest, { force: true }); }
  else { try { fs.renameSync(dest, out); } catch { fs.cpSync(dest, out, { recursive: true }); fs.rmSync(dest, { recursive: true, force: true }); } }
  return out;
}

function cmdInstall(args = []) {
  const { flags } = parseArgs(args);
  log('specboot install');
  mkdirp(DATA);
  generateOpenspecSkills();
  runEfficiencyPack();
  const { skills: sources, issues } = skillCatalog();
  const managed = new Set(readJson(LINKS, []));
  const now = new Set();
  const conflicts = [];
  let tookOver = 0;
  for (const base of skillTargets()) {
    let linked = 0;
    for (const s of sources) {
      const dest = path.join(base, s.name);
      const st = lstat(dest);
      if (st) {
        if (st.isSymbolicLink() && (managed.has(dest) || isOurs(dest) || !real(dest))) fs.rmSync(dest, { force: true });
        else if (conflictOwner(dest) === 'openspec') { backupEntry(dest); tookOver++; }
        else if (flags.adopt) { const why = describeConflict(dest); backupEntry(dest); warn(`${why}: backed up and replaced`); }
        else { conflicts.push(dest); continue; }
      }
      linkDir(s.dir, dest); now.add(dest); linked++;
    }
    ok(`${linked} skills linked in ${base}`);
  }
  let pruned = 0;
  for (const p of managed) if (!now.has(p) && lstat(p)?.isSymbolicLink()) { fs.rmSync(p, { force: true }); pruned++; }
  if (pruned) ok(`${pruned} stale skill links removed`);
  writeJson(LINKS, [...now]);
  if (tookOver) ok(`${tookOver} openspec-* entries that OpenSpec had installed in the agent folders now point to the generated copies`);
  if (backupDir) ok(`replaced entries backed up to ${backupDir}`);
  if (conflicts.length) {
    warn(`${conflicts.length} skills not linked: their names are taken by folders specboot did not create`);
    conflicts.forEach((d) => log(`        ${describeConflict(d)}`));
    log('        to back them up and use the harness version: specboot install --adopt');
    process.exitCode = 1;
  }
  issues.slice(0, 20).forEach(warn);
  if (issues.length > 20) warn(`... and ${issues.length - 20} more skill issues`);
  for (const f of instructionFiles()) { upsertBlock(f, MARK.start, MARK.end, GLOBAL_RULE); ok(`global rule written to ${f}`); }
  log('\nCursor: nothing to paste. specboot init, link and map write the rule to .cursor/rules/specboot.mdc in each');
  log('project (ignored by git). Run `specboot link` in projects set up before 0.7.3.');
  log('Optional, only to apply it outside specboot projects: paste this in Cursor Settings > Rules > User Rules:\n');
  log(GLOBAL_RULE.replace('## specboot\n', '') + '\n');
}

function cmdUninstall() {
  log('specboot uninstall');
  const managed = new Set(readJson(LINKS, []));
  for (const base of skillTargets()) {
    if (!exists(base)) continue;
    let n = 0;
    for (const name of fs.readdirSync(base)) {
      const p = path.join(base, name);
      if (lstat(p)?.isSymbolicLink() && (isOurs(p) || managed.has(p))) { fs.rmSync(p, { force: true }); n++; }
    }
    ok(`${n} skill links removed from ${base}`);
  }
  writeJson(LINKS, []);
  for (const f of instructionFiles()) if (removeBlock(f, MARK.start, MARK.end)) ok(`global rule removed from ${f}`);
  log(`Stores and project links were kept: ${DATA}`);
}

// ---------------------------------------------------------------- init / link / sync

// Files regenerated on every machine are not versioned in the store: they would conflict on every sync.
function ensureStoreIgnore(dir) {
  const gi = path.join(dir, '.gitignore');
  const want = ['openspec/standards/project-facts.md'];
  const cur = read(gi);
  const missing = want.filter((l) => !cur.split('\n').includes(l));
  if (missing.length) fs.writeFileSync(gi, cur.replace(/\s*$/, cur ? '\n' : '') + '# regenerated by specboot on each machine\n' + missing.join('\n') + '\n');
  for (const f of want) if (tryGit(dir, 'ls-files', '--', f)) tryGit(dir, 'rm', '-q', '--cached', '--', f);
}

function ensureStore(client, remote) {
  const dir = storeDir(client);
  if (!exists(dir)) {
    mkdirp(STORES);
    if (remote) { run('git', ['clone', remote, dir]); ok(`store cloned from ${remote}`); }
    else { mkdirp(dir); git(dir, 'init', '-q'); ok(`store created at ${dir}`); }
  } else {
    ok(`store found at ${dir}`);
    if (remote && !tryGit(dir, 'remote', 'get-url', 'origin')) { git(dir, 'remote', 'add', 'origin', remote); ok(`store remote set to ${remote}`); }
  }
  const root = path.join(dir, 'openspec');
  if (!exists(root)) {
    const done = tryRun(OPENSPEC, ['init', '--tools', 'none'], { cwd: dir, env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
    if (done === null || !exists(root)) {
      mkdirp(path.join(root, 'specs')); mkdirp(path.join(root, 'changes', 'archive'));
      fs.writeFileSync(path.join(root, 'config.yaml'), 'schema: spec-driven\n');
      fs.writeFileSync(path.join(root, 'specs', '.gitkeep'), '');
      fs.writeFileSync(path.join(root, 'changes', 'archive', '.gitkeep'), '');
      warn('openspec CLI not available; wrote a minimal openspec/ structure by hand.');
    } else ok('openspec/ initialized inside the store');
  }
  ensureStoreIgnore(dir);
  return dir;
}

function ensureLink(info, client) {
  const link = path.join(info.root, 'openspec');
  const target = path.join(storeDir(client), 'openspec');
  const st = lstat(link);
  if (st?.isSymbolicLink()) {
    if (real(link) === real(target)) { ok('openspec/ already linked to the store'); return; }
    die(`openspec is a link to something else (${fs.readlinkSync(link)}). Remove it and retry.`);
  }
  if (st) {
    const tracked = tryGit(info.root, 'ls-files', '--', 'openspec');
    die(tracked
      ? 'this repository already versions an openspec/ folder. specboot will not take it over; decide with the client before removing it.'
      : `a real openspec/ folder exists here. Move its contents into ${target} and delete it, then retry.`);
  }
  linkDir(target, link);
  ok(`openspec/ linked -> ${target}`);
}

// When docs/ is kept in the private store it is hidden and guarded exactly like openspec/.
// docs/ is private (hidden and guarded like openspec/) when it lives in the store or is local-only.
const isPrivate = (placement) => placement === 'store' || placement === 'local';
const excludesFor = (docsStore) => (docsStore ? [...EXCLUDES, '/docs'] : EXCLUDES);
const blockRe = (docsStore) => (docsStore ? BLOCK_RE.replace('^(', '^(docs(/|$)|') : BLOCK_RE);

function ensureExclude(info, docsStore = false, quiet = false) {
  const file = path.join(info.common, 'info', 'exclude');
  upsertBlock(file, XMARK.start, XMARK.end, excludesFor(docsStore).join('\n'));
  if (!quiet) ok('AI paths added to .git/info/exclude (local, never pushed)');
}

const hookText = (docsStore) => `#!/bin/sh
# specboot:pre-commit - keeps specs and agent configuration out of this repository.
[ "$SPECBOOT_ALLOW" = "1" ] && exit 0
blocked=$(git diff --cached --name-only --diff-filter=A | grep -E '${blockRe(docsStore)}')
if [ -n "$blocked" ]; then
  echo "specboot: commit blocked. These new files are private and must not enter this repository:" >&2
  echo "$blocked" | sed 's/^/  /' >&2
  echo "Unstage them with: git restore --staged <path>   (override once: SPECBOOT_ALLOW=1)" >&2
  exit 1
fi
exit 0
`;

function ensureHook(info, docsStore = false, quiet = false) {
  if (tryGit(info.root, 'config', '--get', 'core.hooksPath')) {
    if (!quiet) warn('core.hooksPath is set (hooks are managed elsewhere, maybe versioned). Hook NOT installed; the exclude file is your only guard.');
    return;
  }
  const file = path.join(info.common, 'hooks', 'pre-commit');
  const cur = read(file);
  if (cur && !cur.includes('specboot:pre-commit')) {
    fs.writeFileSync(file + '.specboot', hookText(docsStore), { mode: 0o755 });
    if (!quiet) warn(`a pre-commit hook already exists. Wrote ${file}.specboot; call it from your hook to enable the guard.`);
    return;
  }
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, hookText(docsStore), { mode: 0o755 });
  if (!quiet) ok('pre-commit guard installed in .git/hooks (local, never pushed)');
}

// Rewrite the exclude block and the pre-commit guard with the current lists. Projects set up by an older
// harness keep an outdated block (for example without /.codegraph/) until this runs; link and map call it.
function refreshGuards(info, client) {
  const priv = isPrivate(loadFronts(client).docs);
  ensureExclude(info, priv, true);
  ensureHook(info, priv, true);
  ensureCursorRule(info, true);
}

// What the guards of this clone are missing compared with the current lists.
function guardGaps(info, placement) {
  const priv = isPrivate(placement);
  const excl = read(path.join(info.common, 'info', 'exclude'));
  const s = excl.indexOf(XMARK.start); const e = excl.indexOf(XMARK.end, s + 1);
  const block = s >= 0 ? excl.slice(s, e >= 0 ? e : undefined).split('\n').map((l) => l.trim()) : null;
  const missingExcludes = block ? excludesFor(priv).filter((x) => !block.includes(x)) : null;
  let hook = 'unmanaged';
  if (!tryGit(info.root, 'config', '--get', 'core.hooksPath')) {
    const hf = path.join(info.common, 'hooks', 'pre-commit');
    const cur = read(hf).includes('specboot:pre-commit') ? read(hf) : read(hf + '.specboot');
    hook = !cur.includes('specboot:pre-commit') ? 'missing' : cur.includes(blockRe(priv)) ? 'current' : 'outdated';
  }
  return { missingExcludes, hook };
}

const identity = (dir) => ['-c', 'user.name=' + (tryGit(dir, 'config', 'user.name') || 'specboot'), '-c', 'user.email=' + (tryGit(dir, 'config', 'user.email') || 'specboot@localhost')];

function storeCommit(client, message) {
  const dir = storeDir(client);
  git(dir, 'add', '-A');
  if (!tryGit(dir, 'status', '--porcelain')) return false;
  run('git', [...identity(dir), 'commit', '-q', '-m', message], { cwd: dir });
  return true;
}

// Commit local work, bring in the team's work (rebase), restore local docs, optionally push.
function syncStore(info, client, message, push) {
  const dir = storeDir(client);
  ensureStoreIgnore(dir);
  const localDocs = loadFronts(client).docs === 'local';
  if (localDocs) { const r = mirrorDocs(info, client, 'up'); if (r.copied || r.removed) ok(`docs/: ${r.copied} files copied, ${r.removed} removed in the store`); }
  storeCommit(client, message) ? ok(`store committed (${client})`) : ok('nothing new to commit');
  const remote = tryGit(dir, 'remote', 'get-url', 'origin');
  if (remote) {
    const branch = tryGit(dir, 'rev-parse', '--abbrev-ref', 'HEAD') || 'main';
    tryRun('git', ['fetch', '-q', 'origin'], { cwd: dir, timeout: 60000 });
    if (tryGit(dir, 'rev-parse', '--verify', '-q', `origin/${branch}`)) {
      const before = tryGit(dir, 'rev-parse', 'HEAD');
      try { run('git', [...identity(dir), 'rebase', '-q', `origin/${branch}`], { cwd: dir }); }
      catch {
        tryGit(dir, 'rebase', '--abort');
        die(`your specs and the team's changed the same lines. Nothing was lost; resolve it by hand:\n  cd ${dir}\n  git pull --rebase origin ${branch}   # fix the conflicts, git add, git rebase --continue\n  specboot sync`);
      }
      const n = Number(tryGit(dir, 'rev-list', '--count', `${before}..HEAD`) || 0);
      if (tryGit(dir, 'rev-parse', 'HEAD') !== before) ok(`brought in the team's changes (${n} commits)`);
    }
  }
  if (localDocs) { const r = mirrorDocs(info, client, 'down'); if (r.copied || r.removed) ok(`docs/: ${r.copied} files updated, ${r.removed} removed from the team's changes`); }
  if (push) {
    if (remote) {
      try { git(dir, 'push', '-q', '-u', 'origin', 'HEAD'); ok('store pushed to origin'); }
      catch (e) { warn(`push failed: ${String(e.stderr || e.message).split('\n')[0]}`); process.exitCode = 1; }
    } else log(`no remote configured. To back it up and share it: git -C ${dir} remote add origin <private-url>`);
  }
}

function cmdInit(args) {
  const { pos, flags } = parseArgs(args);
  const client = pos[0];
  const usage = 'usage: specboot init <client-name> [--remote <git-url>] [--fronts <file.json>] [--new | --existing] [--docs local|client|store] [--gitignore]';
  if (!client || !/^[a-z0-9][a-z0-9._-]*$/i.test(client)) die(usage);
  if (flags.docs !== undefined && !['local', 'client', 'store'].includes(flags.docs)) die(usage);
  const info = requireRepo();
  log(`specboot init ${client}`);
  ensureStore(client, flags.remote);
  ensureLink(info, client);
  const projects = readJson(PROJECTS, {});
  projects[info.common] = { client, root: info.root };
  writeJson(PROJECTS, projects);
  const stack = detectStack(info.root);
  mkdirp(standardsDir(client));
  if (!exists(frontsFile(client)) || flags.fronts) {
    let src = {};
    if (flags.fronts) {
      src = readJson(path.resolve(String(flags.fronts)), null);
      if (!src || typeof src.fronts !== 'object') die(`cannot read a "fronts" object from ${flags.fronts}`);
    } else if (exists(DEFAULT_FRONTS)) src = readJson(DEFAULT_FRONTS, {});
    const sourceFiles = collectFacts(info.root).files.filter((f) => SOURCE_EXT.has(path.extname(f))).length;
    const previous = readJson(frontsFile(client), {}).mode;
    const mode = flags.new ? 'greenfield' : flags.existing ? 'brownfield' : previous || (!stack.length && sourceFiles < 5 ? 'greenfield' : 'brownfield');
    saveFronts(client, { mode, fronts: src.fronts || {} });
    ok(`project mode: ${mode}; fronts declared: ${Object.keys(src.fronts || {}).join(', ') || 'none'}`);
  }
  if (flags.docs) saveFronts(client, { docs: { placement: flags.docs } });
  else if (!loadFronts(client).docs) {
    const def = tryGit(info.root, 'ls-files', '--', 'docs') ? 'client' : 'local';
    saveFronts(client, { docs: { placement: def } });
    ok(`docs/ placement: ${def}${def === 'client' ? ' (the client repository already versions docs/)' : ' (in the project, ignored by git; change with: specboot docs client | store)'}`);
  }
  const pl = ensurePlanning(client);
  if (pl.added.length) ok(`planning skills: ${pl.skills.join(', ')}`);
  else if (!pl.skills.length && !pl.disabled) warn('planning skills not installed yet (the plan plugin provides them); they are added automatically once installed');
  const placement = loadFronts(client).docs;
  ensureExclude(info, isPrivate(placement));
  ensureHook(info, isPrivate(placement));
  ensureCursorRule(info);
  if (placement) applyDocsPlacement(info, client, placement);
  const fr = loadFronts(client);
  if (writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), stack, fr)) {
    ok(`stack written to openspec/config.yaml: ${stack.map((s) => s.tech).join(', ') || 'none detected'}`);
  }
  const m = mapProject(info, client);
  ok(`project facts mapped (${m.ruleFiles} rule sources, ${m.checks.length} executable checks)`);
  if (m.created.length) ok(`standards scaffolded in openspec/standards/: ${m.created.join(', ')}`);
  reportFronts(m.fr, info);
  if (flags.gitignore) {
    const gi = path.join(info.root, '.gitignore');
    const lines = ['/openspec', ...(isPrivate(placement) ? ['/docs'] : [])].filter((l) => !read(gi).split('\n').map((x) => x.trim()).includes(l));
    if (lines.length) { fs.writeFileSync(gi, read(gi).replace(/\s*$/, read(gi) ? '\n' : '') + lines.join('\n') + '\n'); ok(`.gitignore updated (${lines.join(', ')}); commit it so every clone ignores them`); }
    else ok('.gitignore already ignores the private folders');
  }
  if (storeCommit(client, `specboot: init store for ${client}`)) ok('store committed');

  if (!flags.gitignore && !read(path.join(info.root, '.gitignore')).split('\n').some((l) => /^\/?openspec\/?$/.test(l.trim()))) {
    log('\nThe ignore rules are local to this clone (.git/info/exclude). A teammate who clones the repository is not protected.');
    log('To protect every clone, rerun with --gitignore (adds /openspec to the committed .gitignore; the folder name becomes visible in the repository).');
  }
  if (!tryGit(storeDir(client), 'remote', 'get-url', 'origin')) {
    log(`\nThe spec store has NO remote: specs, standards, decisions${placement === 'local' ? ' and the backup of docs/' : ''} exist only on this machine.`);
    log(`Back it up now:\n  git -C ${storeDir(client)} remote add origin <private-git-url>\n  specboot sync`);
  }
  if (fr.mode === 'greenfield') {
    if (!Object.keys(fr.fronts).length) log('\nNew project without fronts. Declare them in openspec/standards/fronts.json (see presets/ in the harness), then run: specboot map');
    log('\nNext: ask your agent to run the `specboot-prescribe` skill. It writes the standards from your architecture documents and the base skills of each front.');
    log('Review them, then let the first OpenSpec change create the project skeleton with its lint, test and CI setup.');
  } else {
    log('\nNext: open the project with your agent and ask it to run the `specboot-map` skill.');
    log('It reads the code and fills openspec/standards/. Review what it marks as [assumed] before the first change.');
  }
}

// Where might skills that are declared but not installed live? Bounded search of the usual places.
function suggestSkillRoots(names, info) {
  const want = new Set(names); const hits = new Map(); let visited = 0;
  const registered = new Set(listSources());
  const roots = [path.join(HOME, '.claude', 'plugins'), path.join(HOME, '.claude', 'skills'), path.join(HOME, '.agents', 'skills'), ...(info ? [info.root, path.dirname(info.root)] : [])].filter(exists);
  const walk = (dir, d) => {
    if (d < 0 || visited > 6000) return;
    visited++;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || ['node_modules', '.git', 'dist', 'build', 'target', '.venv', 'venv', '.specboot-data'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (exists(path.join(p, 'SKILL.md'))) {
        const n = skillName(p) || e.name;
        if (want.has(n)) {
          const seg = p.split(path.sep);
          const i = seg.lastIndexOf('plugins') > 0 ? seg.lastIndexOf('plugins') : seg.lastIndexOf('skills');
          const root = i > 0 ? seg.slice(0, i + 1).join(path.sep) : path.dirname(p);
          if (!registered.has(root)) { if (!hits.has(root)) hits.set(root, new Set()); hits.get(root).add(n); }
        }
        continue;
      }
      walk(p, d - 1);
    }
  };
  roots.forEach((r) => walk(r, 6));
  return [...hits.entries()].map(([root, set]) => ({ root, count: set.size })).sort((a, b) => b.count - a.count).slice(0, 5);
}

function reportPlanning(fr, info, strict) {
  if ((fr.raw.planning || {}).disabled) { ok('planning disabled in fronts.json'); return 0; }
  const found = fr.planning.filter((x) => x.found).map((x) => x.name);
  if (found.length && !fr.planningMissing.length) { ok(`planning skills: ${found.join(', ')} (load the specboot-plan skill)`); return 0; }
  const missing = fr.planning.length ? fr.planningMissing : DEFAULT_PLANNING;
  (strict || warn)(`planning skills not installed: ${missing.join(', ')}`);
  const roots = suggestSkillRoots(missing, info);
  if (roots.length) roots.forEach((f) => log(`        found ${f.count} of them under ${f.root}\n        fix: specboot source add ${f.root} && specboot install && specboot map`));
  else log('        They come from the plan plugin. Register the folder that contains it:\n        fix: specboot source add <folder> && specboot install && specboot map');
  return 1;
}

function reportFronts(fr, info) {
  fr.invalid.forEach((n) => warn(`front "${n}" is not a valid name (lowercase letters, digits, hyphens); ignored`));
  if (fr.unresolved.length) {
    const names = [...new Set(fr.unresolved.map((s) => s.split(': ')[1]))];
    warn(`${names.length} skills declared in fronts.json are not installed: ${names.slice(0, 6).join(', ')}${names.length > 6 ? `, and ${names.length - 6} more` : ''}`);
    if (!listSources().length) log('        No skill source is registered. Your own skills must be registered before a front can use them.');
    const found = suggestSkillRoots(names, info);
    if (found.length) found.forEach((f) => log(`        found ${f.count} of them under ${f.root}\n        fix: specboot source add ${f.root} && specboot install`));
    else log('        They were not found in the usual places. Locate the folder that holds them, then:\n        fix: specboot source add <folder> && specboot install');
  }
  fr.drift.forEach((s) => warn(`base skill changed since the standards were written: ${s}`));
  (fr.docMissing || []).forEach((d) => warn(`architecture document missing: ${docLabel(d)}`));
  (fr.docDrift || []).forEach((d) => warn(`architecture document changed since the standards were written: ${docLabel(d)}`));
  const empty = fr.fronts.filter((f) => !f.core.length).map((f) => f.name);
  if (empty.length) warn(`fronts without base skills (no architecture definition): ${empty.join(', ')}`);
}

function cmdLink() {
  const info = requireRepo();
  const client = clientFor(info);
  if (!client) die('this repository is not registered. Run: specboot init <client-name>');
  ensureLink(info, client);
  const placement = loadFronts(client).docs;
  if (isPrivate(placement)) applyDocsPlacement(info, client, placement, true);
  refreshGuards(info, client);
  ok('exclude, pre-commit guard and Cursor rule refreshed');
}

// ---- docs/ kept local: a real folder in the client project, ignored by git, backed up to the store.
// The store holds a mirror under docs/. A per-machine manifest records the files present at the last
// sync, so a file missing on one side is known to be a deletion rather than a file that never arrived.
const manifestFile = (client) => path.join(DATA, 'docs-manifest', `${client}.json`);
const mainRoot = (info) => (readJson(PROJECTS, {})[info.common] || {}).root || info.root;
const localDocsDir = (info) => path.join(mainRoot(info), 'docs');

function listRel(dir) {
  const out = [];
  const walk = (d, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.DS_Store' || e.name === '.git') continue;
      const p = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r); else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}
const sameFile = (a, b) => exists(a) && exists(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

function mirrorDocs(info, client, direction) {
  const local = localDocsDir(info); const store = storeDocs(client);
  const [src, dst] = direction === 'up' ? [local, store] : [store, local];
  mkdirp(dst);
  const known = new Set(readJson(manifestFile(client), []));
  const srcFiles = new Set(listRel(src));
  let copied = 0; let removed = 0;
  for (const f of srcFiles) {
    const a = path.join(src, f); const b = path.join(dst, f);
    if (!sameFile(a, b)) { mkdirp(path.dirname(b)); fs.copyFileSync(a, b); copied++; }
  }
  for (const f of listRel(dst)) {
    if (!srcFiles.has(f) && known.has(f)) { fs.rmSync(path.join(dst, f), { force: true }); removed++; }
  }
  if (direction === 'down') {
    for (const d of ['planning', 'architecture', 'adr']) mkdirp(path.join(local, d));
    writeJson(manifestFile(client), listRel(store));
  }
  return { copied, removed };
}

function docsPending(info, client) {
  const local = localDocsDir(info); const store = storeDocs(client);
  const known = new Set(readJson(manifestFile(client), []));
  const l = listRel(local);
  return l.filter((f) => !sameFile(path.join(local, f), path.join(store, f))).length
    + listRel(store).filter((f) => known.has(f) && !l.includes(f)).length;
}

// docs/ is the project's folder for planning and architecture documents. The developer chooses once
// whether it belongs to the client repository or to the private store.
function applyDocsPlacement(info, client, placement, quiet = false) {
  const link = path.join(info.root, 'docs');
  const target = storeDocs(client);
  const st = lstat(link);
  const tracked = !!tryGit(info.root, 'ls-files', '--', 'docs');
  if (isPrivate(placement) && tracked) die(`the client repository already versions a docs/ folder, so it cannot be made ${placement === 'local' ? 'ignored' : 'private'}. Use: specboot docs client`);
  if (placement === 'store') {
    if (st && !st.isSymbolicLink()) { mirrorDocs(info, client, 'up'); fs.rmSync(link, { recursive: true, force: true }); }
    for (const d of ['planning', 'architecture', 'adr']) mkdirp(path.join(target, d));
    const now = lstat(link);
    if (now?.isSymbolicLink()) { if (real(link) !== real(target)) { fs.rmSync(link, { force: true }); linkDir(target, link); } }
    else linkDir(target, link);
    if (!quiet) ok(`docs/ linked -> ${target} (private; versioned by specboot sync)`);
  } else if (placement === 'local') {
    const main = mainRoot(info);
    if (real(main) !== real(info.root)) {
      // Secondary git worktree: share the main working tree's docs/ instead of a second copy.
      const want = path.join(main, 'docs');
      if (st && !st.isSymbolicLink()) die(`a real docs/ folder exists in this worktree. Move its contents into ${want} and delete it, then retry.`);
      if (!st || real(link) !== real(want)) { if (st) fs.rmSync(link, { force: true }); linkDir(want, link); }
      if (!quiet) ok(`docs/ linked -> ${want} (the main working tree's local docs)`);
    } else {
      if (st?.isSymbolicLink()) {
        if (real(link) !== real(target)) die(`docs is a link to something else (${fs.readlinkSync(link)}). Remove it and retry.`);
        fs.rmSync(link, { force: true });
      }
      mkdirp(link);
      const r = mirrorDocs(info, client, 'down');
      if (!quiet) ok(`docs/ is a real folder in the project, ignored by git${r.copied ? ` (${r.copied} files restored from the store)` : ''}; specboot sync backs it up`);
    }
  } else {
    if (st?.isSymbolicLink() && real(link) === real(target)) {
      fs.rmSync(link, { force: true });
      fs.cpSync(target, link, { recursive: true });
      if (!quiet) warn(`docs/ was in the store; its contents were copied into the repository. The store copy remains at ${target}; delete it once you have committed.`);
    }
    for (const d of ['planning', 'architecture', 'adr']) mkdirp(path.join(link, d));
    if (!quiet) ok('docs/ is a normal folder of the client repository (commit it with the code)');
  }
  ensureExclude(info, isPrivate(placement), true);
  ensureHook(info, isPrivate(placement), true);
}

function cmdDocs(args) {
  const { pos } = parseArgs(args);
  const { info, client } = requireProject();
  const cur = loadFronts(client).docs;
  if (!pos[0]) {
    log(cur ? `docs/ placement: ${cur}` : 'docs/ placement not decided.');
    log('  specboot docs local    real folder in the project, ignored by git, backed up to the store (default)');
    log('  specboot docs client   versioned in the client repository, visible to the client team');
    log('  specboot docs store    a link to the private spec store, hidden from the client repository');
    return;
  }
  if (!['local', 'client', 'store'].includes(pos[0])) die('usage: specboot docs [local | client | store]');
  log(`specboot docs ${pos[0]}`);
  applyDocsPlacement(info, client, pos[0]);
  saveFronts(client, { docs: { placement: pos[0] } });
  const r = mapProject(info, client);
  writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), r.stack, r.fr.raw);
  log('Layout: docs/planning/ (PRD, backlog), docs/architecture/ (architecture documents), docs/adr/ (decisions).');
}

function cmdMode(args) {
  const { pos } = parseArgs(args);
  const { info, client } = requireProject();
  if (!pos[0]) { log(`project mode: ${loadFronts(client).mode}`); return; }
  if (!['greenfield', 'brownfield'].includes(pos[0])) die('usage: specboot mode [greenfield | brownfield]');
  saveFronts(client, { mode: pos[0] });
  const r = mapProject(info, client);
  writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), r.stack, r.fr.raw);
  log(`project mode: ${pos[0]}`);
  if (pos[0] === 'brownfield') log('From now on the code is the authority. Standards are verified with the `specboot-map` skill.');
}

function cmdDetect(args) {
  const { flags } = parseArgs(args);
  const info = repoInfo();
  const root = info ? info.root : process.cwd();
  const stack = detectStack(root);
  if (flags.json) { log(JSON.stringify(stack, null, 2)); return; }
  if (!stack.length) log('No known manifests found.');
  for (const s of stack) log(`${s.tech.padEnd(16)} ${s.dirs.join(', ')}`);
  if (flags.write) {
    const client = info && clientFor(info);
    if (!client) die('not a registered project. Run: specboot init <client-name>');
    if (writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), stack, loadFronts(client))) ok('openspec/config.yaml updated');
  }
}

function cmdSync(args) {
  const { flags } = parseArgs(args);
  const { info, client } = requireProject();
  log('specboot sync');
  syncStore(info, client, flags.message || `specs: update ${new Date().toISOString().slice(0, 10)}`, true);
}

function cmdPull(args) {
  const { flags } = parseArgs(args);
  const { info, client } = requireProject();
  log('specboot pull');
  if (!tryGit(storeDir(client), 'remote', 'get-url', 'origin')) die('the store has no remote, so there is nothing to pull.');
  syncStore(info, client, flags.message || 'specs: local work before pull', false);
  log('Local work was committed to the store but not pushed. Push it with: specboot sync');
}

// ---------------------------------------------------------------- brownfield mapping (map / check)

const FRONT = new Set(['React', 'Next.js', 'Angular', 'Vue', 'Svelte', 'React Native', 'Expo', 'Tailwind CSS', 'Flutter']);
const BACK = new Set(['FastAPI', 'Django', 'Flask', 'Express', 'NestJS', 'Fastify', 'Spring Boot', 'Quarkus', 'Gin', 'Echo', 'Fiber', 'Actix', 'Axum', 'Laravel', 'Symfony', 'Rails', '.NET']);
function areasFor(stack) {
  const a = [];
  if (stack.some((s) => BACK.has(s.tech))) a.push('backend');
  if (stack.some((s) => FRONT.has(s.tech))) a.push('frontend');
  return a.length ? a : ['code'];
}

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.java', '.kt', '.go', '.rs', '.php', '.rb', '.cs', '.dart', '.vue', '.svelte', '.swift', '.scala']);
// Files that already encode project rules. Matched against tracked files only.
const RULE_FILES = [
  [/^(AGENTS|CLAUDE|GEMINI)\.md$|^\.cursorrules$/, 'existing agent rules'],
  [/^\.editorconfig$/, 'format'],
  [/^(\.eslintrc(\..+)?|eslint\.config\..+)$/, 'lint'],
  [/^(\.prettierrc(\..+)?|prettier\.config\..+)$/, 'format'],
  [/^biome\.jsonc?$/, 'lint + format'],
  [/^tsconfig(\..+)?\.json$/, 'types'],
  [/^(\.?ruff\.toml|\.flake8|\.pylintrc)$/, 'lint'],
  [/^(mypy\.ini|pyrightconfig\.json)$/, 'types'],
  [/^(pyproject\.toml|setup\.cfg|tox\.ini|pytest\.ini)$/, 'python config'],
  [/^(\.pre-commit-config\.ya?ml|lefthook\.ya?ml)$/, 'git hooks'],
  [/^(\.commitlintrc(\..+)?|commitlint\.config\..+)$/, 'commit convention'],
  [/^\.golangci\.ya?ml$/, 'lint'],
  [/^(rustfmt\.toml|clippy\.toml)$/, 'lint + format'],
  [/^checkstyle.*\.xml$|^\.rubocop\.yml$|^phpcs\.xml(\.dist)?$|^phpstan\.neon(\.dist)?$/, 'lint'],
  [/^(jest|vitest|playwright|cypress)\.config\..+$/, 'tests'],
  [/^(Makefile|justfile|Taskfile\.ya?ml)$/, 'commands'],
  [/^(\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|bitbucket-pipelines\.yml)$/, 'CI'],
  [/^(CONTRIBUTING|ARCHITECTURE|DEVELOPMENT)(\.md)?$/i, 'docs'],
  [/^CODEOWNERS$/, 'ownership'],
  [/^(openapi|swagger)\.(ya?ml|json)$/, 'API contract'],
  [/^sonar-project\.properties$/, 'quality gate'],
];
const RULE_PATHS = [
  [/^\.github\/workflows\/.+\.ya?ml$/, 'CI'],
  [/^\.github\/pull_request_template\.md$/i, 'PR template'],
  [/^\.github\/copilot-instructions\.md$/, 'existing agent rules'],
  [/^\.cursor\/rules\//, 'existing agent rules'],
  [/^\.husky\/[^/._][^/]*$/, 'git hooks'],
  [/(^|\/)adrs?\/.+\.md$/i, 'architecture decision'],
  [/^README(\.md)?$/i, 'docs'],
];

function collectFacts(root) {
  const files = (tryRun('git', ['-c', 'core.quotepath=off', 'ls-files'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }) || '').split('\n').filter(Boolean);
  const dirs = new Map();
  const groups = new Map();
  const ruleFiles = [];
  for (const f of files) {
    const parts = f.split('/');
    const ext = path.extname(f) || '(none)';
    for (let d = 1; d <= Math.min(3, parts.length - 1); d++) {
      const key = parts.slice(0, d).join('/');
      const e = dirs.get(key) || { count: 0, ext: {} };
      e.count++; e.ext[ext] = (e.ext[ext] || 0) + 1; dirs.set(key, e);
    }
    if (SOURCE_EXT.has(ext)) {
      const k = path.dirname(f);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    const hit = RULE_PATHS.find(([re]) => re.test(f)) || RULE_FILES.find(([re]) => re.test(parts[parts.length - 1]));
    if (hit && ruleFiles.length < 120) ruleFiles.push({ file: f, kind: hit[1] });
  }
  const mtime = (f) => { try { return fs.statSync(path.join(root, f)).mtimeMs; } catch { return 0; } };
  const samples = [...groups.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 25)
    .map(([dir, v]) => ({ dir, count: v.length, files: v.map((f) => [f, mtime(f)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]) }));
  const scripts = [];
  const makeTargets = [];
  const pyTools = [];
  for (const f of files) {
    const base = path.basename(f); const dir = path.dirname(f);
    if (base === 'package.json') for (const [name, cmd] of Object.entries(readJson(path.join(root, f), {}).scripts || {})) scripts.push({ dir, name, cmd: String(cmd) });
    if (base === 'Makefile') for (const m of read(path.join(root, f)).matchAll(/^([A-Za-z0-9_-]+):(?!=)/gm)) makeTargets.push({ dir, name: m[1] });
    if (base === 'pyproject.toml') for (const m of read(path.join(root, f)).matchAll(/^\[tool\.([A-Za-z0-9_-]+)/gm)) if (!pyTools.some((t) => t.dir === dir && t.name === m[1])) pyTools.push({ dir, name: m[1] });
  }
  const commits = (tryGit(root, 'log', '-15', '--format=%s') || '').split('\n').filter(Boolean);
  const branches = (tryGit(root, 'branch', '-a', '--format=%(refname:short)') || '').split('\n').filter(Boolean).slice(0, 20);
  return { files, dirs, ruleFiles, samples, scripts, makeTargets, pyTools, commits, branches };
}

// Executable checks the project already defines. These are the only rules that can be guaranteed.
function proposeChecks(root, facts) {
  const has = (p) => facts.files.includes(p);
  const inDir = (dir, name) => has(dir === '.' ? name : `${dir}/${name}`);
  const checks = [];
  const add = (name, cwd, cmd) => checks.push({ name, cwd, cmd });
  for (const dir of new Set(facts.scripts.map((s) => s.dir))) {
    const pm = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'].map((l, i) => ((inDir(dir, l) || has(l)) ? ['pnpm', 'yarn', 'bun', 'bun'][i] : null)).find(Boolean) || 'npm';
    for (const s of facts.scripts.filter((x) => x.dir === dir)) {
      if (/no test specified/.test(s.cmd)) continue;
      if (/^(lint|typecheck|type-check|check-types|tsc|test|format:check|prettier:check)$/.test(s.name)) add(`${dir}: ${s.name}`, dir, `${pm} run ${s.name}`);
    }
  }
  const pyDirs = new Set(facts.files.filter((f) => /(^|\/)(pyproject\.toml|requirements\.txt|setup\.py)$/.test(f)).map((f) => path.dirname(f)));
  for (const dir of pyDirs) {
    const tools = new Set(facts.pyTools.filter((t) => t.dir === dir).map((t) => t.name));
    const txt = ['pyproject.toml', 'requirements.txt', 'requirements-dev.txt'].map((n) => read(path.join(root, dir, n))).join('\n').toLowerCase();
    // Run through the project's own environment manager when it has one.
    const run = (inDir(dir, 'uv.lock') || has('uv.lock') || tools.has('uv')) ? 'uv run '
      : (inDir(dir, 'poetry.lock') || has('poetry.lock') || tools.has('poetry')) ? 'poetry run '
        : (inDir(dir, 'pdm.lock') || tools.has('pdm')) ? 'pdm run ' : '';
    if (tools.has('ruff') || inDir(dir, 'ruff.toml') || inDir(dir, '.ruff.toml')) add(`${dir}: ruff`, dir, `${run}ruff check .`);
    if (tools.has('black')) add(`${dir}: black`, dir, `${run}black --check .`);
    if (tools.has('mypy') || inDir(dir, 'mypy.ini')) add(`${dir}: mypy`, dir, `${run}mypy .`);
    if (tools.has('pytest') || inDir(dir, 'pytest.ini') || /pytest/.test(txt)) add(`${dir}: pytest`, dir, `${run}pytest -q`);
  }
  for (const f of facts.files) {
    const base = path.basename(f); const dir = path.dirname(f);
    if (base === 'go.mod') { add(`${dir}: go vet`, dir, 'go vet ./...'); add(`${dir}: go test`, dir, 'go test ./...'); }
    if (base === 'Cargo.toml' && !f.includes('/crates/')) { add(`${dir}: clippy`, dir, 'cargo clippy'); add(`${dir}: cargo test`, dir, 'cargo test'); }
    if (base === 'pom.xml' && dir.split('/').length <= 2) add(`${dir}: maven test`, dir, 'mvn -q test');
    if (/^build\.gradle(\.kts)?$/.test(base) && dir.split('/').length <= 1) add(`${dir}: gradle test`, dir, inDir(dir, 'gradlew') ? './gradlew test' : 'gradle test');
  }
  for (const t of facts.makeTargets) if (/^(lint|test|check|typecheck)$/.test(t.name) && !checks.some((c) => c.cwd === t.dir)) add(`${t.dir}: make ${t.name}`, t.dir, `make ${t.name}`);
  return checks;
}

function factsMarkdown(root, stack, facts, checks, fr = { mode: 'brownfield', fronts: [], unresolved: [], drift: [], documents: [], docDrift: [], planning: [] }, extra = { handoff: [], overrides: 0 }) {
  const L = [];
  const sec = (t) => L.push('', `## ${t}`, '');
  L.push('# Project facts', '', '<!-- Generated by `specboot map` from tracked files. Do not edit: it is rewritten on every run. -->', '',
    'Deterministic inventory of the client repository. It lists where the rules are; it does not interpret them.',
    'The `specboot-map` skill reads this file and the code to write the standards documents next to it.');
  sec('Stack');
  stack.length ? stack.forEach((s) => L.push(`- ${s.tech} (${s.dirs.join(', ')})`)) : L.push('- No known manifests found.');
  sec('Project mode');
  L.push(fr.mode === 'greenfield'
    ? '- **greenfield**: new project. Standards are prescribed from the base skills of each front (skill `specboot-prescribe`).'
    : '- **brownfield**: existing code. Standards are mapped from the code (skill `specboot-map`); front skills only fill what the code does not define.');
  if (extra.handoff.length) L.push(`- **Handoff due**: real code is now tracked under ${extra.handoff.join(', ')}. Before the next change, run the \`specboot-map\` skill as a verification pass (retag what the code confirms as [observed], fill what is no longer "Not defined yet", report drift), then run \`specboot mode brownfield\`.`);
  sec('Project documents folder (docs/)');
  L.push(fr.docs === 'local'
    ? '- `docs/` is a real folder of the project, IGNORED by git: never stage or commit it to the code repository. `specboot sync` backs it up to the private store and brings in the team\'s changes.'
    : fr.docs === 'store'
    ? '- `docs/` is a link to the private store. It is PRIVATE: never stage or commit it to the code repository. `specboot sync` versions it.'
    : fr.docs === 'client'
      ? '- `docs/` is a normal folder of the client repository. It is versioned with the code and visible to the client team.'
      : '- Placement not decided. Default is `specboot docs local` (in the project, ignored by git). Alternatives: `specboot docs client` (versioned with the code) or `specboot docs store` (a link to the private store).');
  if (fr.docs) L.push('- Layout: `docs/planning/` (PRD, backlog, user stories), `docs/architecture/` (architecture documents), `docs/adr/` (decision records). Write planning and architecture artifacts there, not elsewhere.');
  sec('Planning (product definition before OpenSpec)');
  if ((fr.raw && (fr.raw.planning || {}).disabled)) L.push('- Planning disabled in fronts.json.');
  else if (!fr.planning || !fr.planning.length) L.push('- No planning skills installed. They come from the plan plugin: `specboot source add <folder>`, `specboot install`, `specboot map`. Until then, do not run the `specboot-plan` skill; plan with the user in conversation and write to `docs/planning/`.');
  else {
    L.push(`- For a new product, an epic or a feature large enough to need a PRD, load the \`specboot-plan\` skill. It writes to \`${fr.planningOutput}/\` and hands each ticket to OpenSpec.`);
    fr.planning.forEach((sk) => L.push(sk.found ? `  - \`${sk.name}\`: \`${sk.file}\`` : `  - \`${sk.name}\`: NOT FOUND among installed skills`));
  }
  sec('Overrides to the architecture documents (read FIRST)');
  L.push(extra.overrides
    ? `- \`openspec/standards/overrides.md\` has ${extra.overrides} entries. Each one renames or replaces a term of an architecture document. Read it before the documents and use the override everywhere: never reintroduce a document's original term into standards, specs or code.`
    : '- None recorded. When a later decision renames or replaces something an architecture document says, add a row to `openspec/standards/overrides.md` instead of leaving the document and the decision in conflict.');
  sec('Architecture documents (authority above the base skills)');
  if (!fr.documents.length) L.push('- None provided.');
  else L.push('These were written by the team for this project. Read them fully before any base skill. Where a document and a skill disagree, the document wins; skills only fill what the documents leave open.', '');
  for (const d of fr.documents) L.push(`- \`${docLabel(d.file)}\` applies to ${d.front ? `front \`${d.front}\`` : 'the whole project'}${d.found ? `, version ${d.hash}` : ' (FILE MISSING)'}`);
  if (fr.docDrift.length) L.push(`- **Documents changed since the standards were written**: ${fr.docDrift.join(', ')}. Update the standards, then run \`specboot map --accept\`.`);
  sec('Declared fronts (openspec/standards/fronts.json)');
  if (!fr.fronts.length) L.push('- None declared.');
  for (const f of fr.fronts) {
    L.push(`### ${f.name}`, '', `- Path: \`${f.path}/\``, `- Standards document: \`${f.name}-standards.md\``);
    const decisions = Object.entries(f.decisions);
    const docs = fr.documents.filter((d) => !d.front || d.front === f.name);
    if (docs.length) L.push(`- Architecture documents that govern this front: ${docs.map((d) => `\`${d.file}\``).join(', ')}`);
    L.push(decisions.length ? '- Decisions already made (do not reopen):' : '- Decisions: none recorded. Where a base skill offers alternatives, ask the user to choose.');
    decisions.forEach(([k, v]) => L.push(`  - ${k}: ${String(v).replace(/\s+/g, ' ')}`));
    L.push(f.core.length ? '- Base skills (read fully; they define the standards, first one wins on conflict):' : '- Base skills: none. This front has no architecture definition yet.');
    f.core.forEach((s) => L.push(s.found ? `  - \`${s.name}\` version ${s.hash}: \`${s.file}\`` : `  - \`${s.name}\`: NOT FOUND among installed skills`));
    if (f.topics.length) L.push(`- Topic skills (load only when a task needs them): ${f.topics.map((s) => `\`${s.name}\`${s.found ? '' : ' (NOT FOUND)'}`).join(', ')}`);
    L.push(f.checks.length ? `- Declared checks: ${f.checks.map((c) => `\`${typeof c === 'string' ? c : c.cmd}\``).join(', ')}` : '- Declared checks: none.', '');
  }
  if (fr.drift.length) L.push(`- **Base skills changed since the standards were written**: ${fr.drift.join(', ')}. Compare and update the standards, then run \`specboot map --accept-skills\`.`);
  sec('Existing rule sources');
  if (!facts.ruleFiles.length) L.push(fr.mode === 'greenfield' ? '- None yet. The first change should create the lint, test and CI configuration.' : '- None found. Conventions must be inferred from the code and confirmed by the developer.');
  const byKind = new Map();
  for (const r of facts.ruleFiles) { if (!byKind.has(r.kind)) byKind.set(r.kind, []); byKind.get(r.kind).push(r.file); }
  for (const [kind, list] of byKind) L.push(`- **${kind}**: ${list.slice(0, 12).map((f) => `\`${f}\``).join(', ')}${list.length > 12 ? `, and ${list.length - 12} more` : ''}`);
  sec('Commands defined by the project');
  facts.scripts.forEach((s) => L.push(`- \`${s.dir}\` package script \`${s.name}\`: \`${s.cmd.slice(0, 120)}\``));
  facts.makeTargets.forEach((t) => L.push(`- \`${t.dir}\` make target \`${t.name}\``));
  facts.pyTools.forEach((t) => L.push(`- \`${t.dir}\` pyproject section \`[tool.${t.name}]\``));
  if (!facts.scripts.length && !facts.makeTargets.length && !facts.pyTools.length) L.push('- None found.');
  sec('Executable checks (openspec/standards/checks.json is the single list that runs)');
  checks.length ? checks.forEach((c) => L.push(`- ${c.name}: \`${c.cmd}\` in \`${c.cwd}\` (source: ${c.source || 'user'})`)) : L.push('- None configured. Nothing can be enforced automatically until a front declares checks in fronts.json or the project defines lint and test commands.');
  L.push('', 'To change them: front checks are edited in `fronts.json`; any other command is added directly to `checks.json`. Both take effect on the next `specboot check`.');
  sec('Directory map (tracked files, depth 3)');
  const rows = [...facts.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 150);
  for (const [dir, e] of rows) {
    const top = Object.entries(e.ext).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([x, n]) => `${x} ${n}`).join(', ');
    L.push(`- \`${dir}/\` ${e.count} files (${top})`);
  }
  if (facts.dirs.size > 150) L.push(`- ... ${facts.dirs.size - 150} more directories`);
  sec('Representative files to read per module');
  facts.samples.length ? facts.samples.forEach((s) => L.push(`- \`${s.dir}/\` (${s.count} source files): ${s.files.map((f) => `\`${path.basename(f)}\``).join(', ')}`)) : L.push('- No module with two or more source files found.');
  sec('Recent commit subjects');
  facts.commits.length ? facts.commits.forEach((c) => L.push(`- ${c}`)) : L.push('- No commits.');
  sec('Branches');
  facts.branches.length ? facts.branches.forEach((b) => L.push(`- ${b}`)) : L.push('- None.');
  return L.join('\n') + '\n';
}

const standardsDir = (client) => path.join(storeDir(client), 'openspec', 'standards');
const docStatus = (file) => (read(file).match(/^status:\s*([a-z]+)/m) || [])[1] || null;

// ---- fronts: which areas the project has, which skills define each one, what was decided, how it is checked

const frontsFile = (client) => path.join(standardsDir(client), 'fronts.json');
const lockFile = (client) => path.join(standardsDir(client), 'fronts.lock.json');
const ML_FRONT = /^(ml|machine-learning|data|data-science|datascience|analytics)/;

function loadFronts(client) {
  const j = readJson(frontsFile(client), null) || {};
  return {
    mode: j.mode === 'greenfield' ? 'greenfield' : 'brownfield', fronts: j.fronts || {}, documents: j.documents || [],
    docs: (j.docs || {}).placement || null, planning: j.planning || null, skillsPin: j.skillsPin || null,
  };
}

// Update fronts.json without losing keys this command does not own.
function saveFronts(client, patch) {
  const j = readJson(frontsFile(client), null) || {};
  writeJson(frontsFile(client), { mode: 'brownfield', fronts: {}, documents: [], ...j, ...patch });
}

// Architecture documents live under docs/ (project root; real folder or link to the store) once a
// placement is chosen, and under openspec/standards/sources/ before that.
const docPath = (root, client, file) => (file.startsWith('docs/') ? path.join(root || storeDir(client), file) : path.join(standardsDir(client), file));
const docLabel = (file) => (file.startsWith('docs/') ? file : `openspec/standards/${file}`);
const storeDocs = (client) => path.join(storeDir(client), 'docs');

function overrideCount(client) {
  return read(path.join(standardsDir(client), 'overrides.md')).split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*:?-/.test(l) && !/^\|\s*Document term/i.test(l) && l.split('|').slice(1, 3).every((c) => c.trim())).length;
}

// A greenfield project stops being one when real code is tracked under its declared fronts.
function handoffDue(mode, fronts, files) {
  if (mode !== 'greenfield') return [];
  return fronts.filter((f) => files.filter((x) => SOURCE_EXT.has(path.extname(x)) && (f.path === '.' || x.startsWith(`${f.path}/`))).length >= 3).map((f) => f.name);
}

function frontChecks(fr) {
  const out = [];
  for (const [name, f] of Object.entries(fr.fronts)) {
    for (const c of f.checks || []) {
      const cmd = typeof c === 'string' ? c : c.cmd;
      if (cmd) out.push({ name: `${name}: ${typeof c === 'string' ? cmd : (c.name || cmd)}`, cwd: f.path || '.', cmd });
    }
  }
  return out;
}

// checks.json (found in the project, editable) plus the checks each front declares.
// checks.json is the one list `specboot check` runs. It is kept in sync, never hand-merged elsewhere:
//   source "front"   declared in fronts.json (edit them there; removed here when removed there)
//   source "project" discovered from the project's own scripts and configs
//   source "user"    added by hand in checks.json (always kept)
// The first owner of a folder wins: a later alternative for the same folder is added with
// "disabled": true so it is visible but does not run until someone enables it.
function syncChecks(info, client, facts) {
  const file = path.join(standardsDir(client), 'checks.json');
  const cur = readJson(file, null) || {};
  const existing = cur.checks || [];
  const fr = loadFronts(client);
  const key = (c) => `${c.cwd || '.'}\u0000${c.cmd}`;
  const proposed = proposeChecks(info.root, facts || collectFacts(info.root));
  const proposedKeys = new Set(proposed.map(key));
  const declared = frontChecks(fr);
  const declaredKeys = new Set(declared.map(key));
  const out = []; const seen = new Set(); const added = [];
  const push = (c, isNew) => { const k = key(c); if (seen.has(k)) return; seen.add(k); out.push(c); if (isNew) added.push(c); };
  for (const c of existing) {
    const source = c.source || (declaredKeys.has(key(c)) ? 'front' : proposedKeys.has(key(c)) ? 'project' : 'user');
    if (source === 'front' && !declaredKeys.has(key(c))) continue; // no longer declared in fronts.json
    push({ ...c, source }, false);
  }
  const enabledIn = (cwd, source) => out.some((c) => (c.cwd || '.') === cwd && c.source === source && !c.disabled);
  const order = fr.mode === 'greenfield' ? [[declared, 'front', 'project'], [proposed, 'project', 'front']] : [[proposed, 'project', 'front'], [declared, 'front', 'project']];
  for (const [list, source, other] of order) {
    for (const c of list) {
      const entry = { name: c.name, cwd: c.cwd || '.', cmd: c.cmd, source };
      if (enabledIn(entry.cwd, other)) { entry.disabled = true; entry.reason = `${other === 'front' ? 'fronts.json already declares' : 'the project already defines'} checks for this folder; set "disabled": false to run this one too`; }
      push(entry, true);
    }
  }
  const next = {
    note: 'The list `specboot check` runs. source front = declared in fronts.json (edit it there). source project = discovered in the repository. source user = added here by hand. Set "disabled": true to keep an entry without running it.',
    checks: out,
  };
  if (JSON.stringify(next) !== JSON.stringify(cur)) writeJson(file, next);
  return { added, checks: out };
}

function allChecks(client) {
  return (readJson(path.join(standardsDir(client), 'checks.json'), {}).checks || []).filter((c) => !c.disabled);
}

// Resolve each front's skills to real files and freeze the version the standards were written from.
function resolveFronts(client, opts = {}) {
  const fr = loadFronts(client);
  const catalog = new Map(skillCatalog().skills.map((s) => [s.name, s]));
  const lock = readJson(lockFile(client), {});
  const unresolved = []; const drift = []; const invalid = [];
  const fronts = Object.entries(fr.fronts).map(([name, f]) => {
    if (!VALID_NAME.test(name)) invalid.push(name);
    lock[name] = lock[name] || {};
    const resolve = (skill, isCore) => {
      const s = catalog.get(skill);
      if (!s) { unresolved.push(`${name}: ${skill}`); return { name: skill, found: false }; }
      if (isCore) {
        if (!lock[name][skill] || opts.acceptSkills) lock[name][skill] = s.hash;
        else if (lock[name][skill] !== s.hash) drift.push(`${name}: ${skill}`);
      }
      return { name: skill, found: true, file: path.join(s.dir, 'SKILL.md'), hash: s.hash };
    };
    return {
      name, path: f.path || '.', template: f.template || (ML_FRONT.test(name) ? 'ml' : 'area'),
      core: (f.core || []).map((s) => resolve(s, true)), topics: (f.topics || []).map((s) => resolve(s, false)),
      decisions: f.decisions || {}, checks: f.checks || [],
    };
  });
  // Architecture documents supplied by the team: copied into the store, frozen by hash like the skills.
  lock._documents = lock._documents || {};
  const docDrift = []; const docMissing = [];
  const documents = fr.documents.map((d) => {
    const file = docPath(opts.root, client, d.file);
    if (!exists(file)) { docMissing.push(d.file); return { ...d, found: false }; }
    const hash = sha(file);
    if (!lock._documents[d.file] || opts.acceptSkills) lock._documents[d.file] = hash;
    else if (lock._documents[d.file] !== hash) docDrift.push(d.file);
    return { ...d, found: true, hash };
  });
  if ((fronts.length || documents.length) && !opts.readOnly) writeJson(lockFile(client), lock);
  const planningMissing = [];
  const planning = ((fr.planning || {}).skills || []).map((n) => {
    const sk = catalog.get(n);
    if (!sk) { planningMissing.push(n); return { name: n, found: false }; }
    return { name: n, found: true, file: path.join(sk.dir, 'SKILL.md') };
  });
  return {
    mode: fr.mode, raw: fr, docs: fr.docs, fronts, unresolved, drift, invalid, documents, docDrift, docMissing,
    planning, planningMissing, planningOutput: (fr.planning || {}).output || 'docs/planning',
  };
}

// Which version of each skills repository the project's standards were written with.
function normalizeRemote(url) {
  return String(url || '').trim().replace(/\.git$/, '').replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '').replace(':', '/');
}
function sourceRepos() {
  const seen = new Map();
  for (const src of listSources()) {
    const top = tryGit(src, 'rev-parse', '--show-toplevel');
    if (!top || seen.has(top)) continue;
    const key = normalizeRemote(tryGit(top, 'remote', 'get-url', 'origin')) || path.basename(top);
    seen.set(top, { top, key, commit: tryGit(top, 'rev-parse', 'HEAD'), dirty: !!tryGit(top, 'status', '--porcelain', '--', '.') });
  }
  return [...seen.values()];
}
function pinSkills(client, force) {
  const current = loadFronts(client).skillsPin;
  if (current && !force) return false;
  const pin = {};
  for (const r of sourceRepos()) if (r.commit) pin[r.key] = r.commit;
  if (!Object.keys(pin).length) return false;
  saveFronts(client, { skillsPin: pin });
  return true;
}
function pinStatus(client) {
  const pin = loadFronts(client).skillsPin || {};
  const repos = sourceRepos();
  const out = [];
  for (const [key, commit] of Object.entries(pin)) {
    const r = repos.find((x) => x.key === key);
    if (!r) out.push({ key, commit, problem: 'missing' });
    else if (r.commit !== commit) out.push({ key, commit, have: r.commit, top: r.top, problem: 'different' });
    else if (r.dirty) out.push({ key, commit, top: r.top, problem: 'dirty' });
  }
  return out;
}

const DEFAULT_PLANNING = ['product-ideation-brainstorm', 'breakdown-feature-prd', 'project-manager'];

// Planning is on by default. While the list is managed by specboot ("auto", or empty), every map adds
// the default planning skills that are installed now, so a project created before the plan plugin was
// registered, or before 0.6, picks them up. A list the user wrote by hand is left alone;
// "planning": {"disabled": true} turns planning off.
function ensurePlanning(client) {
  const cur = loadFronts(client).planning;
  if (cur && cur.disabled) return { skills: [], added: [], disabled: true };
  const skills = (cur && cur.skills) || [];
  const managed = !cur || cur.auto || !skills.length;
  if (!managed) return { skills, added: [], disabled: false };
  const have = new Set(skillCatalog().skills.map((sk) => sk.name));
  const added = DEFAULT_PLANNING.filter((n) => have.has(n) && !skills.includes(n));
  const next = { skills: [...skills, ...added], output: (cur && cur.output) || 'docs/planning', auto: true };
  if (!cur || added.length || !cur.auto) saveFronts(client, { planning: next });
  return { skills: next.skills, added, disabled: false };
}

function mapProject(info, client, opts = {}) {
  const dir = standardsDir(client);
  mkdirp(dir);
  const stack = detectStack(info.root);
  const facts = collectFacts(info.root);
  if (!opts.readOnly) ensurePlanning(client);
  const fr = resolveFronts(client, { ...opts, root: info.root });
  const tpl = path.join(HARNESS, 'templates', 'standards');
  const created = [];
  const scaffold = (name, source, vars = {}) => {
    const dest = path.join(dir, name);
    if (exists(dest)) return;
    let body = read(path.join(tpl, source));
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll(`{{${k}}}`, v);
    fs.writeFileSync(dest, body); created.push(name);
  };
  scaffold('base-standards.md', 'base-standards.md');
  const title = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const areas = fr.fronts.length
    ? fr.fronts.filter((f) => VALID_NAME.test(f.name)).map((f) => [f.name, f.template === 'ml' ? 'ml-standards.md' : 'area-standards.md'])
    : areasFor(stack).map((a) => [a, 'area-standards.md']);
  for (const [area, source] of areas) scaffold(`${area}-standards.md`, source, { AREA: area, AREA_TITLE: title(area) });
  if (fr.mode === 'greenfield' || fr.documents.length) scaffold('decisions.md', 'decisions.md');
  if (fr.documents.length) scaffold('overrides.md', 'overrides.md');
  if (fr.fronts.length) scaffold('skill-gaps.md', 'skill-gaps.md');
  scaffold('development-guide.md', 'development-guide.md');
  scaffold('data-model.md', 'data-model.md');
  scaffold('api-spec.md', 'api-spec.md');
  if (fr.fronts.length || (fr.planning || []).length) pinSkills(client, !!opts.acceptSkills);
  const hadChecks = exists(path.join(dir, 'checks.json'));
  const sync = syncChecks(info, client, facts);
  if (!hadChecks) created.push('checks.json');
  const checks = allChecks(client);
  const handoff = handoffDue(fr.mode, fr.fronts, facts.files);
  fs.writeFileSync(path.join(dir, 'project-facts.md'), factsMarkdown(info.root, stack, facts, checks, fr, { handoff, overrides: overrideCount(client) }));
  return { dir, created, checks, checksAdded: hadChecks ? sync.added : [], ruleFiles: facts.ruleFiles.length, stack, fr, handoff };
}

function cmdDoc(args) {
  const { pos, flags } = parseArgs(args);
  const [action, target] = pos;
  const { info, client } = requireProject();
  const file = frontsFile(client);
  const j = readJson(file, null) || { mode: 'brownfield', fronts: {} };
  j.documents = j.documents || [];
  const placement = (j.docs || {}).placement || null;
  if (action === 'add' && target) {
    const src = path.resolve(target);
    if (!exists(src) || !fs.statSync(src).isFile()) die(`file not found: ${target}`);
    const front = typeof flags.front === 'string' ? flags.front : null;
    if (front && !j.fronts[front]) die(`front "${front}" is not declared in fronts.json (declared: ${Object.keys(j.fronts).join(', ') || 'none'})`);
    const docsRoot = real(path.join(info.root, 'docs'));
    let rel; let dest = null;
    if (placement && docsRoot && real(src).startsWith(docsRoot + path.sep)) rel = `docs/${path.relative(docsRoot, real(src)).split(path.sep).join('/')}`; // already in docs/: register in place
    else if (placement) { rel = `docs/architecture/${path.basename(src)}`; dest = path.join(info.root, rel); }
    else { rel = `sources/${path.basename(src)}`; dest = path.join(standardsDir(client), rel); }
    const replaced = j.documents.some((d) => d.file === rel);
    if (dest && real(dest) !== real(src)) { mkdirp(path.dirname(dest)); fs.copyFileSync(src, dest); }
    j.documents = j.documents.filter((d) => d.file !== rel).concat([{ file: rel, front }]);
    writeJson(file, j);
    log(`${replaced ? 'document updated' : 'document added'}: ${docLabel(rel)} (${front ? `front ${front}` : 'whole project'})`);
    if (!placement) log('  docs/ placement is not decided, so it was stored under openspec/standards/sources/. Decide with: specboot docs client | specboot docs store');
    if (!/\.(md|markdown|txt|adoc|rst|ya?ml|json)$/i.test(src)) warn('this is not a plain-text format. Agents read Markdown most reliably; consider converting it.');
    const r = mapProject(info, client);
    reportFronts(r.fr, info);
    writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), r.stack, r.fr.raw);
    log(`Next: ask your agent to run the \`${r.fr.mode === 'greenfield' ? 'specboot-prescribe' : 'specboot-map'}\` skill so the standards follow this document.`);
  } else if (action === 'remove' && target) {
    const hit = j.documents.find((d) => d.file === target || path.basename(d.file) === path.basename(target));
    if (!hit) die(`not registered: ${target}`);
    j.documents = j.documents.filter((d) => d !== hit);
    writeJson(file, j);
    if (hit.file.startsWith('sources/')) fs.rmSync(path.join(standardsDir(client), hit.file), { force: true });
    mapProject(info, client);
    log(`document unregistered: ${docLabel(hit.file)}${hit.file.startsWith('docs/') ? ' (the file itself was left in docs/)' : ''}`);
  } else if (action === 'list' || !action) {
    if (!j.documents.length) log('No architecture documents. Add one with: specboot doc add <file> [--front <name>]');
    j.documents.forEach((d) => log(`${docLabel(d.file)}  (${d.front ? `front ${d.front}` : 'whole project'})`));
  } else die('usage: specboot doc add <file> [--front <name>] | remove <file> | list');
}

function requireProject() {
  const info = requireRepo();
  const client = clientFor(info);
  if (!client) die('this repository is not registered. Run: specboot init <client-name>');
  return { info, client };
}

function cmdMap(args = []) {
  const { flags } = parseArgs(args);
  const { info, client } = requireProject();
  const accept = !!(flags['accept-skills'] || flags.accept);
  const r = mapProject(info, client, { acceptSkills: accept });
  log('specboot map');
  refreshGuards(info, client);
  ok(`project-facts.md rewritten (${r.ruleFiles} rule sources found)`);
  if (r.created.length) ok(`scaffolded: ${r.created.join(', ')}`);
  r.checks.length ? ok(`${r.checks.length} executable checks in checks.json`) : warn('no executable checks: declare them per front in fronts.json, or add them to openspec/standards/checks.json');
  r.checksAdded.forEach((c) => ok(`check added${c.disabled ? ' (disabled)' : ''}: ${c.name} -> ${c.cmd}`));
  if (r.fr.fronts.length) ok(`${r.fr.fronts.length} fronts declared: ${r.fr.fronts.map((f) => f.name).join(', ')}`);
  if (r.fr.documents.length) ok(`${r.fr.documents.length} architecture documents: ${r.fr.documents.map((d) => docLabel(d.file)).join(', ')}`);
  reportPlanning(r.fr, info);
  if (accept) ok('current versions of base skills and architecture documents accepted');
  reportFronts(r.fr, info);
  writeStackConfig(path.join(storeDir(client), 'openspec', 'config.yaml'), r.stack, r.fr.raw);
  if (r.handoff.length) {
    warn(`handoff due: real code is tracked under ${r.handoff.join(', ')} but the project is still greenfield`);
    log('        1. ask your agent to run the `specboot-map` skill (verification pass)\n        2. specboot mode brownfield');
  }
  const pending = fs.readdirSync(r.dir).filter((f) => f.endsWith('.md') && docStatus(path.join(r.dir, f)) === 'draft' && !['overrides.md', 'skill-gaps.md'].includes(f));
  const skill = r.fr.mode === 'greenfield' ? 'specboot-prescribe' : 'specboot-map';
  if (pending.length) log(`\nStill empty: ${pending.join(', ')}\nNext: ask your agent to run the \`${skill}\` skill, then review what it marks as [assumed].`);
}

function cmdCheck(args) {
  const { flags } = parseArgs(args);
  const { info, client } = requireProject();
  const all = syncChecks(info, client).checks;
  const checks = all.filter((c) => !c.disabled);
  if (flags.list) {
    if (!all.length) log('No checks. Declare them per front in openspec/standards/fronts.json or add them to openspec/standards/checks.json.');
    all.forEach((c) => log(`${c.disabled ? 'off' : 'on '}  ${String(c.source || 'user').padEnd(8)} ${c.name.padEnd(34)} ${c.cmd}   (in ${c.cwd})`));
    return;
  }
  if (!checks.length) {
    log('specboot check: no executable checks in openspec/standards/checks.json.');
    log('Nothing was verified. Declare checks per front in fronts.json, or add commands to checks.json.');
    process.exit(flags.strict ? 1 : 0);
  }
  const results = [];
  for (const c of checks) {
    const cwd = path.join(info.root, c.cwd || '.');
    if (!exists(cwd)) { results.push([c.name, null]); continue; }
    log(`\n=== ${c.name}: ${c.cmd}`);
    let pass = true;
    try { execSync(c.cmd, { cwd, stdio: 'inherit' }); } catch { pass = false; }
    results.push([c.name, pass]);
  }
  log('\nspecboot check summary');
  results.forEach(([n, p]) => (p === null ? warn(`${n} (skipped: its folder does not exist yet)`) : p ? ok(n) : bad(n)));
  const failed = results.filter(([, p]) => p === false).length;
  const ran = results.filter(([, p]) => p !== null).length;
  if (!ran) { log('\nNo check could run: none of the front folders exist yet. Nothing was verified.'); process.exit(flags.strict ? 1 : 0); }
  log(failed ? `\n${failed} of ${ran} checks failed.` : `\nAll ${ran} checks that ran passed.`);
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------- doctor

function cmdDoctor(args = []) {
  const { flags } = parseArgs(args);
  let fails = 0;
  const fail = (m) => { bad(m); fails++; };
  const strict = (m) => (flags.strict ? fail(m) : warn(m));
  log('Machine');
  const v = tryRun(OPENSPEC, ['--version']);
  v ? ok(`openspec CLI ${v}`) : fail('openspec CLI not found (npm install -g @fission-ai/openspec@latest)');
  const sources = skillSources();
  for (const base of skillTargets()) {
    const missing = sources.filter((s) => real(path.join(base, s.name)) !== real(s.dir)).map((s) => s.name);
    if (!missing.length) { ok(`${sources.length} skills linked in ${base}`); continue; }
    const taken = missing.filter((n) => lstat(path.join(base, n)) && real(path.join(base, n)) && !isOurs(path.join(base, n)));
    const free = missing.filter((n) => !taken.includes(n));
    if (free.length) fail(`${base}: ${free.length} skills not linked, e.g. ${free.slice(0, 4).join(', ')} (run: specboot install)`);
    if (taken.length) {
      fail(`${base}: ${taken.length} skill names taken by folders specboot did not create (run: specboot install --adopt)`);
      taken.slice(0, 6).forEach((n) => log(`        ${describeConflict(path.join(base, n))}`));
    }
  }
  if (!sources.some((s) => s.name.startsWith('openspec-'))) fail('openspec-* skills not generated (run: specboot install)');
  listSources().length ? ok(`${listSources().length} skill sources registered`) : warn('no skill source registered: only the harness skills are available (specboot source add <folder>)');
  for (const f of instructionFiles()) read(f).includes(MARK.start) ? ok(`global rule present in ${f}`) : fail(`global rule missing in ${f}`);
  // Efficiency pack (machine tools + skills). Missing tools are warnings unless --strict.
  log('\nEfficiency');
  const effSkill = (n) => sources.some((s) => s.name === n);
  effSkill('ponytail') ? ok('ponytail skill linked') : strict('ponytail skill missing (run: specboot install)');
  effSkill('caveman') ? ok('caveman skill linked') : warn('caveman skill missing (run: specboot install)');
  tryRun('codegraph', ['--version']) ? ok('codegraph CLI on PATH') : strict('codegraph CLI missing (run: specboot install)');
  tryRun('rtk', ['gain']) !== null ? ok('rtk CLI on PATH') : warn(tryRun('rtk', ['--version']) ? 'rtk on PATH but `rtk gain` fails (another program named rtk?); run: specboot install' : 'rtk CLI missing (optional; run: specboot install)');
  tryRun('headroom', ['--version']) ? ok('headroom CLI on PATH') : warn('headroom CLI missing (optional; run: specboot install)');
  if (process.env.SPECBOOT_SKIP_EFFICIENCY === '1') warn('SPECBOOT_SKIP_EFFICIENCY=1 is set');

  const info = repoInfo();
  if (!info) { log('\nNot inside a git repository; project checks skipped.'); process.exit(fails ? 1 : 0); }
  log(`\nProject ${info.root}`);
  const client = clientFor(info);
  if (!client) { fail('not registered (run: specboot init <client-name>)'); process.exit(1); }
  ok(`client store: ${client}`);
  const placement = loadFronts(client).docs;
  const link = path.join(info.root, 'openspec');
  real(link) && real(link) === real(path.join(storeDir(client), 'openspec'))
    ? ok('openspec/ linked to the store')
    : fail('openspec/ link missing in this working tree (run: specboot link)');
  const excl = read(path.join(info.common, 'info', 'exclude'));
  const gaps = guardGaps(info, placement);
  if (!gaps.missingExcludes) fail('exclude entries missing (run: specboot init)');
  else if (gaps.missingExcludes.length) fail(`exclude is outdated, missing: ${gaps.missingExcludes.join(', ')} (run: specboot link)`);
  else ok('exclude entries present and current');
  if (gaps.hook === 'unmanaged') warn('core.hooksPath set; pre-commit guard not managed by specboot');
  else if (gaps.hook === 'missing') fail('pre-commit guard missing (run: specboot link)');
  else if (gaps.hook === 'outdated') fail('pre-commit guard is outdated: it does not block every private path (run: specboot link)');
  else ok('pre-commit guard installed and current');
  const cr = cursorRuleState(info);
  if (cr === 'current') ok('Cursor rule present (.cursor/rules/specboot.mdc)');
  else if (cr === 'foreign') warn('.cursor/rules/specboot.mdc exists but is not managed by specboot; Cursor does not get the specboot rule');
  else warn(`Cursor rule ${cr === 'missing' ? 'missing' : 'outdated'} (run: specboot link)`);
  const guarded = excl.split('\n').includes('/docs') && (tryGit(info.root, 'config', '--get', 'core.hooksPath') || read(path.join(info.common, 'hooks', 'pre-commit')).includes('docs(/|$)'));
  if (placement === 'local') {
    const d = path.join(info.root, 'docs'); const main = mainRoot(info);
    if (real(main) !== real(info.root)) real(d) === real(path.join(main, 'docs')) ? ok('docs/ linked to the main working tree') : fail('docs/ missing in this worktree (run: specboot link)');
    else lstat(d) && !lstat(d).isSymbolicLink() ? ok('docs/ is a local folder, ignored by git') : fail('docs/ should be a real folder here (run: specboot docs local)');
    if (!guarded) fail('docs/ is local but not excluded and guarded (run: specboot docs local)');
    const pending = docsPending(info, client);
    if (pending) warn(`docs/ has ${pending} changes not yet backed up to the store (run: specboot sync)`);
  } else if (placement === 'store') {
    real(path.join(info.root, 'docs')) === real(storeDocs(client)) ? ok('docs/ linked to the private store') : fail('docs/ should be linked to the store (run: specboot link)');
    if (!guarded) fail('docs/ is private but not excluded and guarded (run: specboot docs store)');
  } else if (placement === 'client') {
    lstat(path.join(info.root, 'docs'))?.isSymbolicLink() ? fail('docs/ is set to client but is still a link (run: specboot docs client)') : ok('docs/ belongs to the client repository');
    if (excl.split('\n').includes('/docs')) fail('docs/ is set to client but is still excluded (run: specboot docs client)');
  } else warn('docs/ placement not decided (specboot docs local | client | store)');
  if (!read(path.join(info.root, '.gitignore')).split('\n').some((l) => /^\/?openspec\/?$/.test(l.trim()))) warn('ignore rules are local to this clone; other clones are not protected (optional: specboot init <client> --gitignore)');
  const re = new RegExp(blockRe(isPrivate(placement)));
  const tracked = (tryGit(info.root, 'ls-files') || '').split('\n').filter((f) => re.test(f));
  if (tracked.length) warn(`the client repository already versions: ${tracked.slice(0, 5).join(', ')}${tracked.length > 5 ? ', ...' : ''}`);
  const staged = (tryGit(info.root, 'diff', '--cached', '--name-only', '--diff-filter=A') || '').split('\n').filter((f) => re.test(f));
  staged.length ? fail(`private files are staged: ${staged.join(', ')}`) : ok('no private files staged');
  const sdir = standardsDir(client);
  if (!exists(path.join(sdir, 'base-standards.md'))) fail('project standards missing (run: specboot map)');
  else {
    const docs = fs.readdirSync(sdir).filter((f) => f.endsWith('.md') && !['project-facts.md', 'overrides.md', 'skill-gaps.md'].includes(f));
    const by = (s) => docs.filter((f) => docStatus(path.join(sdir, f)) === s);
    const fr = resolveFronts(client, { readOnly: true, root: info.root });
    const facts = collectFacts(info.root);
    const skill = fr.mode === 'greenfield' ? 'specboot-prescribe' : 'specboot-map';
    ok(`project mode: ${fr.mode}${fr.fronts.length ? `; fronts: ${fr.fronts.map((f) => f.name).join(', ')}` : ''}`);
    const handoff = handoffDue(fr.mode, fr.fronts, facts.files);
    if (handoff.length) strict(`handoff due: code is tracked under ${handoff.join(', ')} but the project is still greenfield (run the specboot-map skill, then: specboot mode brownfield)`);
    if (fr.unresolved.length) { fails += 1; reportFronts({ ...fr, drift: [], docMissing: [], docDrift: [], invalid: [], fronts: [] }, info); }
    fr.docMissing.forEach((d) => fail(`architecture document missing: ${docLabel(d)}`));
    fr.docDrift.forEach((d) => warn(`architecture document changed since the standards were written: ${docLabel(d)} (review, then: specboot map --accept)`));
    if (fr.documents.length) ok(`${fr.documents.length} architecture documents registered; ${overrideCount(client)} overrides recorded`);
    reportPlanning(fr, info);
    if ((loadFronts(client).planning || {}).auto && fr.planning.length < DEFAULT_PLANNING.length && skillCatalog().skills.some((sk) => DEFAULT_PLANNING.includes(sk.name) && !fr.planning.some((x) => x.name === sk.name))) warn('more planning skills are installed than the project lists (run: specboot map)');
    for (const p of pinStatus(client)) {
      if (p.problem === 'missing') warn(`the project's standards were written with skills repository ${p.key} at ${p.commit.slice(0, 10)}, which is not registered here (clone it, then: specboot source add <its skills folder> && specboot install)`);
      if (p.problem === 'different') warn(`skills repository ${p.key} is at ${p.have.slice(0, 10)} but the project uses ${p.commit.slice(0, 10)}: git -C ${p.top} checkout ${p.commit.slice(0, 10)} (or, to adopt the new version: specboot map --accept)`);
      if (p.problem === 'dirty') warn(`skills repository ${p.key} has uncommitted changes; teammates will not see them`);
    }
    fr.drift.forEach((s) => warn(`base skill changed since the standards were written: ${s} (review, then: specboot map --accept)`));
    const written = [...by('mapped'), ...by('prescribed')];
    if (by('draft').length) warn(`standards still empty: ${by('draft').join(', ')} (ask the agent to run the ${skill} skill)`);
    if (written.length) warn(`standards written by the agent but not reviewed by a person: ${written.join(', ')}`);
    if (!by('draft').length && !written.length) ok(`${docs.length} standards documents reviewed`);
    const all = syncChecks(info, client, facts).checks;
    const on = all.filter((c) => !c.disabled);
    on.length ? ok(`${on.length} executable checks in checks.json${all.length > on.length ? ` (${all.length - on.length} disabled)` : ''}`) : warn('no executable checks; project rules cannot be enforced automatically');
  }
  const dir = storeDir(client);
  tryGit(dir, 'status', '--porcelain') ? warn('store has uncommitted specs (run: specboot sync)') : ok('store is committed');
  if (!tryGit(dir, 'remote', 'get-url', 'origin')) strict(`store has no remote; specs exist only on this machine (git -C ${dir} remote add origin <url>)`);
  else {
    tryRun('git', ['fetch', '-q', 'origin'], { cwd: dir, timeout: 15000 });
    const counts = (tryGit(dir, 'rev-list', '--left-right', '--count', 'HEAD...@{u}') || '').split(/\s+/).map(Number);
    if (counts.length === 2) {
      if (counts[1]) strict(`store is ${counts[1]} commits behind the team (run: specboot pull)`);
      if (counts[0]) warn(`store has ${counts[0]} commits not pushed (run: specboot sync)`);
      if (!counts[0] && !counts[1]) ok('store is up to date with the team');
    }
  }
  process.exit(fails ? 1 : 0);
}

// ---------------------------------------------------------------- main

const HELP = `specboot - global OpenSpec harness that keeps client repositories clean

Machine (once):
  specboot install              link skills; write global rule; always run efficiency pack (ponytail, caveman,
                                codegraph, rtk, headroom) via bash (macOS/Linux) or PowerShell (Windows).
                                Skip pack: SPECBOOT_SKIP_EFFICIENCY=1
  specboot install --adopt      also back up (~/.specboot-data/backups) and replace skill folders that other
                                tools left under names specboot manages (openspec-* from OpenSpec: always)
  specboot uninstall            remove skill links and global rule (stores are kept)
  specboot source add <path> | remove <path> | list
                                register a folder of your own skills (for example a plugins repository)

Project (inside the client repository):
  specboot init <client> [--remote <git-url>] [--fronts <file.json>] [--new | --existing]
                         [--docs local|client|store] [--gitignore]
                                create/clone the private spec store, link openspec/, hide AI paths, install guard
  specboot link                 recreate the openspec/ (and private docs/) links in a new git worktree; refresh the
                                exclude, the pre-commit guard and the Cursor rule (.cursor/rules/specboot.mdc)
  specboot docs [local|client|store]
                                where docs/ (planning, architecture, ADRs) lives: local and ignored (default),
                                versioned in the client repository, or a link to the private store
  specboot doc add <file> [--front <name>] | remove <file> | list
                                register an architecture document of your own; it outranks the base skills
  specboot mode [greenfield|brownfield]
                                show or change the project mode (flip to brownfield once real code exists)
  specboot detect [--json] [--write]
                                detect the stack from manifests; --write refreshes openspec/config.yaml
  specboot map [--accept]       inventory rules, fronts and documents; scaffold standards; sync checks.json;
                                --accept records the current versions of skills, skill repositories and documents
  specboot check [--list] [--strict]
                                run the checks in openspec/standards/checks.json (the single list that runs)
  specboot sync [-m <message>]  commit local work, bring in the team's, push (private spec store and local docs/)
  specboot pull                 bring in the team's work without pushing
  specboot doctor [--strict]    verify machine and project setup; --strict also fails on no remote / handoff due

Data lives in ${DATA} (override with SPECBOOT_DATA).`;

const [cmd, ...rest] = process.argv.slice(2);
const commands = { install: cmdInstall, uninstall: cmdUninstall, init: cmdInit, link: cmdLink, source: cmdSource, doc: cmdDoc, docs: cmdDocs, mode: cmdMode, pull: cmdPull, detect: cmdDetect, map: cmdMap, check: cmdCheck, sync: cmdSync, doctor: cmdDoctor };
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') log(HELP);
else if (commands[cmd]) commands[cmd](rest);
else die(`unknown command "${cmd}". Run: specboot help`);
