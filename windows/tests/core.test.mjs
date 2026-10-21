import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, totalFrames, appendMedia, splitClip, trimClip, moveClip, deleteClip } from '../core/project.mjs';

function fixture() {
  const project = createProject('Frame tests');
  project.media.push({ id: 'video', name: 'example.mp4', path: 'C:\\Media\\example.mp4', type: 'video', duration: 10, width: 640, height: 360, hasAudio: true });
  project.media.push({ id: 'audio', name: 'music.wav', path: 'C:\\Media\\music.wav', type: 'audio', duration: 2, width: 0, height: 0, hasAudio: true });
  project.media.push({ id: 'image', name: 'still.png', path: 'C:\\Media\\still.png', type: 'image', duration: 5, width: 640, height: 360, hasAudio: false });
  return project;
}

test('new projects and validated copies have independent nested state', () => {
  const first = createProject();
  const second = createProject();
  assert.notEqual(first.id, second.id);
  assert.equal(totalFrames(first), 0);
  const copy = validateProject(first);
  copy.timeline.width = 640;
  assert.equal(first.timeline.width, 1920);
  assert.equal(second.timeline.tracks[0].clips.length, 0);
});

test('append chooses tracks, computes project frames and leaves source immutable', () => {
  const source = fixture();
  const before = JSON.stringify(source);
  let project = appendMedia(source, 'video');
  project = appendMedia(project, 'image');
  project = appendMedia(project, 'audio');
  assert.equal(JSON.stringify(source), before);
  assert.equal(project.timeline.tracks[0].clips[0].durationFrames, 300);
  assert.equal(project.timeline.tracks[0].clips[1].startFrame, 300);
  assert.equal(project.timeline.tracks[0].clips[1].durationFrames, 150);
  assert.equal(project.timeline.tracks[1].clips[0].startFrame, 0);
  assert.equal(totalFrames(project), 450);
  assert.throws(() => appendMedia(project, 'audio', 'video-1'), /matching/);
  assert.throws(() => appendMedia(project, 'missing'), /not found/);
});

test('split preserves source offsets at absolute timeline frames after trimming and moving', () => {
  let project = appendMedia(fixture(), 'video');
  const id = project.timeline.tracks[0].clips[0].id;
  project = trimClip(project, id, { trimStartFrame: 60, durationFrames: 120 });
  project = moveClip(project, id, 30);
  const before = JSON.stringify(project);
  const split = splitClip(project, id, 75);
  assert.equal(JSON.stringify(project), before);
  const [left, right] = split.timeline.tracks[0].clips;
  assert.equal(left.startFrame, 30);
  assert.equal(left.durationFrames, 45);
  assert.equal(left.trimStartFrame, 60);
  assert.equal(right.startFrame, 75);
  assert.equal(right.durationFrames, 75);
  assert.equal(right.trimStartFrame, 105);
  assert.notEqual(left.id, right.id);
  assert.equal(totalFrames(split), 150);
  for (const frame of [30, 150, 75.5, NaN]) assert.throws(() => splitClip(project, id, frame), /Split frame/);
});

test('image split preserves zero source trim and permits duration changes', () => {
  let project = appendMedia(fixture(), 'image');
  const id = project.timeline.tracks[0].clips[0].id;
  project = splitClip(project, id, 60);
  assert.deepEqual(project.timeline.tracks[0].clips.map((clip) => clip.trimStartFrame), [0, 0]);
  assert.throws(() => trimClip(project, id, { trimStartFrame: 1, durationFrames: 30 }), /still image/);
});

test('moves reject overlaps; deleting can preserve or close the same-track gap', () => {
  let project = appendMedia(appendMedia(appendMedia(fixture(), 'image'), 'image'), 'audio');
  const [first, second] = project.timeline.tracks[0].clips;
  assert.throws(() => moveClip(project, second.id, 149), /overlap/);
  assert.throws(() => moveClip(project, first.id, -1), /startFrame/);
  const removed = deleteClip(project, first.id);
  assert.equal(removed.timeline.tracks[0].clips[0].startFrame, 150);
  const rippled = deleteClip(project, first.id, true);
  assert.equal(rippled.timeline.tracks[0].clips[0].startFrame, 0);
  assert.equal(rippled.timeline.tracks[1].clips[0].startFrame, 0);
  assert.equal(project.timeline.tracks[0].clips.length, 2);
  assert.throws(() => deleteClip(project, 'missing'), /not found/);
});

test('source bounds, finite values, dimensions and unknown features fail explicitly', () => {
  const original = appendMedia(fixture(), 'video');
  const clipId = original.timeline.tracks[0].clips[0].id;
  assert.throws(() => trimClip(original, clipId, { trimStartFrame: 299, durationFrames: 2 }), /beyond/);
  assert.throws(() => trimClip(original, clipId, { trimStartFrame: 0, durationFrames: 0 }), /durationFrames/);
  for (const [field, value] of [['speed', 2], ['effects', []], ['transition', 'crossfade'], ['volume', Infinity], ['durationFrames', 1.5]]) {
    const project = structuredClone(original);
    project.timeline.tracks[0].clips[0][field] = value;
    assert.throws(() => validateProject(project));
  }
  for (const change of [
    (project) => { project.timeline.width = 641; },
    (project) => { project.timeline.fps = 29.97; },
    (project) => { project.timeline.tracks.push({ ...project.timeline.tracks[0], id: 'video-2' }); },
    (project) => { project.timeline.tracks[0].clips[0].mediaRef = 'gone'; },
    (project) => { project.media.push({ ...project.media[0] }); },
    (project) => { project.timeline.tracks[0].clips[0].mediaType = 'audio'; },
    (project) => { project.timeline.tracks[0].muted = 1; },
    (project) => { project.timeline.tracks[0].clips.push({ ...project.timeline.tracks[0].clips[0] }); },
  ]) {
    const project = structuredClone(original);
    change(project);
    assert.throws(() => validateProject(project));
  }
  assert.throws(() => validateProject({ project: 'native mac' }), /native Mac/);
  assert.throws(() => validateProject({ ...original, version: 2 }), /Unsupported project format/);
});

test('validation sorts an independent clip copy without editing input order', () => {
  let project = appendMedia(appendMedia(fixture(), 'image'), 'image');
  project.timeline.tracks[0].clips.reverse();
  const validated = validateProject(project);
  assert.equal(validated.timeline.tracks[0].clips[0].startFrame, 0);
  assert.equal(project.timeline.tracks[0].clips[0].startFrame, 150);
});
