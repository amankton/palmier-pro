import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';

export const MEDIA_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'mts', 'm2ts', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'aif', 'aiff', 'png', 'jpg', 'jpeg', 'webp', 'bmp'];

export function assertLocalPath(value, extensions) {
  if (typeof value !== 'string' || !value || value.length > 32000 || /[\x00-\x1f]/.test(value)) throw new Error('Invalid local file path.');
  if (!path.isAbsolute(value) || /^[\\/]{2}/.test(value) || value.includes('://')) throw new Error('Choose a local file, not a network location or URL.');
  const rest = process.platform === 'win32' ? value.slice(2) : value;
  if (process.platform === 'win32' && (!/^[A-Za-z]:[\\/]/.test(value) || rest.includes(':'))) throw new Error('Device paths and alternate data streams are not supported.');
  const resolved = path.resolve(value);
  if (extensions && !extensions.includes(path.extname(resolved).slice(1).toLowerCase())) throw new Error('Unsupported file extension.');
  return resolved;
}

export async function existingMediaPath(value) {
  const selected = assertLocalPath(value, MEDIA_EXTENSIONS);
  const actual = assertLocalPath(await realpath(selected), MEDIA_EXTENSIONS);
  if (!(await stat(actual)).isFile()) throw new Error('Choose a regular media file.');
  return actual;
}

export function assetPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new Error('Invalid asset path.'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) throw new Error('Invalid asset path.');
  const target = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Asset path outside application.');
  return target;
}

export function persistableProject(project) {
  const copy = structuredClone(project);
  for (const media of copy.media) {
    delete media.previewUrl;
    delete media.thumbnailUrl;
  }
  return copy;
}
