import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  HARNESS, DATA, GENERATED, SOURCES, EFFICIENCY_SKILLS,
} from './paths.mjs';
import {
  log, ok, warn, die, exists, read, readJson, writeJson, mkdirp, real, parseArgs,
} from './util.mjs';

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


export {
  sha, VALID_NAME, skillName, findSkillDirs, listSources, skillCatalog, skillSources, cmdSource,
};
