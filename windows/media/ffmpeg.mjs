import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateProject, totalFrames } from '../core/project.mjs';

const MAX_ERROR = 12_000;
const MAX_STDOUT = 2_000_000;
const FORMATS = 'mov,matroska,webm,avi,mpeg,mpegts,wav,mp3,flac,ogg,aac,aiff,image2,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe';
const INPUT_GUARDS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', FORMATS];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi', '.mpeg', '.mpg', '.mts', '.m2ts', '.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.aif', '.aiff']);

function aborted() {
  const error = new Error('Render cancelled. Source media and existing exports were not changed.');
  error.name = 'AbortError';
  return error;
}

function checkSignal(signal) {
  if (signal?.aborted) throw aborted();
}

function localPath(value, label = 'Media path') {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f]/u.test(value) || !path.isAbsolute(value) || /^[\\/]{2}/u.test(value) || /^(?:[a-z][a-z0-9+.-]*):/iu.test(value.replace(/^[a-z]:[\\/]/iu, ''))) {
    throw new Error(`${label} must be an absolute local file path. URLs, UNC/network paths and device paths are not supported.`);
  }
  if (process.platform === 'win32' && value.slice(2).includes(':')) throw new Error(`${label} cannot use an alternate data stream.`);
  return path.normalize(value);
}

async function existingLocalFile(value) {
  const normalized = localPath(value);
  const actual = localPath(await fs.realpath(normalized));
  if (!(await fs.stat(actual)).isFile()) throw new Error('Choose a regular local media file, not a directory or device.');
  return actual;
}

function run(executable, args, { signal, timeout = 0, onStdout } = {}) {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { reject(error); return; }
    let stdout = '';
    let stderr = '';
    let failure;
    let stopped = false;
    const stop = (error) => {
      failure ??= error;
      if (!stopped) { stopped = true; child.kill('SIGKILL'); }
    };
    const onAbort = () => stop(aborted());
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const timer = timeout ? setTimeout(() => stop(new Error(`Media tool timed out after ${Math.round(timeout / 1000)} seconds.`)), timeout) : undefined;
    child.stdout.on('data', (buffer) => {
      const chunk = buffer.toString();
      if (onStdout) {
        try { onStdout(chunk); } catch (error) { stop(error); }
      } else {
        stdout += chunk;
        if (stdout.length > MAX_STDOUT) stop(new Error('Media tool returned too much metadata.'));
      }
    });
    child.stderr.on('data', (buffer) => { stderr = (stderr + buffer.toString()).slice(-MAX_ERROR); });
    child.once('error', (error) => { failure ??= new Error(`Could not start ${path.basename(executable)}: ${error.message}`); });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${path.basename(executable)} failed (exit ${code}). ${stderr.trim() || 'No diagnostic output.'}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function locateTool(explicit, name) {
  const candidates = explicit ? [explicit] : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((directory) => path.join(directory.replace(/^"|"$/gu, ''), process.platform === 'win32' ? `${name}.exe` : name));
  for (const candidate of candidates) {
    try {
      const resolved = await existingLocalFile(path.resolve(candidate));
      const { stdout } = await run(resolved, ['-version'], { timeout: 10_000 });
      if (!stdout.startsWith(`${name} version `)) throw new Error(`The selected executable is not ${name}.`);
      return { path: resolved, version: stdout.split(/\r?\n/u)[0] };
    } catch (error) {
      if (explicit) throw new Error(`Cannot use ${name}: ${error.message}`);
    }
  }
  throw new Error(`${name} was not found on PATH. Install FFmpeg including ffprobe, or set PALMIER_${name.toUpperCase()}_PATH to its executable.`);
}

export async function discoverTools({ ffmpegPath, ffprobePath } = {}) {
  const [ffmpeg, ffprobe] = await Promise.all([
    locateTool(ffmpegPath ?? process.env.PALMIER_FFMPEG_PATH, 'ffmpeg'),
    locateTool(ffprobePath ?? process.env.PALMIER_FFPROBE_PATH, 'ffprobe'),
  ]);
  return { ffmpegPath: ffmpeg.path, ffprobePath: ffprobe.path, version: ffmpeg.version };
}

async function probe(filePath, tools, signal, withTiming = false) {
  const actual = await existingLocalFile(filePath);
  if (!MEDIA_EXTENSIONS.has(path.extname(actual).toLowerCase())) throw new Error('Unsupported media extension. Use a local MP4/MOV/MKV/WebM/AVI, WAV/MP3/FLAC/AAC/Ogg, or PNG/JPEG/WebP/BMP file.');
  const image = IMAGE_EXTENSIONS.has(path.extname(actual).toLowerCase());
  const { stdout } = await run(tools.ffprobePath, ['-v', 'error', ...INPUT_GUARDS, ...(image ? ['-f', 'image2', '-pattern_type', 'none'] : []), '-show_format', '-show_streams', '-of', 'json', actual], { timeout: 30_000, signal });
  let info;
  try { info = JSON.parse(stdout); } catch { throw new Error('ffprobe returned invalid metadata.'); }
  const streams = Array.isArray(info.streams) ? info.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (image && (!video || !/(?:image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe)/u.test(info.format?.format_name ?? ''))) throw new Error('The selected still-image file is not a supported static image.');
  if (!video && !audio) throw new Error('The file has no usable video or audio stream.');
  if (video && streams.find((stream) => stream.codec_type === 'video') !== video) throw new Error('Video files with preceding embedded cover-art streams are not supported in this alpha.');
  const type = image ? 'image' : video ? 'video' : 'audio';
  const duration = image ? 5 : [info.format?.duration, video?.duration, audio?.duration].map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (!Number.isFinite(duration) || duration > 86400) throw new Error('Media needs a known duration of at most 24 hours. Live/indefinite streams are not supported.');
  let width = video ? Number(video.width) : 0;
  let height = video ? Number(video.height) : 0;
  if (video && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65536 || height > 65536)) throw new Error('The media has invalid or unsupported picture dimensions.');
  const rotation = Number(video?.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const asset = { id: globalThis.crypto.randomUUID(), name: path.basename(actual), path: actual, type, duration, width, height, hasAudio: !image && Boolean(audio) };
  if (!withTiming) return asset;
  const origin = Number(info.format?.start_time ?? 0);
  const pictureStart = Number(video?.start_time ?? origin);
  if (!Number.isFinite(origin) || !Number.isFinite(pictureStart)) throw new Error('The media has unsupported stream timestamps. Normalize the file timestamps before importing it.');
  return { asset, pictureDelay: Math.max(0, pictureStart - origin) };
}

export async function probeMedia(filePath, tools) {
  return probe(filePath, tools ?? await discoverTools());
}

async function prepareOutput(outputPath, extension) {
  const normalized = localPath(outputPath, 'Output path');
  if (!extension.includes(path.extname(normalized).toLowerCase())) throw new Error(`Output must use ${extension.join(' or ')}.`);
  const parent = localPath(await fs.realpath(path.dirname(normalized)), 'Output directory');
  if (!(await fs.stat(parent)).isDirectory()) throw new Error('Output parent must be a local directory.');
  const target = path.join(parent, path.basename(normalized));
  try {
    await fs.lstat(target);
    throw new Error('Output already exists. Choose a new filename; existing files and source media are never overwritten.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { parent, target };
}

async function publish(source, target) {
  try {
    await fs.link(source, target);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Output was created by another process. Choose a new filename; it was not overwritten.');
    throw new Error(`Could not safely publish the output without overwriting files. Use a local filesystem that supports hard links. ${error.message}`);
  }
}

export async function createThumbnail(asset, outputPath, tools) {
  if (!asset || !['video', 'image'].includes(asset.type)) throw new Error('Thumbnails are available for video and still images only.');
  tools ??= await discoverTools();
  const source = await probe(asset.path, tools);
  if (!['video', 'image'].includes(source.type)) throw new Error('The source is not picture media.');
  const { parent, target } = await prepareOutput(outputPath, ['.jpg', '.jpeg', '.png']);
  const directory = await fs.mkdtemp(path.join(parent, '.palmier-thumb-'));
  try {
    const temporary = path.join(directory, `thumbnail${path.extname(target)}`);
    await run(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...INPUT_GUARDS,
      ...(source.type === 'video' ? ['-ss', String(Math.min(0.5, source.duration / 4))] : ['-f', 'image2', '-pattern_type', 'none']), '-i', source.path,
      '-map', '0:v:0', '-an', '-frames:v', '1', '-vf', fitPicture(480, 270),
      '-threads', '1', '-y', temporary], { timeout: 30_000 });
    await publish(temporary, target);
    return target;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

const decimal = (number) => number.toFixed(9).replace(/\.?0+$/u, '') || '0';
const fitPicture = (width, height) => `scale=w='max(2,trunc(min(${width},${height}*dar)/2)*2)':h='max(2,trunc(min(${height},${width}/dar)/2)*2)':flags=lanczos,setsar=1,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;

export async function renderProject(project, outputPath, { tools, signal, onProgress } = {}) {
  const copy = validateProject(project);
  const frames = totalFrames(copy);
  if (!frames) throw new Error('Add at least one clip before rendering the timeline.');
  checkSignal(signal);
  const allClips = copy.timeline.tracks.flatMap((track) => track.clips);
  if (allClips.length > 64) throw new Error('This alpha renders at most 64 clips per timeline. Split the project into smaller sequences.');
  tools ??= await discoverTools();
  const { fps, width, height, tracks } = copy.timeline;
  const duration = frames / fps;
  const { parent, target } = await prepareOutput(outputPath, ['.mp4']);
  const usedIds = new Set(allClips.map((clip) => clip.mediaRef));
  const assets = new Map();
  const pictureDelays = new Map();
  for (const asset of copy.media.filter((item) => usedIds.has(item.id))) {
    checkSignal(signal);
    const { asset: fresh, pictureDelay } = await probe(asset.path, tools, signal, true);
    if (fresh.type !== asset.type || fresh.hasAudio !== asset.hasAudio) throw new Error(`Source media changed: ${asset.name}. Reimport the file before rendering.`);
    if (path.normalize(fresh.path).toLowerCase() === path.normalize(target).toLowerCase()) throw new Error('An export cannot replace source media.');
    assets.set(asset.id, fresh);
    pictureDelays.set(asset.id, pictureDelay);
  }
  for (const clip of allClips) {
    const asset = assets.get(clip.mediaRef);
    if (asset.type !== 'image' && clip.trimStartFrame + clip.durationFrames > Math.max(1, Math.round(asset.duration * fps))) throw new Error(`Source duration changed for ${asset.name}. Reimport the file or shorten the clip.`);
  }
  const directory = await fs.mkdtemp(path.join(parent, '.palmier-render-'));
  try {
    checkSignal(signal);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-filter_complex_threads', '2'];
    const filters = [];
    const audioLabels = [];
    const inputByClip = new Map();
    const inputTrimByClip = new Map();
    let inputCount = 0;
    const inputFor = (clip) => {
      if (inputByClip.has(clip.id)) return inputByClip.get(clip.id);
      const asset = assets.get(clip.mediaRef);
      args.push(...INPUT_GUARDS, '-threads', '2');
      const trimSeconds = clip.trimStartFrame / fps;
      const canSeek = asset.type !== 'image' && trimSeconds > 0 && trimSeconds >= pictureDelays.get(clip.mediaRef);
      const filterTrim = canSeek ? 0 : trimSeconds;
      if (asset.type === 'image') args.push('-f', 'image2', '-pattern_type', 'none', '-loop', '1', '-framerate', String(fps));
      else if (canSeek) args.push('-ss', decimal(trimSeconds));
      args.push('-t', decimal(filterTrim + clip.durationFrames / fps), '-i', asset.path);
      const index = inputCount++;
      inputByClip.set(clip.id, index);
      inputTrimByClip.set(clip.id, filterTrim);
      return index;
    };
    const addAudio = (clip) => {
      const input = inputFor(clip);
      const label = `a${audioLabels.length}`;
      const seconds = decimal(clip.durationFrames / fps);
      const trim = inputTrimByClip.get(clip.id);
      filters.push(`[${input}:a:0]atrim=start=${decimal(trim)}:end=${decimal(trim + clip.durationFrames / fps)},asetpts=PTS-${decimal(trim)}/TB,aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${decimal(clip.volume)},apad=whole_dur=${seconds},atrim=duration=${seconds},adelay=${Math.round(clip.startFrame * 48000 / fps)}S:all=1[${label}]`);
      audioLabels.push(label);
    };
    const pictureTrack = tracks.find((track) => track.type === 'video');
    const videoLabels = [];
    let cursor = 0;
    const addBlack = (count) => {
      if (!count) return;
      const label = `v${videoLabels.length}`;
      filters.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${decimal(count / fps)},trim=end_frame=${count},setpts=PTS-STARTPTS[${label}]`);
      videoLabels.push(label);
    };
    for (const clip of pictureTrack.clips) {
      addBlack(clip.startFrame - cursor);
      const asset = assets.get(clip.mediaRef);
      if (pictureTrack.hidden) addBlack(clip.durationFrames);
      else {
        const leadingFrames = Math.min(clip.durationFrames, Math.max(0, Math.round(pictureDelays.get(clip.mediaRef) * fps) - clip.trimStartFrame));
        addBlack(leadingFrames);
        const pictureFrames = clip.durationFrames - leadingFrames;
        if (pictureFrames) {
          const input = inputFor(clip);
          const label = `v${videoLabels.length}`;
          filters.push(`[${input}:v:0]trim=start=${decimal(inputTrimByClip.get(clip.id))},setpts=PTS-STARTPTS,fps=${fps},${fitPicture(width, height)},format=yuv420p,tpad=stop_mode=clone:stop_duration=${decimal(pictureFrames / fps)},trim=end_frame=${pictureFrames},setpts=PTS-STARTPTS[${label}]`);
          videoLabels.push(label);
        }
      }
      if (asset.hasAudio && !pictureTrack.muted && clip.volume > 0) addAudio(clip);
      cursor = clip.startFrame + clip.durationFrames;
    }
    addBlack(frames - cursor);
    filters.push(`${videoLabels.map((label) => `[${label}]`).join('')}concat=n=${videoLabels.length}:v=1:a=0,fps=${fps},trim=end_frame=${frames}[vout]`);
    const audioTrack = tracks.find((track) => track.type === 'audio');
    if (!audioTrack.muted && !audioTrack.hidden) for (const clip of audioTrack.clips) if (clip.volume > 0) addAudio(clip);
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${decimal(duration)}[silence]`);
    filters.push(`[silence]${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1,atrim=duration=${decimal(duration)},asetpts=PTS-STARTPTS[aout]`);
    const filterFile = path.join(directory, 'filters.txt');
    const temporary = path.join(directory, 'render.mp4');
    await fs.writeFile(filterFile, filters.join(';\n'), 'utf8');
    args.push('-filter_complex_script', filterFile, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-threads', '2', '-r', String(fps), '-frames:v', String(frames), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-t', decimal(duration), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', temporary);
    if (args.reduce((size, arg) => size + arg.length + 3, tools.ffmpegPath.length) > 28000) throw new Error('The input paths exceed the Windows command-line limit. Use shorter local media paths or fewer clips.');
    let pending = '';
    let lastProgress = 0;
    const progress = (value) => {
      const next = Math.max(lastProgress, Math.min(1, value));
      lastProgress = next;
      try { onProgress?.(next); } catch { /* A detached progress observer must not invalidate an export. */ }
    };
    progress(0);
    await run(tools.ffmpegPath, args, { signal, onStdout(chunk) {
      pending += chunk;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop().slice(-8192);
      for (const line of lines) {
        if (line.startsWith('out_time_us=')) {
          const elapsed = Number(line.slice('out_time_us='.length));
          if (Number.isFinite(elapsed)) progress(Math.min(0.99, elapsed / 1_000_000 / duration));
        }
      }
    } });
    checkSignal(signal);
    const output = await probe(temporary, tools, signal);
    if (output.type !== 'video' || !output.hasAudio || output.width !== width || output.height !== height || Math.abs(output.duration - duration) > Math.max(0.1, 2 / fps)) throw new Error('Rendered media did not pass duration/dimension/audio verification. No export was published.');
    checkSignal(signal);
    await publish(temporary, target);
    progress(1);
    return { path: target, duration, width, height };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
