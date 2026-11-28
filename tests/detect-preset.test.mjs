import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DETECT_PRESET_MAP,
  detectLabelMapping,
  preferDetectedTechs,
  planPresetFromDetect,
  formatPresetPlan,
} from '../lib/app.mjs';

describe('detect → preset mapping', () => {
  it('maps Go and React labels to preset ids', () => {
    assert.equal(detectLabelMapping('Go').tech, 'go');
    assert.equal(detectLabelMapping('React').tech, 'react');
    assert.equal(detectLabelMapping('LangGraph').pack, 'ai');
    assert.equal(detectLabelMapping('TypeScript').skip, true);
  });

  it('prefers FastAPI over weak Python and drops weak Node when React is present', () => {
    const preferred = preferDetectedTechs([
      { tech: 'python', weak: true, labels: ['Python'], dirs: ['.'] },
      { tech: 'fastapi', weak: false, labels: ['FastAPI'], dirs: ['api'] },
      { tech: 'react', weak: false, labels: ['React'], dirs: ['web'] },
      { tech: 'node', weak: true, labels: ['Node.js'], dirs: ['web'] },
    ]);
    const techs = preferred.map((p) => p.tech).sort();
    assert.deepEqual(techs, ['fastapi', 'react']);
  });

  it('keeps Express-backed Node with React', () => {
    const preferred = preferDetectedTechs([
      { tech: 'react', weak: false, labels: ['React'], dirs: ['frontend'] },
      { tech: 'node', weak: false, labels: ['Express'], dirs: ['backend'] },
    ]);
    assert.deepEqual(preferred.map((p) => p.tech).sort(), ['node', 'react']);
  });

  it('plans gaps for unmapped labels and skips tooling', () => {
    const plan = planPresetFromDetect([
      { tech: 'TypeScript', dirs: ['.'] },
      { tech: 'Docker', dirs: ['.'] },
      { tech: 'TotallyUnknownFramework', dirs: ['svc'] },
    ]);
    assert.equal(plan.stackTechs.length, 0);
    assert.ok(plan.skipped.some((s) => s.label === 'TypeScript'));
    assert.ok(plan.skipped.some((s) => s.label === 'Docker'));
    assert.ok(plan.gaps.some((g) => g.kind === 'unmapped' && g.label === 'TotallyUnknownFramework'));
    const text = formatPresetPlan(plan);
    assert.match(text, /Gaps/);
    assert.match(text, /TotallyUnknownFramework/);
  });

  it('exposes a mapping entry for every common detect label used in NODE/PY/TEXT rules', () => {
    const expected = [
      'React', 'Next.js', 'Angular', 'Vue', 'Svelte', 'Express', 'NestJS', 'Fastify',
      'TypeScript', 'Prisma', 'Jest', 'Vitest', 'Playwright', 'Cypress', 'Tailwind CSS',
      'React Native', 'Expo', 'FastAPI', 'Django', 'Flask', 'SQLAlchemy', 'Pydantic',
      'pytest', 'LangChain', 'LangGraph', 'pandas', 'Celery', 'Go', 'Gin', 'Echo', 'Fiber',
      'Spring Boot', 'Quarkus', 'Kotlin', 'Android', 'Rust', 'Actix', 'Axum', 'Tokio',
      'Laravel', 'Symfony', 'Rails', 'RSpec', 'Flutter', 'Docker', 'Docker Compose', 'Terraform',
      '.NET', 'JUnit', 'JVM (Gradle)', 'Java', 'Python', 'Node.js', 'PHP', 'Ruby', 'Dart',
    ];
    for (const label of expected) {
      assert.ok(DETECT_PRESET_MAP[label], `missing DETECT_PRESET_MAP entry for ${label}`);
    }
  });
});
