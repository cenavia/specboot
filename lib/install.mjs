import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import {
  HARNESS, HOME, DATA, GENERATED, SOURCES, LINKS,
  OPENSPEC, IS_WIN, EFFICIENCY_SKILLS, EFFICIENCY_INSTALL, EFFICIENCY_INSTALL_PS1,
  MARK,
} from './paths.mjs';
import {
  log, ok, warn, bad, die,
  run, tryRun, exists, read, mkdirp, lstat, real, readJson, writeJson,
  linkDir, upsertBlock, removeBlock, parseArgs,
} from './util.mjs';
import {
  sha, VALID_NAME, skillName, findSkillDirs, listSources, skillCatalog, skillSources,
} from './skills.mjs';

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

export {
  cmdInstall,
  cmdUninstall,
  skillTargets,
  isOurs,
  ensureCursorRule,
  cursorRuleState,
  instructionFiles,
  GLOBAL_RULE,
  generateOpenspecSkills,
  runEfficiencyPack,
  describeConflict,
  conflictOwner,
};
