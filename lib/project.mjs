import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  HARNESS, HOME, DATA, STORES, GENERATED, PROJECTS, SOURCES, LINKS, DEFAULT_FRONTS,
  DATA_PRESETS, HARNESS_PRESETS, OPENSPEC, IS_WIN,
  EXCLUDES, BLOCK_RE, MARK, YMARK, XMARK,
} from './paths.mjs';
import {
  log, ok, warn, bad, die,
  run, tryRun, git, tryGit,
  exists, read, mkdirp, lstat, real, readJson, writeJson,
  linkDir, upsertBlock, removeBlock, parseArgs,
} from './util.mjs';
import { detectStack } from './detect.mjs';
import {
  sha, VALID_NAME, skillName, findSkillDirs, listSources, skillCatalog, skillSources, cmdSource,
} from './skills.mjs';
import {
  createPresetFromDetect, planPresetFromDetect, runPresetCreate,
  resolveCompositeStack, parseTechList, findManifestForTech,
  writePresetFronts, generatedPresetPath, missingSkillsInFronts,
  discoverPresetManifests, normTech,
} from './preset.mjs';
import {
  skillTargets,
  isOurs,
  ensureCursorRule,
  cursorRuleState,
  instructionFiles,
  GLOBAL_RULE,
  describeConflict,
} from './install.mjs';

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
  const usage = 'usage: specboot init <client-name> [--remote <git-url>] [--fronts <file.json>] [--stack <tech[,tech...]>] [--topics-from <pack>] [--attach-to <front>] [--new | --existing] [--docs local|client|store] [--gitignore]';
  if (!client || !/^[a-z0-9][a-z0-9._-]*$/i.test(client)) die(usage);
  if (flags.docs !== undefined && !['local', 'client', 'store'].includes(flags.docs)) die(usage);
  if (flags.fronts && flags.stack) die('use either --fronts or --stack, not both');
  const info = requireRepo();
  log(`specboot init ${client}`);
  ensureStore(client, flags.remote);
  ensureLink(info, client);
  const projects = readJson(PROJECTS, {});
  projects[info.common] = { client, root: info.root };
  writeJson(PROJECTS, projects);
  const stack = detectStack(info.root);
  mkdirp(standardsDir(client));
  if (!exists(frontsFile(client)) || flags.fronts || flags.stack) {
    let src = {};
    if (flags.fronts) {
      src = readJson(path.resolve(String(flags.fronts)), null);
      if (!src || typeof src.fronts !== 'object') die(`cannot read a "fronts" object from ${flags.fronts}`);
    } else if (flags.stack) {
      const stackInput = String(flags.stack);
      const techs = parseTechList(stackInput);
      const resolved = resolveCompositeStack(stackInput, {
        heuristic: true,
        composite: techs.length > 1,
        topicsFrom: flags['topics-from'],
        attachTo: flags['attach-to'],
      });
      src = { fronts: resolved.fronts };
      ok(`stack preset: ${resolved.technology}${techs.length > 1 || (resolved.packs || []).length ? ` (${[...(resolved.stacks || techs), ...(resolved.packs || [])].join(' + ')})` : ''}`);
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
  if (flags.json && !flags.preset && !flags['from-detect']) {
    log(JSON.stringify(stack, null, 2));
    return;
  }
  if (!stack.length) log('No known manifests found.');
  else if (!flags.json) {
    for (const s of stack) log(`${s.tech.padEnd(16)} ${s.dirs.join(', ')}`);
  }
  if (flags.preset || flags['from-detect']) {
    if (flags.json) {
      const plan = planPresetFromDetect(stack);
      if (flags['dry-run']) {
        log(JSON.stringify({ stack, plan, wrote: false }, null, 2));
        return;
      }
      if (!plan.stackTechs.length) {
        log(JSON.stringify({ stack, plan, wrote: false }, null, 2));
        process.exit(1);
      }
      const needsForce = plan.covered.some((c) => c.status === 'partial');
      if (needsForce && !flags.force) {
        log(JSON.stringify({ stack, plan, wrote: false, error: 'partial-skills-need-force' }, null, 2));
        process.exit(1);
      }
      const result = runPresetCreate(plan.stackTechs.join(','), {
        ...flags,
        'topics-from': flags['topics-from'] || (plan.packs.length ? plan.packs.join(',') : undefined),
        force: !!flags.force,
      });
      log(JSON.stringify({
        stack,
        plan,
        wrote: true,
        out: result.out,
        technology: result.resolved.technology,
        applied: result.applied || null,
      }, null, 2));
      return;
    }
    createPresetFromDetect(stack, flags);
  }
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




export {
  cmdInit, cmdLink, cmdDocs, cmdMode, cmdDetect,
  cmdSync, cmdPull, cmdDoc, cmdMap, cmdCheck, cmdDoctor,
};
