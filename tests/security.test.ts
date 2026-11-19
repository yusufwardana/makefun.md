import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isWithinWorkspace } from '../server/security.ts';

test('workspace boundary allows children and rejects adjacent folders and parent paths', () => {
  const root = path.resolve('workspace');
  assert.equal(isWithinWorkspace(root, root), true);
  assert.equal(isWithinWorkspace(root, path.join(root, 'evidence')), true);
  assert.equal(isWithinWorkspace(root, root + '-other'), false);
  assert.equal(isWithinWorkspace(root, path.dirname(root)), false);
});
