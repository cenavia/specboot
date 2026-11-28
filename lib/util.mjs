import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { IS_WIN } from './paths.mjs';

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
      else if (['remote', 'message', 'fronts', 'front', 'docs', 'stack', 'out', 'path', 'topics-from', 'attach-to'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}


export {
  log, ok, warn, bad, die,
  run, tryRun, git, tryGit,
  exists, read, mkdirp, lstat, real, readJson, writeJson,
  linkDir, upsertBlock, removeBlock, parseArgs,
};
