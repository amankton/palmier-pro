import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, utimes } from 'node:fs/promises';
import { assertLocalPath, assetPath, persistableProject } from '../desktop/host-policy.mjs';
import { readProject, writeProject } from '../desktop/project-store.mjs';
import { parseByteRange, mediaResponse } from '../desktop/media-response.mjs';

test('host rejects URLs, network shares, traversal and arbitrary extensions', () => {
  for (const input of ['https://example.com/media.mp4', '\\\\server\\share\\video.mp4', '//server/share/video.mp4', 'relative.mp4', 'a\0b']) assert.throws(() => assertLocalPath(input, ['mp4']));
  assert.throws(() => assertLocalPath(path.resolve('secrets.txt'), ['mp4']));
  if (process.platform === 'win32') assert.throws(() => assertLocalPath('C:\\video.mp4:secret.mp4', ['mp4']));
  const root = path.resolve('dist');
  assert.equal(assetPath(root, '/index.html'), path.join(root, 'index.html'));
  assert.throws(() => assetPath(root, '/../secret.txt'));
  assert.throws(() => assetPath(root, '/%2e%2e/secret.txt'));
  assert.throws(() => assetPath(root, '/bad%ZZ'));
  assert.throws(() => assetPath(root, '/%00file'));
});

test('project serialization removes session URLs without mutating editor state', () => {
  const input = { media: [{ id: 'one', path: 'clip.mp4', previewUrl: 'private-session', thumbnailUrl: 'another-session' }] };
  const clean = persistableProject(input);
  assert.deepEqual(clean.media, [{ id: 'one', path: 'clip.mp4' }]);
  assert.equal(input.media[0].previewUrl, 'private-session');
});

test('project file round trip, protected Save As and external-change detection', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'palmier-store-'));
  const target = path.join(folder, 'Client draft.palmierpc');
  const input = { format: 'palmier-windows', version: 1, name: 'Client draft', media: [] };
  const saved = await writeProject(target, input);
  const loaded = await readProject(target);
  assert.deepEqual(loaded.project, input);
  await assert.rejects(writeProject(target, { ...input, name: 'Overwrite' }), /already exists/);
  assert.deepEqual((await readProject(target)).project, input);
  const updated = await writeProject(target, { ...input, name: 'Revision' }, saved.stamp);
  assert.equal((await readProject(target)).project.name, 'Revision');
  await utimes(target, new Date(), new Date(Date.now() + 10000));
  await assert.rejects(writeProject(target, input, updated.stamp), /changed on disk/);
  assert.equal((await readProject(target)).project.name, 'Revision');
  assert.equal((await readFile(target, 'utf8')).includes('Revision'), true);
});

test('project reader rejects unexpected types and oversized files', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'palmier-read-'));
  await assert.rejects(readProject(path.join(folder, 'wrong.json')), /extension/);
  const target = path.join(folder, 'large.palmierpc');
  await writeFile(target, ' '.repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(readProject(target), /8 MB/);
});

test('simultaneous writes to the same project cannot both commit', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'palmier-save-lock-'));
  const target = path.join(folder, 'race.palmierpc');
  const input = { name: 'First', media: [] };
  const saved = await writeProject(target, input);
  const results = await Promise.allSettled([
    writeProject(target, { name: 'A', media: [] }, saved.stamp),
    writeProject(target, { name: 'B', media: [] }, saved.stamp),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /already being saved/);
});

test('media protocol byte ranges support seeking without loading entire files', async () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=95-', 100), { start: 95, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.throws(() => parseByteRange('bytes=100-', 100));
  assert.throws(() => parseByteRange('bytes=0-1,3-4', 100));
  assert.throws(() => parseByteRange('bytes=-0', 100));
  const folder = await mkdtemp(path.join(os.tmpdir(), 'palmier-range-'));
  const filePath = path.join(folder, 'media.mp4');
  await writeFile(filePath, Buffer.from(Array.from({ length: 100 }, (_, index) => index)));
  const range = await mediaResponse(filePath, new Request('https://local/media', { headers: { Range: 'bytes=10-19' } }));
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const head = await mediaResponse(filePath, new Request('https://local/media', { method: 'HEAD' }));
  assert.equal(head.headers.get('Content-Length'), '100');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const invalid = await mediaResponse(filePath, new Request('https://local/media', { headers: { Range: 'bytes=1000-' } }));
  assert.equal(invalid.status, 416);
});
