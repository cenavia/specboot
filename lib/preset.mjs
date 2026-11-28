import fs from 'node:fs';
import path from 'node:path';
import {
  HARNESS, DATA_PRESETS, HARNESS_PRESETS, HARNESS_MANIFESTS, DEFAULT_FRONTS,
} from './paths.mjs';
import {
  log, ok, warn, die, exists, read, readJson, writeJson, mkdirp, parseArgs,
} from './util.mjs';
import { detectStack } from './detect.mjs';
import { listSources, skillCatalog } from './skills.mjs';
import { applyFrontsToStore, applyPresetFileToStore, wantsApply } from './store-fronts.mjs';


const PRESET_CORE_RE = /(^|-)(project-layout|project-structure|modules|idiomatic|code-style|style|testing|language-standard|quality-gates|naming|type-safety|new-project|architecture|templates)(-|$)|(^|-)(react|angular|vue)-core(-|$)/;
const PRESET_DEFAULT_CHECKS = {
  go: ['go vet ./...', 'go test ./...'],
  golang: ['go vet ./...', 'go test ./...'],
  python: ['ruff check .', 'ruff format --check .', 'mypy .', 'pytest'],
  fastapi: ['ruff check .', 'mypy .', 'pytest'],
  node: ['npm run lint', 'npm run test -- --run'],
  react: ['npm run lint', 'npm run typecheck', 'npm run test -- --run'],
  java: ['./gradlew test', './gradlew check'],
  springboot: ['./gradlew test', './gradlew check'],
};

// Default front name + folder when composing several technologies into one preset.
const TECH_ROLES = {
  go: { front: 'backend', path: 'backend' },
  golang: { front: 'backend', path: 'backend' },
  python: { front: 'backend', path: 'backend' },
  fastapi: { front: 'backend', path: 'backend' },
  java: { front: 'backend', path: 'backend' },
  springboot: { front: 'backend', path: 'backend' },
  node: { front: 'backend', path: 'backend' },
  react: { front: 'frontend', path: 'frontend' },
  angular: { front: 'frontend', path: 'frontend' },
  vue: { front: 'frontend', path: 'frontend' },
  'react-native': { front: 'mobile', path: 'mobile' },
  flutter: { front: 'mobile', path: 'mobile' },
};

function normTech(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '');
}

// Map detectStack() human labels → preset tech ids / topics-packs / skip.
// Prefer frameworks over languages when both appear (see preferDetectedTechs).
const DETECT_PRESET_MAP = {
  Go: { tech: 'go' },
  Gin: { tech: 'go' },
  Echo: { tech: 'go' },
  Fiber: { tech: 'go' },
  Python: { tech: 'python', weak: true },
  FastAPI: { tech: 'fastapi' },
  Django: { tech: 'python' },
  Flask: { tech: 'python' },
  Java: { tech: 'java', weak: true },
  'Spring Boot': { tech: 'java' },
  Quarkus: { tech: 'java' },
  Kotlin: { tech: 'java', weak: true },
  React: { tech: 'react' },
  'Next.js': { tech: 'react' },
  Angular: { tech: 'angular' },
  Vue: { tech: 'vue' },
  Svelte: { tech: 'svelte' },
  'React Native': { tech: 'react-native' },
  Expo: { tech: 'react-native' },
  Flutter: { tech: 'flutter' },
  'Node.js': { tech: 'node', weak: true },
  Express: { tech: 'node' },
  NestJS: { tech: 'node' },
  Fastify: { tech: 'node' },
  Rust: { tech: 'rust', weak: true },
  Actix: { tech: 'rust' },
  Axum: { tech: 'rust' },
  PHP: { tech: 'php', weak: true },
  Laravel: { tech: 'php' },
  Symfony: { tech: 'php' },
  Ruby: { tech: 'ruby', weak: true },
  Rails: { tech: 'ruby' },
  '.NET': { tech: 'dotnet' },
  Dart: { tech: 'flutter', weak: true },
  LangChain: { pack: 'ai' },
  LangGraph: { pack: 'ai' },
  TypeScript: { skip: true, reason: 'language tooling; covered by frontend/backend skills' },
  Prisma: { skip: true, reason: 'data library; no stack preset' },
  TypeORM: { skip: true, reason: 'data library; no stack preset' },
  SQLAlchemy: { skip: true, reason: 'data library; covered by python/fastapi skills' },
  Pydantic: { skip: true, reason: 'library; covered by python/fastapi skills' },
  pytest: { skip: true, reason: 'test runner; covered by python checks' },
  Jest: { skip: true, reason: 'test runner; covered by frontend/node checks' },
  Vitest: { skip: true, reason: 'test runner; covered by frontend checks' },
  Playwright: { skip: true, reason: 'E2E tool; use playwright skills when needed, not a stack preset' },
  Cypress: { skip: true, reason: 'E2E tool; not a stack preset' },
  'Tailwind CSS': { skip: true, reason: 'styling; covered by frontend skills' },
  Docker: { skip: true, reason: 'infrastructure; no stack preset' },
  'Docker Compose': { skip: true, reason: 'infrastructure; no stack preset' },
  Terraform: { skip: true, reason: 'infrastructure; no stack preset' },
  JUnit: { skip: true, reason: 'test framework; covered by java checks' },
  RSpec: { skip: true, reason: 'test framework; covered by ruby skills when present' },
  Tokio: { skip: true, reason: 'runtime; covered by rust skills when present' },
  Celery: { skip: true, reason: 'worker library; topic skill if you add one' },
  pandas: { skip: true, reason: 'library; not a stack preset' },
  Android: { skip: true, reason: 'platform; use a dedicated mobile preset if you have one' },
  'JVM (Gradle)': { skip: true, reason: 'build tool; prefer Spring Boot / Java detection' },
};

function detectLabelMapping(label) {
  return DETECT_PRESET_MAP[label] || null;
}

function techHasInstalledSkills(tech) {
  const t = normTech(tech);
  if (!t) return false;
  return skillsMatchingPrefix(`${t}-`, installedSkillNames()).length > 0;
}

function assessPresetTech(tech) {
  const t = normTech(tech);
  const manifest = findManifestForTech(t);
  if (manifest && isTopicsPack(manifest)) {
    return { tech: t, kind: 'pack', status: 'ok', how: 'manifest', manifest };
  }
  if (manifest) {
    const { fronts } = materializeFrontsFromManifest(manifest);
    const missing = missingSkillsInFronts(fronts);
    if (!missing.length) return { tech: manifest.technology || t, kind: 'stack', status: 'ok', how: 'manifest', manifest, fronts };
    if (techHasInstalledSkills(manifest.technology || t)) {
      return {
        tech: manifest.technology || t,
        kind: 'stack',
        status: 'partial',
        how: 'manifest',
        manifest,
        fronts,
        missing,
      };
    }
    return {
      tech: manifest.technology || t,
      kind: 'stack',
      status: 'missing-skills',
      how: 'manifest',
      manifest,
      missing,
      hint: `Manifest exists (${manifest.file}) but its skills are not installed. Fix: specboot source add <plugin> && specboot install\n  Or create/adapt the missing skills, then re-run.`,
    };
  }
  if (techHasInstalledSkills(t)) {
    return { tech: t, kind: 'stack', status: 'ok', how: 'heuristic' };
  }
  return {
    tech: t,
    kind: 'stack',
    status: 'missing-skills',
    how: 'none',
    missing: [],
    hint: `No preset manifest and no installed skills matching "${t}-*".\n  Options:\n    1) Search/install a plugin: specboot source add <path> && specboot install\n    2) Add presets/manifests/${t}.specboot.preset.json (or plugin specboot.preset.json)\n    3) Create skills named ${t}-* then: specboot preset create ${t} --heuristic`,
  };
}

function preferDetectedTechs(techEntries) {
  // techEntries: [{ tech, weak, labels: string[], dirs: string[] }]
  const byTech = new Map();
  for (const e of techEntries) {
    const t = normTech(e.tech);
    if (!byTech.has(t)) byTech.set(t, { tech: t, weak: !!e.weak, labels: [], dirs: new Set() });
    const cur = byTech.get(t);
    cur.weak = cur.weak && !!e.weak;
    for (const l of e.labels || []) cur.labels.push(l);
    for (const d of e.dirs || []) cur.dirs.add(d);
  }
  const drop = new Set();
  // Prefer frameworks over language-only (weak) detections.
  if (byTech.has('fastapi') && byTech.has('python') && byTech.get('python').weak) drop.add('python');
  if (byTech.has('flutter') && byTech.has('dart') && byTech.get('dart')?.weak) drop.add('dart');
  // Drop weak Node.js when another app stack is present; keep Express/Nest/Fastify (non-weak).
  if (byTech.has('node') && byTech.get('node').weak) {
    const others = [...byTech.keys()].filter((t) => t !== 'node');
    if (others.some((t) => ['react', 'angular', 'vue', 'svelte', 'go', 'python', 'fastapi', 'java', 'php', 'ruby', 'rust', 'flutter', 'react-native'].includes(t))) {
      drop.add('node');
    }
  }
  return [...byTech.values()]
    .filter((e) => !drop.has(e.tech))
    .map((e) => ({ ...e, dirs: [...e.dirs].sort(), labels: [...new Set(e.labels)] }));
}

/** Build a preset plan from detectStack() output. Pure regarding filesystem except skill/manifest lookup. */
function planPresetFromDetect(stack) {
  const skipped = [];
  const unmapped = [];
  const techEntries = [];
  const packLabels = new Map(); // pack -> labels

  for (const s of stack || []) {
    const mapping = detectLabelMapping(s.tech);
    if (!mapping) {
      unmapped.push({
        label: s.tech,
        dirs: s.dirs,
        hint: `No mapping from detected "${s.tech}" to a preset id. Add it to DETECT_PRESET_MAP or create skills/manifest for a chosen id, then re-run.`,
      });
      continue;
    }
    if (mapping.skip) {
      skipped.push({ label: s.tech, dirs: s.dirs, reason: mapping.reason || 'skipped' });
      continue;
    }
    if (mapping.pack) {
      if (!packLabels.has(mapping.pack)) packLabels.set(mapping.pack, []);
      packLabels.get(mapping.pack).push(s.tech);
      continue;
    }
    if (mapping.tech) {
      techEntries.push({
        tech: mapping.tech,
        weak: !!mapping.weak,
        labels: [s.tech],
        dirs: s.dirs || [],
      });
    }
  }

  const preferred = preferDetectedTechs(techEntries);
  const covered = [];
  const gaps = [];
  const stackTechs = [];

  for (const e of preferred) {
    const assessment = assessPresetTech(e.tech);
    if (assessment.status === 'ok' || assessment.status === 'partial') {
      stackTechs.push(assessment.tech);
      covered.push({
        tech: assessment.tech,
        labels: e.labels,
        dirs: e.dirs,
        how: assessment.how,
        status: assessment.status,
        missing: assessment.missing || [],
      });
      if (assessment.status === 'partial') {
        gaps.push({
          label: e.labels.join('/'),
          tech: assessment.tech,
          dirs: e.dirs,
          kind: 'partial-skills',
          missing: assessment.missing || [],
          hint: `Preset "${assessment.tech}" can be written but ${assessment.missing.length} declared skill(s) are missing: ${(assessment.missing || []).slice(0, 8).join(', ')}${(assessment.missing || []).length > 8 ? '…' : ''}.\n  Install them (source add + install) or re-run with --force to write anyway.`,
        });
      }
    } else {
      gaps.push({
        label: e.labels.join('/'),
        tech: assessment.tech,
        dirs: e.dirs,
        kind: 'missing-skills',
        missing: assessment.missing || [],
        hint: assessment.hint,
      });
    }
  }

  const packs = [];
  for (const [pack, labels] of packLabels) {
    const assessment = assessPresetTech(pack);
    if (assessment.status === 'ok' || assessment.status === 'partial') {
      packs.push(pack);
      covered.push({
        tech: pack,
        labels,
        dirs: [],
        how: assessment.how,
        status: assessment.status,
        kind: 'pack',
        missing: assessment.missing || [],
      });
    } else {
      gaps.push({
        label: labels.join('/'),
        tech: pack,
        dirs: [],
        kind: 'missing-pack',
        missing: assessment.missing || [],
        hint: assessment.hint || `Topics-pack "${pack}" is not available. Add a kind: topics-pack manifesto and install its skills.`,
      });
    }
  }

  for (const u of unmapped) {
    gaps.push({
      label: u.label,
      tech: null,
      dirs: u.dirs,
      kind: 'unmapped',
      missing: [],
      hint: u.hint,
    });
  }

  return { stackTechs: [...new Set(stackTechs)], packs: [...new Set(packs)], covered, gaps, skipped };
}

function formatPresetPlan(plan) {
  const lines = [];
  lines.push('\nPreset plan from detection:');
  if (plan.covered.length) {
    for (const c of plan.covered) {
      const via = c.how === 'manifest' ? 'manifest' : c.how === 'heuristic' ? 'heuristic skills' : c.how;
      const kind = c.kind === 'pack' ? 'topics-pack' : 'stack';
      lines.push(`  ok    ${c.tech} [${kind} via ${via}] ← ${c.labels.join(', ')}${c.dirs.length ? ` @ ${c.dirs.join(', ')}` : ''}`);
    }
  } else {
    lines.push('  (no stack/pack ready to write)');
  }
  if (plan.skipped.length) {
    lines.push('Skipped (informational):');
    for (const s of plan.skipped) {
      lines.push(`  skip  ${s.label}${s.dirs?.length ? ` @ ${s.dirs.join(', ')}` : ''} — ${s.reason}`);
    }
  }
  if (plan.gaps.length) {
    lines.push('Gaps (search or create skills / manifests as needed):');
    for (const g of plan.gaps) {
      lines.push(`  gap   ${g.label}${g.tech ? ` → ${g.tech}` : ''}${g.dirs?.length ? ` @ ${g.dirs.join(', ')}` : ''} [${g.kind}]`);
      for (const line of String(g.hint || '').split('\n')) lines.push(`        ${line}`);
    }
  }
  if (plan.stackTechs.length) {
    const packSuffix = plan.packs.length ? ` --topics-from ${plan.packs.join(',')}` : '';
    lines.push(`\nWould create: specboot preset create ${plan.stackTechs.join(',')}${packSuffix}`);
  }
  return lines.join('\n');
}

function createPresetFromDetect(stack, flags = {}) {
  const plan = planPresetFromDetect(stack);
  log(formatPresetPlan(plan));
  if (flags['dry-run']) {
    log('\nDry run: no preset written' + (wantsApply(flags) ? ' (and --apply skipped)' : '') + '.');
    return { plan, out: null, wrote: false, applied: null };
  }
  if (!plan.stackTechs.length) {
    die('nothing to create a preset from (no mapped stack with skills/manifest). See gaps above — install or create the missing skills, then re-run.');
  }
  const needsForce = plan.covered.some((c) => c.status === 'partial');
  if (needsForce && !flags.force) {
    die('some mapped stacks have missing declared skills (see gaps). Install them, or re-run with --force to write the preset anyway.');
  }
  const techInput = plan.stackTechs.join(',');
  const createFlags = {
    ...flags,
    'topics-from': flags['topics-from'] || (plan.packs.length ? plan.packs.join(',') : undefined),
    force: !!flags.force,
  };
  const result = runPresetCreate(techInput, createFlags);
  if (plan.gaps.some((g) => g.kind === 'missing-skills' || g.kind === 'unmapped' || g.kind === 'missing-pack')) {
    warn('Preset written for the covered stacks; remaining gaps still need skills/manifests before you can use those technologies.');
  }
  let applied = null;
  if (wantsApply(flags)) {
    applied = applyFrontsToStore(result.resolved.fronts, {
      technology: result.resolved.technology,
      replace: !!(flags['replace-fronts'] || flags.replace),
      sync: !!flags.sync,
      message: flags.message || `fronts: apply ${result.resolved.technology} from detect`,
    });
  } else {
    log('\nMachine preset only. To merge into this client\'s spec store: re-run with --apply');
    log('  (or: specboot preset apply <id>)');
  }
  return { plan, ...result, wrote: true, applied };
}

function parseTechList(input) {
  const parts = String(input || '').split(/[,+\s]+/).map(normTech).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function roleForTech(tech) {
  const t = normTech(tech);
  return TECH_ROLES[t] || { front: t, path: t };
}

function compositeTechnologyId(techs) {
  const rank = (t) => {
    const f = roleForTech(t).front;
    if (f === 'backend') return 0;
    if (f === 'frontend') return 1;
    if (f === 'mobile') return 2;
    return 3;
  };
  return [...techs].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join('-');
}

function applyCompositeRole(fronts, role) {
  const keys = Object.keys(fronts || {});
  if (keys.length === 1) {
    const only = fronts[keys[0]];
    return { [role.front]: { ...only, path: role.path } };
  }
  const out = {};
  for (const [name, f] of Object.entries(fronts || {})) {
    const path = f.path && f.path !== '.' ? f.path : (name === role.front ? role.path : name);
    out[name] = { ...f, path };
  }
  return out;
}

function mergeFrontsMaps(parts) {
  const merged = {};
  for (const { tech, fronts } of parts) {
    for (const [name, f] of Object.entries(fronts)) {
      if (!merged[name]) {
        merged[name] = f;
        continue;
      }
      // Auto-disambiguate (e.g. go+python+java all default to "backend").
      const altName = normTech(tech);
      const altPath = (!f.path || f.path === '.' || f.path === name) ? altName : `${f.path}-${altName}`;
      if (merged[altName]) {
        die(`front name collision: "${name}" and fallback "${altName}" already used while adding "${tech}". Rename fronts in the manifesto.`);
      }
      warn(`front "${name}" collision while adding "${tech}"; using "${altName}" (path ${altPath})`);
      merged[altName] = { ...f, path: altPath };
    }
  }
  return merged;
}

function isTopicsPack(manifest) {
  return !!manifest && (manifest.kind === 'topics-pack' || manifest.kind === 'topics');
}

function expandTopicsPack(manifest) {
  const installed = installedSkillNames();
  const topics = new Set();
  const prefixes = Array.isArray(manifest.topicPrefixes) ? manifest.topicPrefixes : [];
  for (const raw of prefixes) {
    const p = String(raw || '');
    if (!p) continue;
    for (const n of skillsMatchingPrefix(p.endsWith('-') ? p : `${p}-`, installed)) topics.add(n);
    // also allow exact prefix without forcing trailing dash when the pack listed "rag"
    for (const n of skillsMatchingPrefix(p, installed)) topics.add(n);
  }
  const listed = manifest.topics;
  if (listed === '*' || listed === 'all') {
    // only prefixes define membership for packs
  } else if (Array.isArray(listed)) {
    for (const n of listed) if (n && n !== '*' && n !== 'all') topics.add(n);
  }
  return [...topics].sort();
}

function pickAttachFront(fronts, attachTo) {
  const names = Object.keys(fronts || {});
  if (attachTo) {
    const key = String(attachTo);
    if (fronts[key]) return key;
    // Common mistake: pass a technology name (python) instead of a front (backend) from THIS stack.
    const role = roleForTech(key);
    if (fronts[role.front]) {
      warn(`--attach-to "${key}" is not a front; using front "${role.front}" (default role for ${key})`);
      return role.front;
    }
    const hint = names.includes('backend')
      ? ' For go+react+ai use --attach-to backend (or omit it).'
      : '';
    die(`cannot attach topics: front "${key}" not found. Available: ${names.join(', ') || '(none)'}.${hint}\n  --attach-to names a front in this preset, not a technology you left out of the stack.`);
  }
  const backendish = names.find((n) => n === 'backend' || n.startsWith('backend') || roleForTech(n).front === 'backend');
  if (backendish) return backendish;
  if (names.length === 1) return names[0];
  if (!names.length) die('cannot attach topics: preset has no fronts');
  die(`cannot attach topics: pass --attach-to <front>. Available: ${names.join(', ')}`);
}

function attachTopicsToFronts(fronts, topicNames, attachTo) {
  if (!topicNames.length) return { fronts, attached: null };
  const target = pickAttachFront(fronts, attachTo);
  const cur = fronts[target] || { path: target, core: [], topics: [], decisions: {}, checks: [] };
  const mergedTopics = [...new Set([...(cur.topics || []), ...topicNames])].sort();
  return {
    fronts: {
      ...fronts,
      [target]: { ...cur, topics: mergedTopics },
    },
    attached: target,
  };
}

function partitionStackAndPacks(techs) {
  const stacks = [];
  const packs = [];
  for (const tech of techs) {
    const m = findManifestForTech(tech);
    if (m && isTopicsPack(m)) packs.push({ tech, manifest: m });
    else stacks.push(tech);
  }
  return { stacks, packs };
}

function resolveTopicsFromFlag(flagValue) {
  if (!flagValue) return [];
  const packs = [];
  for (const tech of parseTechList(flagValue)) {
    const m = findManifestForTech(tech);
    if (!m) die(`topics pack "${tech}" not found. Add a specboot.preset.json with "kind": "topics-pack"`);
    if (!isTopicsPack(m)) die(`"${tech}" is not a topics-pack (kind=${m.kind || 'stack'}). Use it in the stack list, or set kind: topics-pack`);
    packs.push({ tech, manifest: m });
  }
  return packs;
}

function isPresetManifest(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  if (j.technology || j.tech) return true;
  if (j.fronts && typeof j.fronts === 'object') return true;
  return false;
}

function findFilesNamed(base, pred, depth = 5) {
  const out = [];
  const walk = (dir, d) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && pred(e.name, p)) out.push(p);
      else if (e.isDirectory() && d > 0 && !['node_modules', '.git', 'vendor', 'dist', 'build'].includes(e.name)) walk(p, d - 1);
    }
  };
  if (exists(base)) walk(base, depth);
  return out;
}

function loadPresetManifestFile(file) {
  const j = readJson(file, null);
  if (!isPresetManifest(j)) return null;
  const technology = normTech(j.technology || j.tech || path.basename(file).replace(/\.specboot\.preset\.json$/i, '').replace(/\.json$/i, ''));
  if (!technology) return null;
  const aliases = [...new Set([...(j.aliases || []), technology].map(normTech).filter(Boolean))];
  return { ...j, technology, aliases, file, skillPrefix: j.skillPrefix || `${technology}-` };
}

function discoverPresetManifests() {
  const files = new Set();
  for (const f of findFilesNamed(HARNESS_MANIFESTS, (n) => n.endsWith('.specboot.preset.json'), 2)) files.add(f);
  for (const src of listSources()) {
    for (const f of findFilesNamed(src, (n) => n === 'specboot.preset.json' || n.endsWith('.specboot.preset.json'), 4)) files.add(f);
  }
  const out = [];
  const seenTech = new Map();
  for (const file of [...files].sort()) {
    const m = loadPresetManifestFile(file);
    if (!m) continue;
    // First match for a technology wins (sources can override harness if listed first — prefer plugin over harness).
    if (seenTech.has(m.technology)) {
      const prev = seenTech.get(m.technology);
      const prevIsHarness = prev.file.startsWith(HARNESS + path.sep);
      const curIsHarness = m.file.startsWith(HARNESS + path.sep);
      if (prevIsHarness && !curIsHarness) {
        out[out.indexOf(prev)] = m;
        seenTech.set(m.technology, m);
      }
      continue;
    }
    seenTech.set(m.technology, m);
    out.push(m);
  }
  return out;
}

function findManifestForTech(tech) {
  const t = normTech(tech);
  if (!t) return null;
  return discoverPresetManifests().find((m) => m.aliases.includes(t) || m.technology === t) || null;
}

function installedSkillNames() {
  return new Set(skillCatalog().skills.map((s) => s.name));
}

function skillsMatchingPrefix(prefix, installed) {
  const p = String(prefix || '');
  return [...installed].filter((n) => n === normTech(p.replace(/-$/, '')) || n.startsWith(p)).sort();
}

function expandTopicList(topics, prefix, installed, core) {
  const coreSet = new Set(core);
  if (topics === '*' || topics === 'all') {
    return skillsMatchingPrefix(prefix, installed).filter((n) => !coreSet.has(n));
  }
  if (!Array.isArray(topics)) return [];
  return topics;
}

function heuristicPreset(tech, flags = {}) {
  const technology = normTech(tech);
  const prefix = `${technology}-`;
  const installed = installedSkillNames();
  const matched = skillsMatchingPrefix(prefix, installed);
  if (!matched.length) {
    die(`no installed skills match prefix "${prefix}". Register the plugin with: specboot source add <plugin-path> && specboot install`);
  }
  const core = matched.filter((n) => PRESET_CORE_RE.test(n)).slice(0, 5);
  const usedCore = core.length ? core : matched.slice(0, Math.min(3, matched.length));
  const topics = matched.filter((n) => !usedCore.includes(n));
  const role = roleForTech(technology);
  const front = String(flags.front || role.front);
  const frontPath = String(flags.path || (flags.composite ? role.path : '.'));
  const checks = PRESET_DEFAULT_CHECKS[technology] || [];
  return {
    technology,
    aliases: [technology],
    skillPrefix: prefix,
    source: 'heuristic',
    file: null,
    fronts: {
      [front]: {
        path: frontPath,
        core: usedCore,
        topics,
        decisions: {},
        checks,
      },
    },
  };
}

function materializeFrontsFromManifest(manifest, flags = {}) {
  const installed = installedSkillNames();
  const prefix = manifest.skillPrefix || `${manifest.technology}-`;
  let fronts;
  if (manifest.fronts && typeof manifest.fronts === 'object') {
    fronts = {};
    for (const [name, raw] of Object.entries(manifest.fronts)) {
      const core = [...(raw.core || [])];
      const topics = expandTopicList(raw.topics, raw.skillPrefix || prefix, installed, core);
      fronts[name] = {
        path: raw.path || '.',
        core,
        topics,
        decisions: raw.decisions || {},
        checks: Array.isArray(raw.checks) ? raw.checks : [],
      };
    }
  } else {
    const front = String(flags.front || manifest.front || 'backend');
    const core = [...(manifest.core || [])];
    const topics = expandTopicList(manifest.topics ?? '*', prefix, installed, core);
    fronts = {
      [front]: {
        path: String(flags.path || manifest.path || '.'),
        core,
        topics,
        decisions: manifest.decisions || {},
        checks: Array.isArray(manifest.checks) ? manifest.checks : (PRESET_DEFAULT_CHECKS[manifest.technology] || []),
      },
    };
  }
  return { fronts };
}

function missingSkillsInFronts(fronts) {
  const installed = installedSkillNames();
  const missing = [];
  for (const f of Object.values(fronts || {})) {
    for (const n of [...(f.core || []), ...(f.topics || [])]) {
      if (!installed.has(n) && !missing.includes(n)) missing.push(n);
    }
  }
  return missing;
}

function resolveStackFronts(tech, opts = {}) {
  const t = normTech(tech);
  if (!t) die('technology name required');
  let manifest;
  if (opts.preferHeuristic) {
    manifest = heuristicPreset(t, opts);
  } else {
    manifest = findManifestForTech(t);
    if (manifest && isTopicsPack(manifest) && !opts.allowTopicsPackAsStack) {
      die(`"${t}" is a topics-pack (skills attach to another front). Use: specboot preset create <stack> --topics-from ${t}\n  or include it in a composite list: create go,react,${t}`);
    }
    if (!manifest && opts.heuristic !== false) {
      if (opts.requireManifest) die(`no preset manifest for "${t}". Add specboot.preset.json to the plugin, or a file under presets/manifests/, or pass --heuristic`);
      warn(`no preset manifest for "${t}"; building a heuristic preset from installed "${t}-*" skills`);
      manifest = heuristicPreset(t, opts);
    } else if (!manifest) {
      die(`no preset manifest for "${t}"`);
    } else if (manifest.source !== 'heuristic') {
      ok(`preset manifest: ${manifest.file}${isTopicsPack(manifest) ? ' (topics-pack)' : ''}`);
    }
  }
  const src = materializeFrontsFromManifest(manifest, opts);
  const missing = missingSkillsInFronts(src.fronts);
  if (missing.length) {
    const msg = `${missing.length} skill(s) in the preset are not installed: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? `, and ${missing.length - 8} more` : ''}`;
    if (opts.force) warn(msg);
    else die(`${msg}\n  Fix: specboot source add <plugin> && specboot install\n  Or re-run with --force to write the preset anyway`);
  }
  return { technology: manifest.technology || t, manifest, fronts: src.fronts };
}

function applyTopicsPacks(fronts, packs, attachTo) {
  let next = fronts;
  for (const { tech, manifest } of packs) {
    ok(`topics pack: ${tech} (${manifest.file || 'manifest'})`);
    const topics = expandTopicsPack(manifest);
    if (!topics.length) warn(`topics pack "${tech}" expanded to 0 skills; check topicPrefixes / install`);
    // Explicit CLI --attach-to wins; otherwise pack attachTo; otherwise pickAttachFront default.
    const target = attachTo || manifest.attachTo || null;
    const { fronts: updated, attached } = attachTopicsToFronts(next, topics, target);
    next = updated;
    ok(`  → ${topics.length} topics attached to front "${attached}"`);
  }
  return next;
}

function resolveCompositeStack(techInput, opts = {}) {
  const techs = parseTechList(techInput);
  const fromFlag = resolveTopicsFromFlag(opts.topicsFrom || '');
  const partitioned = partitionStackAndPacks(techs);
  // Packs listed in the tech list + packs from --topics-from (dedupe by tech).
  const packByTech = new Map();
  for (const p of [...partitioned.packs, ...fromFlag]) packByTech.set(p.tech, p);
  const packs = [...packByTech.values()];
  const stacks = partitioned.stacks;

  if (!stacks.length) {
    die(`no stack technologies to build fronts from. topics-packs (${packs.map((p) => p.tech).join(', ') || 'none'}) must attach with --topics-from onto a stack (e.g. go,react --topics-from ai)`);
  }

  let fronts;
  let technology;
  let manifestMeta;

  if (stacks.length === 1) {
    const role = roleForTech(stacks[0]);
    const oneOpts = { ...opts };
    if (opts.composite || packs.length) {
      oneOpts.front = opts.front || role.front;
      oneOpts.path = opts.path || role.path;
      oneOpts.composite = true;
    }
    const one = resolveStackFronts(stacks[0], oneOpts);
    fronts = (opts.composite || packs.length) ? applyCompositeRole(one.fronts, role) : one.fronts;
    technology = one.technology;
    manifestMeta = one.manifest;
    if (packs.length) ok(`stack part: ${stacks[0]} → ${Object.keys(fronts).map((n) => `${n} (${fronts[n].path})`).join(', ')}`);
  } else {
    const parts = [];
    for (const tech of stacks) {
      const role = roleForTech(tech);
      // Prefer unique front/path from manifesto when present.
      const m = findManifestForTech(tech);
      const front = (m && m.front) || role.front;
      const frontPath = (m && m.path) || role.path;
      const one = resolveStackFronts(tech, {
        ...opts,
        front,
        path: frontPath,
        composite: true,
      });
      const remapped = applyCompositeRole(one.fronts, { front, path: frontPath });
      parts.push({ tech, fronts: remapped });
      ok(`stack part: ${tech} → ${Object.keys(remapped).map((n) => `${n} (${remapped[n].path})`).join(', ')}`);
    }
    fronts = mergeFrontsMaps(parts);
    technology = compositeTechnologyId(stacks);
    manifestMeta = { technology, source: 'composite', parts: stacks };
  }

  if (packs.length) {
    fronts = applyTopicsPacks(fronts, packs, opts.attachTo || null);
    const packIds = packs.map((p) => p.tech).sort().join('-');
    technology = `${technology}-with-${packIds}`;
    manifestMeta = { ...(manifestMeta || {}), technology, topicsPacks: packs.map((p) => p.tech) };
  }

  return { technology, manifest: manifestMeta, fronts, stacks, packs: packs.map((p) => p.tech) };
}

function writePresetFronts(technology, fronts, flags = {}) {
  const payload = { fronts };
  const out = flags.out
    ? path.resolve(String(flags.out))
    : path.join(DATA_PRESETS, `fronts.${technology}.json`);
  writeJson(out, payload);
  ok(`wrote ${out}`);
  if (flags.default) {
    writeJson(DEFAULT_FRONTS, payload);
    ok(`also set machine default: ${DEFAULT_FRONTS}`);
  }
  // Convenience copy into the harness-style name under data, already done.
  return out;
}

function generatedPresetPath(techInput, topicsFrom = '') {
  const raw = String(techInput || '').trim();
  const techs = parseTechList(raw);
  const directName = normTech(raw);
  const directFile = path.join(DATA_PRESETS, `fronts.${directName}.json`);
  // Prefer an already-generated id (e.g. go-react-with-ai) when the user passes that exact name.
  if (raw && !/[,+\s]/.test(raw) && exists(directFile)) {
    return { technology: directName, file: directFile };
  }
  const { stacks, packs } = partitionStackAndPacks(techs);
  const packTechs = [...new Set([...packs.map((p) => p.tech), ...parseTechList(topicsFrom)])].sort();
  if (!stacks.length) {
    const t = techs[0] || directName;
    const m = findManifestForTech(t);
    const technology = (m && m.technology) || t;
    return { technology, file: path.join(DATA_PRESETS, `fronts.${technology}.json`) };
  }
  let technology = stacks.length === 1
    ? ((findManifestForTech(stacks[0]) && findManifestForTech(stacks[0]).technology) || stacks[0])
    : compositeTechnologyId(stacks);
  if (packTechs.length) technology = `${technology}-with-${packTechs.join('-')}`;
  return { technology, file: path.join(DATA_PRESETS, `fronts.${technology}.json`) };
}

function runPresetCreate(techInput, flags) {
  const techs = parseTechList(techInput);
  const { stacks } = partitionStackAndPacks(techs);
  if ((stacks.length > 1 || flags['topics-from'] || partitionStackAndPacks(techs).packs.length) && (flags.front || flags.path)) {
    warn('--front / --path ignored for multi-tech / topics-pack presets; use manifesto front/path or --attach-to');
  }
  const resolved = resolveCompositeStack(techInput, {
    front: stacks.length === 1 && !flags['topics-from'] && !partitionStackAndPacks(techs).packs.length ? flags.front : undefined,
    path: stacks.length === 1 && !flags['topics-from'] && !partitionStackAndPacks(techs).packs.length ? flags.path : undefined,
    force: !!flags.force,
    heuristic: true,
    preferHeuristic: !!flags.heuristic,
    composite: stacks.length > 1 || !!flags['topics-from'] || partitionStackAndPacks(techs).packs.length > 0,
    topicsFrom: flags['topics-from'],
    attachTo: flags['attach-to'],
  });
  const out = writePresetFronts(resolved.technology, resolved.fronts, flags);
  for (const [name, f] of Object.entries(resolved.fronts)) {
    ok(`front ${name}: path=${f.path || '.'}; core=${(f.core || []).length}; topics=${(f.topics || []).length}; checks=${(f.checks || []).length}`);
  }
  const stackHint = (resolved.stacks || stacks).join(',');
  const packSuffix = (resolved.packs || []).length ? `,${(resolved.packs || []).join(',')}` : '';
  let applied = null;
  if (wantsApply(flags)) {
    applied = applyFrontsToStore(resolved.fronts, {
      technology: resolved.technology,
      replace: !!(flags['replace-fronts'] || flags.replace),
      sync: !!flags.sync,
      message: flags.message || `fronts: apply ${resolved.technology}`,
    });
  } else {
    log(`\nNext: specboot init <client> --fronts ${out}`);
    log(`  or:  specboot init <client> --stack ${stackHint}${packSuffix}`);
    log(`  or:  specboot preset apply ${resolved.technology}   # merge into registered store`);
  }
  return { out, resolved, applied };
}

function cmdPreset(args) {
  const { pos, flags } = parseArgs(args);
  const [action, ...techParts] = pos;
  const techInput = techParts.join(',');
  const usage = [
    'usage: specboot preset list',
    '       specboot preset show <id|tech[,tech...]> [--resolve] [--topics-from <pack>] [--attach-to <front>]',
    '       specboot preset create|update <tech[,tech...]> [--topics-from <pack>] [--attach-to <front>] [--out <file>] [--default] [--front <name>] [--path <dir>] [--heuristic] [--force] [--apply] [--replace-fronts] [--sync]',
    '       specboot preset create --from-detect [--dry-run] [--force] [--apply] [--replace-fronts] [--sync]',
    '       specboot preset apply <id|tech[,tech...]> [--replace-fronts] [--sync] [--topics-from <pack>]',
    '       specboot preset apply --from-detect [--force] [--replace-fronts] [--sync]',
    '       specboot preset attach <id> --topics-from <pack> [--attach-to <front>]',
    '       specboot preset remove <id|tech[,tech...]> [--default] [--topics-from <pack>]',
    'examples: create go | create --from-detect --apply | apply go-react | apply --from-detect',
  ].join('\n');
  if (!action || action === 'help' || action === '--help') die(usage);

  if (action === 'list') {
    const manifests = discoverPresetManifests();
    const generated = exists(DATA_PRESETS)
      ? fs.readdirSync(DATA_PRESETS).filter((n) => n.startsWith('fronts.') && n.endsWith('.json'))
      : [];
    const shipped = exists(HARNESS_PRESETS)
      ? fs.readdirSync(HARNESS_PRESETS).filter((n) => n.startsWith('fronts.') && n.endsWith('.json'))
      : [];
    if (!manifests.length && !generated.length && !shipped.length) {
      log('No presets yet. Add a specboot.preset.json to a skill plugin, or run: specboot preset create <tech> --heuristic');
      return;
    }
    if (manifests.length) {
      log('Manifests (plugin or harness):');
      for (const m of manifests) {
        const kind = isTopicsPack(m) ? 'topics-pack' : 'stack';
        const extra = isTopicsPack(m) && m.attachTo ? `; attachTo=${m.attachTo}` : '';
        log(`  ${m.technology} [${kind}${extra}]${m.aliases.length > 1 ? ` (aliases: ${m.aliases.filter((a) => a !== m.technology).join(', ')})` : ''}`);
        log(`    ${m.file}`);
      }
    }
    if (shipped.length) {
      log('Shipped fronts examples (presets/):');
      for (const n of shipped.sort()) log(`  ${path.join(HARNESS_PRESETS, n)}`);
    }
    if (generated.length) {
      log(`Generated under ${DATA_PRESETS}:`);
      for (const n of generated.sort()) log(`  ${path.join(DATA_PRESETS, n)}`);
    }
    if (exists(DEFAULT_FRONTS)) log(`Machine default: ${DEFAULT_FRONTS}`);
    return;
  }

  if (action === 'show') {
    if (!techInput) die(usage);
    if (flags.resolve) {
      const techs = parseTechList(techInput);
      const resolved = resolveCompositeStack(techInput, {
        front: techs.length === 1 ? flags.front : undefined,
        path: techs.length === 1 ? flags.path : undefined,
        heuristic: !!flags.heuristic || undefined,
        preferHeuristic: !!flags.heuristic,
        force: true,
        topicsFrom: flags['topics-from'],
        attachTo: flags['attach-to'],
        composite: true,
      });
      log(JSON.stringify({ technology: resolved.technology, fronts: resolved.fronts }, null, 2));
      return;
    }
    const { technology, file } = generatedPresetPath(techInput, flags['topics-from']);
    if (!exists(file)) {
      die(`no generated preset for "${technology}" at ${file}\n  Create: specboot preset create ${techInput || technology}\n  Preview: specboot preset show ${techInput || technology} --resolve`);
    }
    const src = readJson(file, null);
    if (!src || typeof src.fronts !== 'object') die(`invalid preset file: ${file}`);
    log(JSON.stringify({ technology, file, fronts: src.fronts }, null, 2));
    return;
  }

  if (action === 'apply') {
    if (flags['from-detect'] || flags.detect) {
      // Create machine preset from detection, then always apply to the store.
      createPresetFromDetect(detectStack(process.cwd()), { ...flags, apply: true });
      return;
    }
    if (!techInput) die(usage);
    const { technology, file } = generatedPresetPath(techInput, flags['topics-from']);
    if (!exists(file)) {
      die(`no generated preset for "${technology}" at ${file}\n  Create: specboot preset create ${techInput || technology}`);
    }
    applyPresetFileToStore(file, {
      technology,
      replace: !!(flags['replace-fronts'] || flags.replace),
      sync: !!flags.sync,
      message: flags.message || `fronts: apply ${technology}`,
    });
    return;
  }

  if (action === 'create' || action === 'update') {
    if (flags['from-detect'] || flags.detect) {
      if (action === 'update') die('update does not support --from-detect; use: specboot preset create --from-detect');
      createPresetFromDetect(detectStack(process.cwd()), flags);
      return;
    }
    if (!techInput) die(usage);
    if (action === 'update') {
      const { file } = generatedPresetPath(techInput, flags['topics-from']);
      if (!exists(file) && !flags.force) {
        die(`no generated preset to update at ${file}. Use create first, or pass --force to create`);
      }
    }
    runPresetCreate(techInput, flags);
    return;
  }

  if (action === 'attach') {
    if (!techInput) die(usage);
    if (!flags['topics-from']) die('attach requires --topics-from <pack[,pack...]>');
    const { technology, file } = generatedPresetPath(techInput);
    if (!exists(file)) die(`no generated preset at ${file}. create it first`);
    const src = readJson(file, null);
    if (!src || typeof src.fronts !== 'object') die(`invalid preset file: ${file}`);
    const packs = resolveTopicsFromFlag(flags['topics-from']);
    const fronts = applyTopicsPacks(src.fronts, packs, flags['attach-to'] || null);
    const missing = missingSkillsInFronts(fronts);
    if (missing.length && !flags.force) {
      die(`${missing.length} skill(s) missing after attach. install them or pass --force`);
    }
    if (missing.length) warn(`${missing.length} skill(s) missing; writing anyway (--force)`);
    const packIds = packs.map((p) => p.tech).sort().join('-');
    const newId = technology.includes('-with-') ? technology : `${technology}-with-${packIds}`;
    const out = flags.out ? path.resolve(String(flags.out)) : path.join(DATA_PRESETS, `fronts.${newId}.json`);
    writeJson(out, { fronts });
    ok(`wrote ${out}`);
    if (newId !== technology && out === path.join(DATA_PRESETS, `fronts.${newId}.json`) && file !== out && exists(file)) {
      ok(`previous file kept: ${file} (remove with: specboot preset remove ${technology})`);
    }
    for (const [name, f] of Object.entries(fronts)) {
      ok(`front ${name}: path=${f.path || '.'}; core=${(f.core || []).length}; topics=${(f.topics || []).length}; checks=${(f.checks || []).length}`);
    }
    return;
  }

  if (action === 'remove' || action === 'rm' || action === 'delete') {
    if (!techInput) die(usage);
    const { technology, file } = generatedPresetPath(techInput, flags['topics-from']);
    let removed = 0;
    if (exists(file)) {
      fs.unlinkSync(file);
      ok(`removed ${file}`);
      removed++;
    } else {
      warn(`no generated preset at ${file}`);
    }
    if (flags.default) {
      if (exists(DEFAULT_FRONTS)) {
        fs.unlinkSync(DEFAULT_FRONTS);
        ok(`removed machine default ${DEFAULT_FRONTS}`);
        removed++;
      } else {
        warn(`no machine default at ${DEFAULT_FRONTS}`);
      }
    }
    if (!removed) {
      die(`nothing to remove for "${technology}". create one with: specboot preset create ${technology}`);
    }
    log('Note: plugin/harness manifests and project openspec/standards/fronts.json are not deleted.');
    return;
  }

  die(usage);
}

export {
  DETECT_PRESET_MAP,
  detectLabelMapping,
  preferDetectedTechs,
  planPresetFromDetect,
  formatPresetPlan,
  createPresetFromDetect,
  parseTechList,
  normTech,
  runPresetCreate,
  cmdPreset,
  discoverPresetManifests,
  findManifestForTech,
  resolveCompositeStack,
  writePresetFronts,
  generatedPresetPath,
  missingSkillsInFronts,
  materializeFrontsFromManifest,
  heuristicPreset,
  TECH_ROLES,
  PRESET_DEFAULT_CHECKS,
};
