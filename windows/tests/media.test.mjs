import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createProject, appendMedia, trimClip, moveClip, splitClip } from '../core/project.mjs';
import { discoverTools, probeMedia, createThumbnail, renderProject } from '../media/ffmpeg.mjs';

let tools;
let directory;
let red;
let blue;
let tone;
let still;
let changing;
let delayedAudio;
let delayedVideo;
let widePixels;

function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    let errors = '';
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(-12000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(errors)));
  });
}
const ffmpeg = (args) => command(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args]);

before(async () => {
  tools = await discoverTools();
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'palmier media test '));
  const redPath = path.join(directory, 'red with audio.mp4');
  const bluePath = path.join(directory, 'blue silent.mp4');
  const tonePath = path.join(directory, 'mono music 44100.wav');
  const imagePath = path.join(directory, 'yellow still.png');
  const changingPath = path.join(directory, 'red then blue.mp4');
  const delayedAudioPath = path.join(directory, 'source audio starts late.mp4');
  const delayedVideoPath = path.join(directory, 'source picture starts late.mp4');
  const widePixelsPath = path.join(directory, 'non square pixels.mp4');
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', redPath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-an', bluePath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100:duration=1', '-c:a', 'pcm_s16le', tonePath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=yellow:s=160x90', '-frames:v', '1', '-threads', '1', imagePath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', changingPath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=2', '-itsoffset', '1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', delayedAudioPath]);
  await ffmpeg(['-itsoffset', '1', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-map', '0:v:0', '-map', '1:a:0', '-fps_mode', 'passthrough', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', delayedVideoPath]);
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-vf', 'setsar=2', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-an', widePixelsPath]);
  [red, blue, tone, still, changing] = await Promise.all([redPath, bluePath, tonePath, imagePath, changingPath].map((file) => probeMedia(file, tools)));
  [delayedAudio, delayedVideo, widePixels] = await Promise.all([delayedAudioPath, delayedVideoPath, widePixelsPath].map((file) => probeMedia(file, tools)));
});

after(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function projectWith(...assets) {
  const project = createProject('Render test');
  project.timeline.width = 160;
  project.timeline.height = 90;
  project.media = assets.map((asset) => ({ ...asset }));
  return project;
}

async function pixel(file, seconds) {
  const bytes = await ffmpeg(['-ss', String(seconds), '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  assert.equal(bytes.length, 3);
  return [...bytes];
}

async function pixelAt(file, seconds, x, y) {
  const bytes = await ffmpeg(['-ss', String(seconds), '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  assert.equal(bytes.length, 3);
  return [...bytes];
}

async function rms(file, seconds, duration = 0.15) {
  const bytes = await ffmpeg(['-ss', String(seconds), '-i', file, '-t', String(duration), '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1']);
  let square = 0;
  for (let offset = 0; offset < bytes.length - 1; offset += 2) square += (bytes.readInt16LE(offset) / 32768) ** 2;
  return Math.sqrt(square / (bytes.length / 2));
}

async function audioSamples(file, start, duration) {
  const bytes = await ffmpeg([...(start === undefined ? [] : ['-ss', String(start)]), '-i', file,
    ...(duration === undefined ? [] : ['-t', String(duration)]), '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1']);
  return Array.from({ length: bytes.length / 2 }, (_, index) => bytes.readInt16LE(index * 2) / 32768);
}

function frequencyAmplitude(samples, frequency) {
  let cosine = 0;
  let sine = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const phase = 2 * Math.PI * frequency * index / 48000;
    cosine += samples[index] * Math.cos(phase);
    sine += samples[index] * Math.sin(phase);
  }
  return 2 * Math.hypot(cosine, sine) / samples.length;
}

test('discovers actual tools, probes video/audio/image metadata and thumbnails paths with spaces', async () => {
  assert.match(tools.version, /^ffmpeg version/u);
  assert.equal(red.type, 'video');
  assert.equal(red.hasAudio, true);
  assert.equal(blue.hasAudio, false);
  assert.equal(tone.type, 'audio');
  assert.equal(tone.width, 0);
  assert.equal(still.type, 'image');
  assert.equal(still.duration, 5);
  assert.equal(red.width, 160);
  assert.equal(red.height, 90);
  assert.ok(Math.abs(red.duration - 1) < 0.1);
  const thumbnail = await createThumbnail(red, path.join(directory, 'thumbnail with spaces.jpg'), tools);
  const metadata = await probeMedia(thumbnail, tools);
  assert.equal(metadata.type, 'image');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 270);
  await assert.rejects(createThumbnail(tone, path.join(directory, 'bad.jpg'), tools), /video and still images/);
});

test('exports mixed native video audio, silent video, a black gap and delayed resampled audio', async () => {
  let project = projectWith(red, blue, tone);
  project = appendMedia(project, red.id);
  project = appendMedia(project, blue.id);
  const blueId = project.timeline.tracks[0].clips[1].id;
  project = moveClip(project, blueId, 45);
  project = appendMedia(project, tone.id);
  const toneId = project.timeline.tracks[1].clips[0].id;
  project = moveClip(project, toneId, 60);
  const progress = [];
  const output = await renderProject(project, path.join(directory, 'mixed output.mp4'), { tools, onProgress: (value) => progress.push(value) });
  assert.equal(output.duration, 3);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => value >= 0 && value <= 1 && (index === 0 || value >= progress[index - 1])));
  const meta = await probeMedia(output.path, tools);
  assert.ok(Math.abs(meta.duration - 3) < 0.1);
  const redPixel = await pixel(output.path, 0.5);
  assert.ok(redPixel[0] > 180 && redPixel[2] < 30, `${redPixel}`);
  const gapPixel = await pixel(output.path, 1.2);
  assert.ok(gapPixel.every((channel) => channel < 10), `${gapPixel}`);
  const bluePixel = await pixel(output.path, 1.7);
  assert.ok(bluePixel[2] > 180 && bluePixel[0] < 30, `${bluePixel}`);
  assert.ok((await pixel(output.path, 2.7)).every((channel) => channel < 10));
  assert.ok(await rms(output.path, 0.4) > 0.03, 'native audio was retained');
  assert.ok(await rms(output.path, 1.2) < 0.003, 'picture gap remains silent before music');
  assert.ok(await rms(output.path, 1.7) < 0.003, 'silent video is not assigned another clip audio');
  assert.ok(await rms(output.path, 2.3) > 0.03, '44.1 kHz mono audio is mixed at its timeline position');
  assert.ok(await rms(output.path, 2.85, 0.12) > 0.03, 'audio drains through the end of the last picture frame');
  const decoded = await audioSamples(output.path);
  assert.ok(Math.abs(decoded.length - 3 * 48000) <= 1024, `decoded audio length: ${decoded.length}`);
  assert.ok(frequencyAmplitude(await audioSamples(output.path, 0.3, 0.2), 440) > 0.05, 'native source pitch is preserved');
  assert.ok(frequencyAmplitude(await audioSamples(output.path, 2.3, 0.2), 1000) > 0.05, 'resampling preserves music pitch');
});

test('overlapping native and separate audio mix both frequencies without changing pitch', async () => {
  let project = appendMedia(appendMedia(projectWith(red, tone), red.id), tone.id);
  project.timeline.tracks[0].clips[0].volume = 0.25;
  project.timeline.tracks[1].clips[0].volume = 0.5;
  const output = await renderProject(project, path.join(directory, 'overlapping audio mix.mp4'), { tools });
  const samples = await audioSamples(output.path, 0.3, 0.4);
  const native = frequencyAmplitude(samples, 440);
  const music = frequencyAmplitude(samples, 1000);
  assert.ok(native > 0.015 && native < 0.03, `native frequency amplitude ${native}`);
  assert.ok(music > 0.03 && music < 0.06, `music frequency amplitude ${music}`);
  assert.ok(music / native > 1.7 && music / native < 2.3, 'individual clip volumes are retained in the mix');
  assert.ok(frequencyAmplitude(samples, 700) < 0.002);
  const metadata = JSON.parse((await command(tools.ffprobePath, ['-v', 'error', '-show_streams', '-of', 'json', output.path])).toString());
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
  assert.equal(video.codec_name, 'h264');
  assert.equal(Number(video.nb_frames), 30);
  assert.equal(audio.codec_name, 'aac');
  assert.equal(Number(audio.sample_rate), 48000);
  assert.equal(audio.channels, 2);
  assert.ok(Math.abs(Number(audio.duration) - 1) < 0.03);
});

test('source trimming and splitting render the correct frame range', async () => {
  let project = appendMedia(projectWith(changing), changing.id);
  const id = project.timeline.tracks[0].clips[0].id;
  project = trimClip(project, id, { trimStartFrame: 30, durationFrames: 30 });
  project = splitClip(project, id, 15);
  const output = await renderProject(project, path.join(directory, 'trim split.mp4'), { tools });
  for (const seconds of [0.2, 0.7]) {
    const sample = await pixel(output.path, seconds);
    assert.ok(sample[2] > 180 && sample[0] < 30, `trimmed frame at ${seconds}: ${sample}`);
  }
  assert.equal(output.duration, 1);
});

test('late source audio retains its offset before and after source trims', async () => {
  const metadata = JSON.parse((await command(tools.ffprobePath, ['-v', 'error', '-show_streams', '-of', 'json', delayedAudio.path])).toString());
  assert.ok(Number(metadata.streams.find((stream) => stream.codec_type === 'audio').start_time) > 0.9);
  const original = appendMedia(projectWith(delayedAudio), delayedAudio.id);
  const clipId = original.timeline.tracks[0].clips[0].id;
  const full = await renderProject(original, path.join(directory, 'delayed audio full.mp4'), { tools });
  assert.ok(await rms(full.path, 0.2, 0.5) < 0.001, 'audio must not move to picture start');
  assert.ok(await rms(full.path, 1.2, 0.3) > 0.03, 'audio must start at its original source time');
  const across = trimClip(original, clipId, { trimStartFrame: 15, durationFrames: 30 });
  const acrossOutput = await renderProject(across, path.join(directory, 'delayed audio across offset.mp4'), { tools });
  assert.ok(await rms(acrossOutput.path, 0.1, 0.2) < 0.001);
  assert.ok(await rms(acrossOutput.path, 0.65, 0.2) > 0.03);
  const afterOffset = trimClip(original, clipId, { trimStartFrame: 36, durationFrames: 18 });
  const afterOutput = await renderProject(afterOffset, path.join(directory, 'delayed audio after offset.mp4'), { tools });
  assert.ok(await rms(afterOutput.path, 0.1, 0.2) > 0.03);
  const beforeOffset = trimClip(original, clipId, { trimStartFrame: 3, durationFrames: 9 });
  const beforeOutput = await renderProject(beforeOffset, path.join(directory, 'delayed audio before offset.mp4'), { tools });
  assert.ok(await rms(beforeOutput.path, 0, 0.25) < 0.001);
});

test('late source picture retains black leading frames without moving native audio', async () => {
  const metadata = JSON.parse((await command(tools.ffprobePath, ['-v', 'error', '-show_streams', '-of', 'json', delayedVideo.path])).toString());
  assert.ok(Number(metadata.streams.find((stream) => stream.codec_type === 'video').start_time) > 0.9);
  assert.ok(Math.abs(delayedVideo.duration - 2) < 0.1);
  const original = appendMedia(projectWith(delayedVideo), delayedVideo.id);
  const clipId = original.timeline.tracks[0].clips[0].id;
  const full = await renderProject(original, path.join(directory, 'delayed picture full.mp4'), { tools });
  assert.ok((await pixel(full.path, 0.25)).every((value) => value < 10));
  assert.ok((await pixel(full.path, 1.25))[0] > 180);
  assert.ok(await rms(full.path, 0.25) > 0.03);
  const across = trimClip(original, clipId, { trimStartFrame: 15, durationFrames: 30 });
  const acrossOutput = await renderProject(across, path.join(directory, 'delayed picture across offset.mp4'), { tools });
  assert.ok((await pixel(acrossOutput.path, 0.2)).every((value) => value < 10));
  assert.ok((await pixel(acrossOutput.path, 0.7))[0] > 180);
  assert.ok(await rms(acrossOutput.path, 0.1, 0.2) > 0.03);
  const afterOffset = trimClip(original, clipId, { trimStartFrame: 36, durationFrames: 18 });
  const afterOutput = await renderProject(afterOffset, path.join(directory, 'delayed picture after offset.mp4'), { tools });
  assert.ok((await pixel(afterOutput.path, 0.2))[0] > 180);
  assert.ok(await rms(afterOutput.path, 0.1, 0.2) > 0.03);
  const beforeOffset = trimClip(original, clipId, { trimStartFrame: 3, durationFrames: 9 });
  const beforeOutput = await renderProject(beforeOffset, path.join(directory, 'delayed picture before offset.mp4'), { tools });
  assert.ok((await pixel(beforeOutput.path, 0.1)).every((value) => value < 10));
  assert.ok(await rms(beforeOutput.path, 0.05, 0.2) > 0.03);
});

test('non-square source pixels preserve display aspect in export and thumbnails', async () => {
  const original = appendMedia(projectWith(widePixels), widePixels.id);
  const output = await renderProject(original, path.join(directory, 'correct display aspect.mp4'), { tools });
  assert.ok((await pixelAt(output.path, 0.3, 80, 5)).every((value) => value < 10), 'wide footage must letterbox instead of stretching');
  assert.ok((await pixelAt(output.path, 0.3, 80, 45))[0] > 180);
  const thumbnail = await createThumbnail(widePixels, path.join(directory, 'wide source thumbnail.png'), tools);
  assert.ok((await pixelAt(thumbnail, 0, 240, 10)).every((value) => value < 10));
  assert.ok((await pixelAt(thumbnail, 0, 240, 135))[0] > 180);
});

test('still images, native audio mute and clip volume work on the actual export', async () => {
  let project = appendMedia(projectWith(still, red, tone), still.id);
  project = trimClip(project, project.timeline.tracks[0].clips[0].id, { trimStartFrame: 0, durationFrames: 30 });
  project = appendMedia(project, tone.id);
  project.timeline.tracks[1].clips[0].volume = 0.25;
  const output = await renderProject(project, path.join(directory, 'image and quiet music.mp4'), { tools });
  const sample = await pixel(output.path, 0.5);
  assert.ok(sample[0] > 180 && sample[1] > 180 && sample[2] < 30, `${sample}`);
  const quiet = await rms(output.path, 0.3);
  assert.ok(quiet > 0.008 && quiet < 0.04, `${quiet}`);
  let muted = appendMedia(projectWith(red), red.id);
  muted.timeline.tracks[0].muted = true;
  const silent = await renderProject(muted, path.join(directory, 'muted native audio.mp4'), { tools });
  assert.ok(await rms(silent.path, 0.3) < 0.001);
});

test('audio-only projects render black picture and include sound', async () => {
  const project = appendMedia(projectWith(tone), tone.id);
  const output = await renderProject(project, path.join(directory, 'audio only.mp4'), { tools });
  assert.ok((await pixel(output.path, 0.3)).every((value) => value < 10));
  assert.ok(await rms(output.path, 0.3) > 0.03);
});

test('literal percent image filenames do not become image-sequence patterns', async () => {
  const literal = path.join(directory, 'still %03d.png');
  await fs.copyFile(still.path, literal);
  const asset = await probeMedia(literal, tools);
  let project = appendMedia(projectWith(asset), asset.id);
  project = trimClip(project, project.timeline.tracks[0].clips[0].id, { trimStartFrame: 0, durationFrames: 3 });
  const output = await renderProject(project, path.join(directory, 'literal percent.mp4'), { tools });
  assert.equal(output.duration, 0.1);
  assert.ok((await pixel(output.path, 0)).slice(0, 2).every((value) => value > 180));
});

test('rejects unsupported paths, effects, empty timelines, changed sources and output overwrites', async () => {
  for (const location of ['https://example.com/video.mp4', '\\\\server\\share\\video.mp4', 'relative.mp4', 'file:///tmp/video.mp4']) await assert.rejects(probeMedia(location, tools), /local file path/);
  const project = appendMedia(projectWith(red), red.id);
  await assert.rejects(renderProject(project, red.path, { tools }), /already exists|source media/);
  const existing = path.join(directory, 'existing.mp4');
  await fs.writeFile(existing, 'keep this');
  await assert.rejects(renderProject(project, existing, { tools }), /already exists/);
  assert.equal(await fs.readFile(existing, 'utf8'), 'keep this');
  await assert.rejects(renderProject(projectWith(), path.join(directory, 'empty.mp4'), { tools }), /at least one clip/);
  const unsupported = structuredClone(project);
  unsupported.timeline.tracks[0].clips[0].effects = [{ type: 'blur' }];
  await assert.rejects(renderProject(unsupported, path.join(directory, 'effect.mp4'), { tools }), /unsupported field/);
  const changed = structuredClone(project);
  changed.media[0].path = blue.path;
  await assert.rejects(renderProject(changed, path.join(directory, 'changed.mp4'), { tools }), /Source media changed/);
  const wrongExtension = path.join(directory, 'not media.mp4');
  await fs.writeFile(wrongExtension, '#EXTM3U\nhttps://example.com/private\n');
  await assert.rejects(probeMedia(wrongExtension, tools));
});

test('cancellation leaves no export or partial directory and preserves source bytes', async () => {
  const beforeHash = createHash('sha256').update(await fs.readFile(still.path)).digest('hex');
  let project = appendMedia(projectWith(still), still.id);
  project.timeline.width = 1920;
  project.timeline.height = 1080;
  project = trimClip(project, project.timeline.tracks[0].clips[0].id, { trimStartFrame: 0, durationFrames: 900 });
  const controller = new AbortController();
  const output = path.join(directory, 'cancelled export.mp4');
  let timer;
  await assert.rejects(renderProject(project, output, { tools, signal: controller.signal, onProgress(value) {
    if (value === 0 && !timer) timer = setTimeout(() => controller.abort(), 150);
  } }), (error) => error.name === 'AbortError');
  clearTimeout(timer);
  await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  assert.equal(createHash('sha256').update(await fs.readFile(still.path)).digest('hex'), beforeHash);
  assert.equal((await fs.readdir(directory)).filter((name) => name.startsWith('.palmier-render-')).length, 0);
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(renderProject(project, output, { tools, signal: alreadyCancelled.signal }), (error) => error.name === 'AbortError');
});
