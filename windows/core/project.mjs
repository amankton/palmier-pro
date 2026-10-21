const FORMAT = 'palmier-windows';
const MAX_SECONDS = 24 * 60 * 60;
const MAX_ITEMS = 2000;

const fail = (message) => { throw new Error(message); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
};
const keys = (value, allowed, label) => {
  object(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label}: unsupported field "${key}". This Windows alpha does not support that feature.`);
  }
};
const number = (value, label, min, max, integer = false) => {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    fail(`${label} must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}.`);
  }
  return value;
};
const string = (value, label, max = 256) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) {
    fail(`${label} must be a nonempty string of at most ${max} characters without control characters.`);
  }
  return value;
};
const bool = (value, label) => {
  if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
  return value;
};
const unique = (id, ids, label) => {
  string(id, `${label} id`, 128);
  if (ids.has(id)) fail(`Duplicate ${label} id: ${id}.`);
  ids.add(id);
};
const uuid = () => globalThis.crypto.randomUUID();

export function createProject(name = 'Untitled') {
  return validateProject({
    format: FORMAT, version: 1, id: uuid(), name,
    timeline: { fps: 30, width: 1920, height: 1080, tracks: [
      { id: 'video-1', type: 'video', muted: false, hidden: false, clips: [] },
      { id: 'audio-1', type: 'audio', muted: false, hidden: false, clips: [] },
    ] },
    media: [],
  });
}

export function validateProject(project) {
  object(project, 'Project');
  if (project.format !== FORMAT || project.version !== 1) {
    fail('Unsupported project format. Open a Palmier Windows version 1 project; native Mac .palmier projects are not compatible with this alpha.');
  }
  keys(project, ['format', 'version', 'id', 'name', 'timeline', 'media'], 'Project');
  string(project.id, 'Project id', 128);
  string(project.name, 'Project name');
  keys(project.timeline, ['fps', 'width', 'height', 'tracks'], 'Timeline');
  const { fps, width, height, tracks } = project.timeline;
  number(fps, 'Project FPS', 1, 120, true);
  for (const [label, value] of [['Width', width], ['Height', height]]) {
    number(value, label, 2, 8192, true);
    if (value % 2 !== 0) fail(`${label} must be even for H.264 export.`);
  }
  if (!Array.isArray(project.media) || project.media.length > MAX_ITEMS) fail(`Media must be an array with at most ${MAX_ITEMS} assets.`);
  const assetIds = new Set();
  const media = project.media.map((asset) => {
    keys(asset, ['id', 'name', 'path', 'type', 'duration', 'width', 'height', 'hasAudio', 'thumbnailUrl', 'previewUrl'], 'Media asset');
    unique(asset.id, assetIds, 'media');
    string(asset.name, 'Media name', 1024);
    string(asset.path, 'Media path', 4096);
    if (!['video', 'audio', 'image'].includes(asset.type)) fail(`Unsupported media type: ${asset.type}.`);
    number(asset.duration, 'Media duration', asset.type === 'image' ? 0 : Number.EPSILON, MAX_SECONDS);
    bool(asset.hasAudio, 'Media hasAudio');
    if (asset.type === 'image' && asset.hasAudio) fail('Still images cannot contain audio.');
    if (asset.type === 'audio' && !asset.hasAudio) fail('Audio assets must have an audio stream.');
    const copy = { id: asset.id, name: asset.name, path: asset.path, type: asset.type, duration: asset.duration,
      width: number(asset.width, 'Media width', asset.type === 'audio' ? 0 : 1, 65536, true),
      height: number(asset.height, 'Media height', asset.type === 'audio' ? 0 : 1, 65536, true), hasAudio: asset.hasAudio };
    for (const field of ['thumbnailUrl', 'previewUrl']) {
      if (asset[field] !== undefined) copy[field] = string(asset[field], field, 8192);
    }
    return copy;
  });
  const assetMap = new Map(media.map((asset) => [asset.id, asset]));
  if (!Array.isArray(tracks) || tracks.length !== 2 || tracks.filter((track) => track?.type === 'video').length !== 1 || tracks.filter((track) => track?.type === 'audio').length !== 1) {
    fail('This alpha requires exactly one picture track (video) and one audio track; multiple tracks are not supported.');
  }
  const trackIds = new Set();
  const clipIds = new Set();
  const normalizedTracks = tracks.map((track) => {
    keys(track, ['id', 'type', 'muted', 'hidden', 'clips'], 'Track');
    unique(track.id, trackIds, 'track');
    bool(track.muted, 'Track muted');
    bool(track.hidden, 'Track hidden');
    if (!Array.isArray(track.clips) || track.clips.length > MAX_ITEMS) fail(`Track clips must be an array with at most ${MAX_ITEMS} entries.`);
    const clips = track.clips.map((clip) => {
      keys(clip, ['id', 'mediaRef', 'mediaType', 'startFrame', 'durationFrames', 'trimStartFrame', 'speed', 'volume'], 'Clip');
      unique(clip.id, clipIds, 'clip');
      const asset = assetMap.get(clip.mediaRef);
      if (!asset) fail(`Clip ${clip.id} references missing media: ${clip.mediaRef}.`);
      if (clip.mediaType !== asset.type) fail(`Clip ${clip.id} has a media type that does not match its asset.`);
      if ((track.type === 'audio') !== (asset.type === 'audio')) fail(`Clip ${clip.id} is on the wrong track; video and images belong on the picture track.`);
      number(clip.startFrame, 'Clip startFrame', 0, MAX_SECONDS * fps, true);
      number(clip.durationFrames, 'Clip durationFrames', 1, MAX_SECONDS * fps, true);
      number(clip.trimStartFrame, 'Clip trimStartFrame', 0, MAX_SECONDS * fps, true);
      if (clip.speed !== 1) fail('Playback speed changes are not supported; clip speed must be 1.');
      number(clip.volume, 'Clip volume', 0, 4);
      if (clip.startFrame + clip.durationFrames > MAX_SECONDS * fps) fail('A timeline cannot exceed 24 hours.');
      if (asset.type === 'image') {
        if (clip.trimStartFrame !== 0) fail('A still image has no source trim; trimStartFrame must be 0.');
      } else if (clip.trimStartFrame + clip.durationFrames > Math.max(1, Math.round(asset.duration * fps))) {
        fail(`Clip ${clip.id} extends beyond its source duration.`);
      }
      return { id: clip.id, mediaRef: clip.mediaRef, mediaType: clip.mediaType, startFrame: clip.startFrame,
        durationFrames: clip.durationFrames, trimStartFrame: clip.trimStartFrame, speed: clip.speed, volume: clip.volume };
    }).sort((a, b) => a.startFrame - b.startFrame);
    for (let index = 1; index < clips.length; index += 1) {
      if (clips[index].startFrame < clips[index - 1].startFrame + clips[index - 1].durationFrames) fail(`Clips overlap on track ${track.id}; overlaps and transitions are not supported.`);
    }
    return { id: track.id, type: track.type, muted: track.muted, hidden: track.hidden, clips };
  });
  return { format: FORMAT, version: 1, id: project.id, name: project.name,
    timeline: { fps, width, height, tracks: normalizedTracks }, media };
}

export function totalFrames(project) {
  const copy = validateProject(project);
  return Math.max(0, ...copy.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames)));
}

function locate(project, clipId) {
  for (const track of project.timeline.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index !== -1) return { track, index, clip: track.clips[index] };
  }
  fail(`Clip not found: ${clipId}.`);
}

export function appendMedia(project, assetId, trackId) {
  const copy = validateProject(project);
  const asset = copy.media.find((item) => item.id === assetId);
  if (!asset) fail(`Media not found: ${assetId}.`);
  const type = asset.type === 'audio' ? 'audio' : 'video';
  const track = copy.timeline.tracks.find((item) => trackId ? item.id === trackId : item.type === type);
  if (!track || track.type !== type) fail('Select the matching picture or audio track for this asset.');
  const startFrame = Math.max(0, ...track.clips.map((clip) => clip.startFrame + clip.durationFrames));
  track.clips.push({ id: uuid(), mediaRef: asset.id, mediaType: asset.type, startFrame,
    durationFrames: Math.max(1, Math.round((asset.type === 'image' ? 5 : asset.duration) * copy.timeline.fps)),
    trimStartFrame: 0, speed: 1, volume: 1 });
  return validateProject(copy);
}

export function splitClip(project, clipId, frame) {
  const copy = validateProject(project);
  const { track, index, clip } = locate(copy, clipId);
  number(frame, 'Split frame', clip.startFrame + 1, clip.startFrame + clip.durationFrames - 1, true);
  const leftFrames = frame - clip.startFrame;
  const right = { ...clip, id: uuid(), startFrame: frame, durationFrames: clip.durationFrames - leftFrames,
    trimStartFrame: clip.mediaType === 'image' ? 0 : clip.trimStartFrame + leftFrames };
  clip.durationFrames = leftFrames;
  track.clips.splice(index + 1, 0, right);
  return validateProject(copy);
}

export function trimClip(project, clipId, options) {
  keys(options, ['trimStartFrame', 'durationFrames'], 'Trim options');
  const copy = validateProject(project);
  const { clip } = locate(copy, clipId);
  clip.trimStartFrame = options.trimStartFrame;
  clip.durationFrames = options.durationFrames;
  return validateProject(copy);
}

export function moveClip(project, clipId, startFrame) {
  const copy = validateProject(project);
  locate(copy, clipId).clip.startFrame = startFrame;
  return validateProject(copy);
}

export function deleteClip(project, clipId, ripple = false) {
  bool(ripple, 'Ripple');
  const copy = validateProject(project);
  const { track, index, clip } = locate(copy, clipId);
  track.clips.splice(index, 1);
  if (ripple) {
    for (const later of track.clips) {
      if (later.startFrame >= clip.startFrame + clip.durationFrames) later.startFrame -= clip.durationFrames;
    }
  }
  return validateProject(copy);
}
