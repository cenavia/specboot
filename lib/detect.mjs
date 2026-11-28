import fs from 'node:fs';
import path from 'node:path';
import { exists, read, readJson } from './util.mjs';

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

export { detectStack, candidateDirs, NODE_DEPS, PY_DEPS, TEXT_RULES, SKIP_DIRS };
