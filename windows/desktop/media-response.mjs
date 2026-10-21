import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp' };

export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) throw new Error('Unsatisfiable range.');
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Unsatisfiable range.');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new Error('Unsatisfiable range.');
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export async function mediaResponse(filePath, request) {
  const info = await stat(filePath);
  if (!info.isFile()) return new Response('Not found', { status: 404 });
  const headers = { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  let range;
  try { range = request.method === 'HEAD' ? null : parseByteRange(request.headers.get('range'), info.size); }
  catch { return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${info.size}` } }); }
  headers['Content-Length'] = String(range ? range.end - range.start + 1 : info.size);
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
  const body = request.method === 'HEAD' || info.size === 0 ? null : Readable.toWeb(createReadStream(filePath, range ?? {}));
  return new Response(body, { status: range ? 206 : 200, headers });
}
