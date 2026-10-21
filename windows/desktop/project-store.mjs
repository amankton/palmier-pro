import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { assertLocalPath, persistableProject } from './host-policy.mjs';

const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
const saving = new Set();

export async function readProject(filePath) {
  const target = assertLocalPath(filePath, ['palmierpc']);
  const info = await stat(target);
  if (!info.isFile() || info.size > MAX_PROJECT_BYTES) throw new Error('Project must be a .palmierpc file smaller than 8 MB.');
  return { project: JSON.parse(await readFile(target, 'utf8')), stamp: info.mtimeMs };
}

export async function writeProject(filePath, project, expectedStamp) {
  const key = assertLocalPath(filePath, ['palmierpc']).toLowerCase();
  if (saving.has(key)) throw new Error('This project is already being saved. Wait for the current save.');
  saving.add(key);
  try { return await writeProjectUnlocked(filePath, project, expectedStamp); }
  finally { saving.delete(key); }
}

async function writeProjectUnlocked(filePath, project, expectedStamp) {
  const target = assertLocalPath(filePath, ['palmierpc']);
  const text = JSON.stringify(persistableProject(project), null, 2) + '\n';
  if (Buffer.byteLength(text) > MAX_PROJECT_BYTES) throw new Error('Project exceeds the 8 MB size limit.');
  let current;
  try { current = await stat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current && expectedStamp === undefined) throw new Error('File already exists. Choose a new project filename.');
  if (current && current.mtimeMs !== expectedStamp) throw new Error('Project changed on disk. Use Save As to preserve the other changes.');
  if (!current && expectedStamp !== undefined) throw new Error('Project was moved or removed. Use Save As to choose its new location.');
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let owned = false;
  try {
    const handle = await open(temp, 'wx');
    owned = true;
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    if (current) {
      const latest = await stat(target);
      if (latest.mtimeMs !== expectedStamp) throw new Error('Project changed during save. Use Save As.');
      await rename(temp, target);
      owned = false;
    } else {
      const { link } = await import('node:fs/promises');
      await link(temp, target);
    }
    return { path: target, stamp: (await stat(target)).mtimeMs };
  } finally {
    if (owned) await unlink(temp).catch(() => {});
  }
}
