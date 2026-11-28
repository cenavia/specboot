import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeFrontsDocument } from '../lib/store-fronts.mjs';

describe('mergeFrontsDocument', () => {
  it('merges fronts and preserves mode/docs/planning/documents', () => {
    const cur = {
      mode: 'brownfield',
      docs: { placement: 'local' },
      planning: { skills: ['specboot-plan'], output: 'docs/planning' },
      documents: [{ file: 'docs/architecture/x.md' }],
      skillsPin: { go: 'abc' },
      fronts: {
        backend: { path: 'old-api', core: ['go-testing'], topics: [], checks: [] },
      },
    };
    const next = mergeFrontsDocument(cur, {
      backend: { path: 'backend', core: ['go-project-layout'], topics: [], checks: [] },
      frontend: { path: 'frontend', core: ['react-core'], topics: [], checks: [] },
    });
    assert.equal(next.mode, 'brownfield');
    assert.equal(next.docs.placement, 'local');
    assert.deepEqual(next.planning.skills, ['specboot-plan']);
    assert.equal(next.documents[0].file, 'docs/architecture/x.md');
    assert.equal(next.skillsPin.go, 'abc');
    assert.equal(next.fronts.backend.path, 'backend');
    assert.equal(next.fronts.frontend.path, 'frontend');
  });

  it('replace drops previous fronts not in the incoming set', () => {
    const cur = {
      mode: 'greenfield',
      docs: { placement: 'client' },
      fronts: {
        backend: { path: 'api' },
        legacy: { path: 'legacy' },
      },
    };
    const next = mergeFrontsDocument(cur, { frontend: { path: 'web' } }, { replace: true });
    assert.equal(next.mode, 'greenfield');
    assert.equal(next.docs.placement, 'client');
    assert.equal(next.fronts.frontend.path, 'web');
    assert.equal(next.fronts.backend, undefined);
    assert.equal(next.fronts.legacy, undefined);
  });
});
