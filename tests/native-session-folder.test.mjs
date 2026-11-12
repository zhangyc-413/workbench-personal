// A new native session's default folder: the device folder alone, or the project's own native-sessions/<name> on that device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync, writeFileSync, readFileSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { prepareNativeSessionFolder, prepareIndependentNativeSessionFolder, sessionFolderName } = await import(pathToFileURL(join(root, 'src', 'folders.mjs')).href);

test('independent creation separates entries, preserves retry files and stays outside a bound project', async t => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wb-independent-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const projectRoot = join(base, 'project'); mkdirSync(projectRoot);
  const bindings = [{ localRoot: projectRoot }];
  const query = async (action, input) => {
    assert.equal(action, 'native_default_folder');
    return prepareNativeSessionFolder([base], base, input.bindings, input);
  };
  // Titles and client-requested project folders cannot determine a shared directory.
  const create = entryId => prepareIndependentNativeSessionFolder(query, { bindings, entryId, title: 'Same research', workspace: projectRoot });
  const [one, two] = await Promise.all([create('session-entry-0001'), create('session-entry-0002')]);
  assert.notEqual(one.path, two.path);
  assert.equal(dirname(one.path), join(base, 'native-sessions'));
  assert.equal(dirname(two.path), join(base, 'native-sessions'));
  assert.deepEqual(readdirSync(projectRoot), []);
  writeFileSync(join(one.path, 'notes.txt'), 'keep this research');
  assert.deepEqual(await create('session-entry-0001'), one);
  assert.equal(readFileSync(join(one.path, 'notes.txt'), 'utf8'), 'keep this research');
  assert.equal(readdirSync(join(base, 'native-sessions')).length, 2);
  await assert.rejects(prepareIndependentNativeSessionFolder(query, { bindings: [{ localRoot: base }], entryId: 'session-entry-0003' }), /overlaps a project/);
  await assert.rejects(create('../invalid'), /Invalid native catalog entry/);
});

test('independent creation rejects a symlinked container without writing through it', async t => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wb-independent-link-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const outside = join(base, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(base, 'native-sessions'));
  const query = (_, input) => prepareNativeSessionFolder([base], base, input.bindings, input);
  await assert.rejects(prepareIndependentNativeSessionFolder(query, { entryId: 'session-entry-0004' }), /not a regular directory/);
  assert.deepEqual(readdirSync(outside), []);
});

test('a project session folder is created under the project on this device, named after the session', async t => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wb-folder-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const projectRoot = join(base, 'tms-ai'); mkdirSync(projectRoot);
  const made = await prepareNativeSessionFolder([base], base, [{ localRoot: projectRoot }], { projectRoot, name: 'TMS agentscope' });
  assert.equal(made.path, join(projectRoot, 'native-sessions', 'TMS agentscope'));
  assert.ok(existsSync(made.path));
  // Without a project the device folder is used, and it must not touch a project folder.
  assert.equal((await prepareNativeSessionFolder([base], base, [{ localRoot: projectRoot }])).path, join(base, 'native-sessions'));
  await assert.rejects(prepareNativeSessionFolder([base], base, [{ localRoot: base }]), /overlaps a project/);
  // Outside the device's allowed roots is refused even for a project.
  await assert.rejects(prepareNativeSessionFolder([join(base, 'tms-ai')], base, [], { projectRoot: base, name: 'x' }));
});

test('session folder names are one safe path segment', () => {
  assert.equal(sessionFolderName('  a/b\\c: d?  '), 'a-b-c- d');
  assert.equal(sessionFolderName('..'), 'session');
  assert.equal(sessionFolderName(''), 'session');
  assert.equal(sessionFolderName('.hidden.'), 'hidden');
  assert.equal(sessionFolderName('x'.repeat(100)).length, 80);
});
