// Apply generated preset fronts into the registered client's spec store.
// Preserves mode/docs/planning/documents/skillsPin unless --replace-fronts.

import path from 'node:path';
import { PROJECTS, STORES } from './paths.mjs';
import {
  log, ok, warn, die,
  git, tryGit, exists, readJson, writeJson, mkdirp, real,
} from './util.mjs';

function repoInfo(cwd = process.cwd()) {
  const root = tryGit(cwd, 'rev-parse', '--show-toplevel');
  if (!root) return null;
  const common = real(path.resolve(root, git(root, 'rev-parse', '--git-common-dir')));
  return { root, common };
}

export function storeDir(client) {
  return path.join(STORES, client);
}

export function frontsFile(client) {
  return path.join(storeDir(client), 'openspec', 'standards', 'fronts.json');
}

export function registeredProject(cwd = process.cwd()) {
  const info = repoInfo(cwd);
  if (!info) return null;
  const client = (readJson(PROJECTS, {})[info.common] || {}).client || null;
  if (!client) return null;
  if (!exists(storeDir(client))) return null;
  return { info, client };
}

function identity(dir) {
  const email = tryGit(dir, 'config', 'user.email') || 'specboot@local';
  const name = tryGit(dir, 'config', 'user.name') || 'specboot';
  return ['-c', `user.email=${email}`, '-c', `user.name=${name}`];
}

export function commitClientStore(client, message) {
  const dir = storeDir(client);
  if (!exists(path.join(dir, '.git'))) {
    warn(`store at ${dir} is not a git repo; fronts.json written but not committed`);
    return false;
  }
  tryGit(dir, 'add', '-A');
  if (!tryGit(dir, 'status', '--porcelain')) return false;
  git(dir, ...identity(dir), 'commit', '-q', '-m', message);
  return true;
}

export function pushClientStore(client) {
  const dir = storeDir(client);
  const remote = tryGit(dir, 'remote', 'get-url', 'origin');
  if (!remote) {
    log(`no remote configured. To share: git -C ${dir} remote add origin <private-url> && specboot sync`);
    return false;
  }
  try {
    git(dir, 'push', '-q', '-u', 'origin', 'HEAD');
    ok('store pushed to origin');
    return true;
  } catch (e) {
    warn(`push failed: ${String(e.stderr || e.message).split('\n')[0]}`);
    return false;
  }
}

/** Pure merge of a fronts.json document with incoming front definitions. */
export function mergeFrontsDocument(cur, incoming, { replace = false } = {}) {
  const base = cur && typeof cur === 'object' ? cur : {};
  const add = incoming && typeof incoming === 'object' ? incoming : {};
  const nextFronts = replace ? { ...add } : { ...(base.fronts || {}), ...add };
  return {
    mode: base.mode || 'brownfield',
    fronts: {},
    documents: base.documents || [],
    ...base,
    fronts: nextFronts,
  };
}

/** Merge (default) or replace fronts into openspec/standards/fronts.json for the registered client. */
export function applyFrontsToStore(fronts, opts = {}) {
  const replace = !!(opts.replace || opts['replace-fronts']);
  const sync = !!opts.sync;
  const technology = opts.technology || 'preset';
  const message = opts.message || `fronts: apply ${technology}`;

  const ctx = registeredProject();
  if (!ctx) {
    die('cannot apply to the spec store: this repo is not registered. Run: specboot init <client> --existing --docs local --remote <url>\n  Then re-run with --apply');
  }
  const { client } = ctx;
  const file = frontsFile(client);
  mkdirp(path.dirname(file));
  const cur = readJson(file, null) || {};
  const incoming = fronts && typeof fronts === 'object' ? fronts : {};
  if (!Object.keys(incoming).length) die('nothing to apply: fronts object is empty');

  const next = mergeFrontsDocument(cur, incoming, { replace });
  writeJson(file, next);
  ok(`${replace ? 'replaced' : 'merged'} fronts into store ${file}`);
  for (const name of Object.keys(incoming)) {
    const f = nextFronts[name] || {};
    ok(`  store front ${name}: path=${f.path || '.'}; core=${(f.core || []).length}; topics=${(f.topics || []).length}`);
  }

  if (commitClientStore(client, message)) ok(`store committed (${client}): ${message}`);
  else ok('store already up to date (nothing new to commit)');

  if (sync) {
    // Local commit already done; push only (full rebase sync remains `specboot sync`).
    pushClientStore(client);
  } else {
    log('Store updated locally. Share with the team: specboot sync');
  }

  return { client, file, fronts: nextFronts, replaced: replace, synced: sync };
}

export function applyPresetFileToStore(presetPath, opts = {}) {
  const src = readJson(presetPath, null);
  if (!src || typeof src.fronts !== 'object') die(`invalid preset file: ${presetPath}`);
  const technology = opts.technology || path.basename(presetPath).replace(/^fronts\./, '').replace(/\.json$/, '');
  return applyFrontsToStore(src.fronts, { ...opts, technology });
}

export function applyFlagsFromArgs(flags = {}) {
  return {
    replace: !!(flags['replace-fronts'] || flags.replace),
    sync: !!flags.sync,
    message: flags.message,
  };
}

// Re-export parseArgs helper usage for callers that only need apply flag detection
export function wantsApply(flags = {}) {
  return !!(flags.apply || flags['apply-store']);
}
