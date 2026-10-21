import React, { useEffect, useRef, useState } from 'react';
import { appendMedia, createProject, deleteClip, splitClip, totalFrames, validateProject } from '../core/project.mjs';

const bridge = window.palmier;
const snapshot = project => JSON.stringify(project);
const seconds = (frames, fps) => Number((frames / fps).toFixed(3));
const timecode = (frames, fps) => {
  const whole = Math.floor(Math.max(0, frames) / fps);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}:${String(Math.max(0, frames) % fps).padStart(2, '0')}`;
};
const mediaDuration = asset => asset.type === 'image' ? 'STILL' : `${Number(asset.duration || 0).toFixed(1)}s`;

function Icon({ name, className = '' }) {
  const paths = {
    import: 'M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5',
    play: 'm8 5 11 7-11 7Z', plus: 'M12 5v14M5 12h14',
    video: 'M3 5h18v14H3ZM3 9h18M7 5v4m10-4v4',
    audio: 'M9 17V5l11-2v12M9 7l11-2M9 17c0 3-6 4-6 1s6-4 6-1Zm11-2c0 3-6 4-6 1s6-4 6-1Z',
    image: 'M3 3h18v18H3Zm0 14 6-7 5 6 3-4 4 5M16 7h.01',
    split: 'M12 3v18M4 7l4 5-4 5m16-10-4 5 4 5',
    undo: 'M9 5 4 10l5 5M4 10h10c8 0 8 10 0 10',
    redo: 'm15 5 5 5-5 5m5-5H10c-8 0-8 10 0 10',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    export: 'M12 15V3m-4 4 4-4 4 4M4 13v8h16v-8',
    close: 'm6 6 12 12M6 18 18 6',
    folder: 'M3 6V4h7l2 3h9v13H3Z',
  };
  return <svg aria-hidden="true" className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.video} /></svg>;
}

function ClipInspector({ clip, asset, fps, apply }) {
  const [draft, setDraft] = useState({});
  useEffect(() => {
    setDraft({ start: seconds(clip.startFrame, fps), sourceIn: seconds(clip.trimStartFrame, fps), duration: seconds(clip.durationFrames, fps), volume: Math.round(clip.volume * 100) });
  }, [clip, fps]);
  const field = (key, label, min = 0, max) => <label className="property-row"><span>{label}</span><div className="unit-input"><input aria-label={label} type="number" min={min} max={max} step={key === 'volume' ? 1 : 'any'} value={draft[key] ?? ''} required onChange={event => setDraft({ ...draft, [key]: event.target.value })} /><span>{key === 'volume' ? '%' : 's'}</span></div></label>;
  return <form className="clip-properties" onSubmit={event => {
    event.preventDefault();
    apply({ startFrame: Math.round(Number(draft.start) * fps), trimStartFrame: Math.round(Number(draft.sourceIn) * fps), durationFrames: Math.round(Number(draft.duration) * fps), volume: Number(draft.volume) / 100 });
  }}>
    <div className="inspector-thumbnail">{asset?.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <Icon name={asset?.type} />}</div>
    <h3 title={asset?.name}>{asset?.name || 'Media unavailable'}</h3>
    <p className="muted small">{clip.mediaType.toUpperCase()} · {clip.durationFrames} frames</p>
    <div className="property-section">{field('start', 'Timeline start')}{field('sourceIn', 'Source in')}{field('duration', 'Duration')}{field('volume', 'Volume', 0, 400)}</div>
    <button type="submit" className="wide" data-testid="apply-clip">Apply changes</button>
    <p className="small muted">Edits snap to project frames. Clips cannot overlap on the same track. Volume 0 mutes this clip.</p>
  </form>;
}

export default function App() {
  const [history, setHistory] = useState(() => ({ past: [], project: createProject(), future: [] }));
  const project = history.project;
  const [savedSignature, setSavedSignature] = useState(() => snapshot(project));
  const [savePath, setSavePath] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [viewerTab, setViewerTab] = useState('source');
  const [preview, setPreview] = useState(null);
  const [renderJob, setRenderJob] = useState(null);
  const [busy, setBusy] = useState('');
  const [lastExport, setLastExport] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState('fit');
  const [filter, setFilter] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const playerRef = useRef(null);
  const latest = useRef({});
  const signature = snapshot(project);
  const dirty = savedSignature !== signature;
  const frames = totalFrames(project);
  const fps = project.timeline.fps;
  const duration = frames / fps;
  const previewCurrent = Boolean(preview && preview.signature === signature);
  const selectedAsset = project.media.find(asset => asset.id === selectedAssetId);
  const selectedTrack = project.timeline.tracks.find(track => track.clips.some(clip => clip.id === selectedClipId));
  const selectedClip = selectedTrack?.clips.find(clip => clip.id === selectedClipId);
  const clipAsset = project.media.find(asset => asset.id === selectedClip?.mediaRef);
  const canRender = Boolean(status?.tools?.available && frames > 0 && !renderJob && !busy);
  const visibleAssets = project.media.filter(asset => asset.name.toLowerCase().includes(filter.toLowerCase()));
  const timelineSeconds = Math.max(10, Math.ceil(duration + 2));
  const timelineFrames = timelineSeconds * fps;
  const tickStep = timelineSeconds > 120 ? Math.ceil(timelineSeconds / 12 / 10) * 10 : timelineSeconds > 30 ? 5 : 2;
  const ticks = Array.from({ length: Math.ceil(timelineSeconds / tickStep) }, (_, index) => index * tickStep);

  useEffect(() => {
    if (!bridge) { setError('Open this editor in the Palmier Pro desktop application. The secure local-media bridge is unavailable in a regular browser.'); return; }
    bridge.getStatus().then(setStatus).catch(cause => setError(cause.message));
    return bridge.onRenderProgress(event => setRenderJob(job => job ? { ...job, progress: Math.max(0, Math.min(1, event.progress)) } : job));
  }, []);

  useEffect(() => { bridge?.setDirty?.(dirty)?.catch(cause => setError(cause.message)); }, [dirty]);
  useEffect(() => { document.title = `${dirty ? '● ' : ''}${project.name} — Palmier Pro`; }, [project.name, dirty]);
  useEffect(() => { setMediaError(false); }, [selectedAssetId, preview?.url, viewerTab]);

  function commit(operation) {
    if (busy === 'Opening project') return false;
    try {
      const next = validateProject(operation(project));
      if (snapshot(next) !== signature) setHistory({ past: [...history.past, project].slice(-100), project: next, future: [] });
      setError('');
      return true;
    } catch (cause) { setError(cause.message); return false; }
  }

  function undo() {
    if (!history.past.length || busy === 'Opening project') return;
    setHistory({ past: history.past.slice(0, -1), project: history.past.at(-1), future: [project, ...history.future] });
    setError('');
  }
  function redo() {
    if (!history.future.length || busy === 'Opening project') return;
    setHistory({ past: [...history.past, project], project: history.future[0], future: history.future.slice(1) });
    setError('');
  }

  async function importAssets(files) {
    if (!bridge || busy) return;
    setBusy('Importing media');
    setError('');
    try {
      const assets = files ? await bridge.importPaths(bridge.mediaFiles(files)) : await bridge.importMedia();
      if (!assets?.length) return;
      const current = latest.current.history;
      const next = validateProject({ ...current.project, media: [...current.project.media, ...assets.filter(asset => !current.project.media.some(existing => existing.id === asset.id))] });
      setHistory({ past: [...current.past, current.project].slice(-100), project: next, future: [] });
      setSelectedAssetId(assets[0].id);
      setViewerTab('source');
      setNotice(`Imported ${assets.length} ${assets.length === 1 ? 'file' : 'files'}. Select media, then append to timeline.`);
    } catch (cause) { setError(cause.message); } finally { setBusy(''); }
  }

  function append() {
    if (!selectedAsset) return;
    try {
      const next = appendMedia(project, selectedAsset.id);
      const newClip = next.timeline.tracks.flatMap(track => track.clips).find(clip => !project.timeline.tracks.some(track => track.clips.some(existing => existing.id === clip.id)));
      if (commit(() => next) && newClip) { setSelectedClipId(newClip.id); setPlayhead(newClip.startFrame); }
    } catch (cause) { setError(cause.message); }
  }

  function seek(frame) {
    const next = Math.max(0, Math.min(timelineFrames, Math.round(frame)));
    setPlayhead(next);
    if (viewerTab === 'timeline' && previewCurrent && playerRef.current) playerRef.current.currentTime = Math.min(next / fps, duration);
  }

  function applyClip(changes) {
    commit(current => ({ ...current, timeline: { ...current.timeline, tracks: current.timeline.tracks.map(track => ({ ...track, clips: track.clips.map(clip => clip.id === selectedClipId ? { ...clip, ...changes } : clip) })) } }));
  }

  function remove(ripple = false) {
    if (selectedClip && commit(current => deleteClip(current, selectedClip.id, ripple))) setSelectedClipId(null);
  }

  function toggleTrack(trackId, key) {
    commit(current => ({ ...current, timeline: { ...current.timeline, tracks: current.timeline.tracks.map(track => track.id === trackId ? { ...track, [key]: !track[key] } : track) } }));
  }

  async function save(saveAs = false) {
    if (!bridge || busy) return;
    const saving = project;
    setBusy('Saving project');
    try {
      const result = await bridge.saveProject(saving, saveAs);
      if (result) { setSavePath(result.path); setSavedSignature(snapshot(saving)); setNotice('Project saved. Source media stays in its original location.'); }
    } catch (cause) { setError(cause.message); } finally { setBusy(''); }
  }

  function reset(next, path = null) {
    setHistory({ past: [], project: next, future: [] }); setSavedSignature(snapshot(next)); setSavePath(path);
    setSelectedAssetId(next.media[0]?.id || null); setSelectedClipId(null); setPreview(null); setPlayhead(0); setError(''); setNotice(''); setViewerTab('source'); setLastExport(null);
  }

  async function open() {
    if (!bridge || busy || renderJob) return;
    if (dirty && !window.confirm('Discard unsaved changes and open another project?')) return;
    setBusy('Opening project');
    try { const next = await bridge.openProject(); if (next) reset(validateProject(next)); }
    catch (cause) { setError(cause.message); } finally { setBusy(''); }
  }

  function newProject() {
    if (busy || renderJob) return;
    if (dirty && !window.confirm('Discard unsaved changes and create a new project?')) return;
    reset(createProject());
  }

  async function render(mode) {
    if (!canRender) return;
    const renderingProject = project;
    setRenderJob({ mode, progress: 0 }); setError('');
    try {
      const result = await bridge.render(renderingProject, mode);
      if (!result) return;
      if (mode === 'preview') { setPreview({ ...result, signature: snapshot(renderingProject) }); setViewerTab('timeline'); setPlayhead(0); }
      else { setLastExport(result.path); setNotice('MP4 export complete.'); }
    } catch (cause) {
      if (/cancel|abort/i.test(cause.message)) setNotice('Render cancelled.'); else setError(cause.message);
    } finally { setRenderJob(null); }
  }

  latest.current = { save, undo, redo, remove, append, newProject, open, viewerTab, previewCurrent, history };
  useEffect(() => {
    const listener = event => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 's') { event.preventDefault(); latest.current.save(event.shiftKey); return; }
      if (command && key === 'o') { event.preventDefault(); latest.current.open(); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (command && key === 'z') { event.preventDefault(); event.shiftKey ? latest.current.redo() : latest.current.undo(); }
      else if (command && key === 'y') { event.preventDefault(); latest.current.redo(); }
      else if (key === 'delete' || key === 'backspace') { event.preventDefault(); latest.current.remove(event.shiftKey); }
      else if (event.code === 'Space' && playerRef.current && (latest.current.viewerTab === 'source' || latest.current.previewCurrent)) {
        event.preventDefault();
        const player = playerRef.current;
        if (player.paused) player.play().catch(() => {}); else player.pause();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const viewerAsset = viewerTab === 'source' ? selectedAsset : previewCurrent ? { type: 'video', previewUrl: preview.url, name: 'Rendered timeline' } : null;

  return <main className="editor" onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setDragActive(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }} onDrop={event => { event.preventDefault(); setDragActive(false); const files = Array.from(event.dataTransfer.files); if (files.length) importAssets(files); }}>
    <header className="titlebar">
      <div className="brand"><span className="brand-mark">p.</span><div><strong>Palmier Pro</strong><span className="edition">WINDOWS ALPHA</span></div></div>
      <div className="project-title"><input aria-label="Project name" value={project.name} disabled={busy === 'Opening project'} maxLength={120} onChange={event => commit(current => ({ ...current, name: event.target.value || 'Untitled' }))} /><span className={`save-indicator ${dirty ? 'unsaved' : ''}`} title={dirty ? 'Unsaved changes' : 'No unsaved changes'} /><span className="small muted">{dirty ? 'Unsaved' : savePath ? 'Saved' : 'No changes'}</span></div>
      <div className="header-actions"><button onClick={newProject} disabled={Boolean(busy || renderJob)}>New</button><button onClick={open} disabled={Boolean(busy || renderJob)}>Open</button><button onClick={() => save()} disabled={Boolean(busy || !bridge)} title="Ctrl+S">Save</button><button className="subtle-button" onClick={() => save(true)} disabled={Boolean(busy || !bridge)} title="Ctrl+Shift+S">Save as</button><button className="primary" onClick={() => render('export')} disabled={!canRender} data-testid="export-video"><Icon name="export" />Export MP4</button></div>
    </header>

    {!status?.tools?.available && status && <div className="warning-banner" role="status"><strong>FFmpeg is unavailable.</strong><span>{status.tools?.error || 'Set PALMIER_FFMPEG_PATH and PALMIER_FFPROBE_PATH, then restart.'}</span></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" /></button></div>}

    <div className="workspace" inert={busy === 'Opening project'}>
      <section className="media-panel panel" aria-label="Media library">
        <div className="panel-header"><h2>Media</h2><span className="count">{project.media.length}</span><button className="icon-button" onClick={() => importAssets()} disabled={Boolean(busy || !bridge)} aria-label="Import media" title="Import video, audio or images" data-testid="import-media"><Icon name="import" /></button></div>
        <div className="media-search"><input type="search" aria-label="Search media" placeholder="Search media" value={filter} onChange={event => setFilter(event.target.value)} /></div>
        <div className="media-list">
          {visibleAssets.map(asset => <button className={`media-card ${selectedAssetId === asset.id ? 'selected' : ''}`} key={asset.id} onClick={() => { setSelectedAssetId(asset.id); setViewerTab('source'); }} onDoubleClick={() => { try { commit(current => appendMedia(current, asset.id)); } catch (cause) { setError(cause.message); } }} data-testid="media-asset"><span className="media-thumbnail">{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" loading="lazy" /> : <Icon name={asset.type} />}<span>{mediaDuration(asset)}</span></span><span className="media-details"><strong title={asset.name}>{asset.name}</strong><span>{asset.type.toUpperCase()}{asset.width ? ` · ${asset.width} × ${asset.height}` : ''}</span></span></button>)}
          {!visibleAssets.length && <div className="empty-media"><Icon name="folder" /><h3>{filter ? 'No matching media' : 'Your media starts here'}</h3><p>{filter ? 'Try another file name.' : 'Drop video, audio or images here. Files stay on your computer.'}</p>{!filter && <button onClick={() => importAssets()} disabled={Boolean(busy || !bridge)}><Icon name="plus" />Import files</button>}</div>}
        </div>
        <div className="panel-footer"><span className="small muted">Original files are linked, not copied.</span></div>
      </section>

      <section className="viewer-panel panel" aria-label="Preview monitor">
        <div className="panel-header viewer-header"><div className="tabs" role="tablist" aria-label="Preview type"><button role="tab" aria-selected={viewerTab === 'source'} className={viewerTab === 'source' ? 'active' : ''} onClick={() => setViewerTab('source')}>Source</button><button role="tab" aria-selected={viewerTab === 'timeline'} className={viewerTab === 'timeline' ? 'active' : ''} onClick={() => setViewerTab('timeline')}>Timeline preview{preview && !previewCurrent ? ' · stale' : ''}</button></div><span className="small muted">{project.timeline.width} × {project.timeline.height}</span></div>
        <div className="viewer-canvas">
          {viewerAsset ? <>
            {viewerAsset.type === 'image' ? <img className="source-image" src={viewerAsset.previewUrl} alt={viewerAsset.name} onError={() => setMediaError(true)} /> : viewerAsset.type === 'audio' ? <div className="audio-viewer"><Icon name="audio" /><h3>{viewerAsset.name}</h3><audio ref={playerRef} key={viewerAsset.previewUrl} src={viewerAsset.previewUrl} controls onError={() => setMediaError(true)} /></div> : <video ref={playerRef} key={viewerAsset.previewUrl} src={viewerAsset.previewUrl} poster={viewerTab === 'source' ? viewerAsset.thumbnailUrl : undefined} controls preload="metadata" onError={() => setMediaError(true)} onTimeUpdate={event => { if (viewerTab === 'timeline') setPlayhead(Math.min(frames, Math.round(event.currentTarget.currentTime * fps))); }} />}
            {mediaError && <div className="playback-error" role="status">Source playback is unavailable for this codec. Append it and render a timeline preview with FFmpeg.</div>}
          </> : <div className="viewer-empty"><span className="monitor-mark"><Icon name={viewerTab === 'source' ? 'video' : 'play'} /></span><h2>{viewerTab === 'source' ? 'Select a source' : preview ? 'Timeline has changed' : 'Preview your sequence'}</h2><p>{viewerTab === 'source' ? 'Inspect an imported file before adding it to the timeline.' : frames ? 'Render the actual sequence, with trims, gaps and mixed audio.' : 'Append media to the timeline, then render a preview.'}</p>{viewerTab === 'timeline' && <button onClick={() => render('preview')} disabled={!canRender}><Icon name="play" />Render preview</button>}</div>}
        </div>
        <div className="viewer-toolbar"><div className="viewer-label"><span className="eyebrow">{viewerTab === 'source' ? 'SOURCE' : 'RENDERED TIMELINE'}</span><span title={viewerTab === 'source' ? selectedAsset?.name : project.name}>{viewerTab === 'source' ? selectedAsset?.name || 'No selection' : previewCurrent ? project.name : 'Preview not current'}</span></div>{viewerTab === 'source' ? <button onClick={append} disabled={!selectedAsset} data-testid="append-media"><Icon name="plus" />Append to timeline</button> : <button onClick={() => render('preview')} disabled={!canRender} data-testid="viewer-render-preview"><Icon name="play" />{previewCurrent ? 'Render again' : 'Render preview'}</button>}</div>
      </section>

      <aside className="inspector-panel panel" aria-label="Inspector"><div className="panel-header"><h2>Inspector</h2>{selectedClip ? <button className="subtle-button small" onClick={() => setSelectedClipId(null)}>Project settings</button> : <span className="small muted">Project</span>}</div><div className="inspector-content">{selectedClip ? <ClipInspector clip={selectedClip} asset={clipAsset} fps={fps} apply={applyClip} /> : <>
        <h3>Sequence settings</h3><p className="small muted">Set the format before editing.</p>
        <label className="stacked-field">Frame rate<select aria-label="Project frame rate" value={fps} disabled={frames > 0} onChange={event => commit(current => ({ ...current, timeline: { ...current.timeline, fps: Number(event.target.value) } }))}>{[24, 25, 30, 50, 60].map(rate => <option key={rate} value={rate}>{rate} fps</option>)}</select></label>
        <label className="stacked-field">Resolution<select aria-label="Project resolution" value={`${project.timeline.width}x${project.timeline.height}`} onChange={event => { const [width, height] = event.target.value.split('x').map(Number); commit(current => ({ ...current, timeline: { ...current.timeline, width, height } })); }}><option value="1920x1080">1920 × 1080 · Landscape</option><option value="1280x720">1280 × 720 · Landscape</option><option value="1080x1920">1080 × 1920 · Portrait</option><option value="1080x1080">1080 × 1080 · Square</option><option value="3840x2160">3840 × 2160 · UHD</option></select></label>
        {frames > 0 && <p className="small muted">Frame rate is locked while the timeline contains clips.</p>}
        <div className="sequence-stats"><span>Duration<strong>{timecode(frames, fps)}</strong></span><span>Clips<strong>{project.timeline.tracks.reduce((count, track) => count + track.clips.length, 0)}</strong></span></div>
        <p className="small muted">Select a timeline clip to trim, reposition or change its volume.</p>
      </>}<div className="alpha-note"><span className="eyebrow">WINDOWS ALPHA</span><p>Local cuts, trims and audio mixing. Advanced effects and generative AI are not ported.</p><p>Windows projects are separate from native Mac project packages.</p></div></div></aside>
    </div>

    <section className="timeline-panel" aria-label="Timeline" inert={busy === 'Opening project'}>
      <div className="timeline-toolbar"><div className="timeline-heading"><h2>Timeline</h2><span className="timecode" data-testid="playhead-timecode">{timecode(playhead, fps)}</span><span className="small muted">/ {timecode(frames, fps)}</span></div><div className="timeline-actions"><button className="icon-button" aria-label="Undo" title="Undo · Ctrl+Z" disabled={!history.past.length} onClick={undo}><Icon name="undo" /></button><button className="icon-button" aria-label="Redo" title="Redo · Ctrl+Y" disabled={!history.future.length} onClick={redo}><Icon name="redo" /></button><span className="toolbar-divider" /><button disabled={!selectedClip || playhead <= selectedClip.startFrame || playhead >= selectedClip.startFrame + selectedClip.durationFrames} onClick={() => commit(current => splitClip(current, selectedClip.id, playhead))} data-testid="split-clip"><Icon name="split" />Split</button><button disabled={!selectedClip} onClick={() => remove(false)} title="Delete"><Icon name="trash" />Delete</button><button disabled={!selectedClip} onClick={() => remove(true)} title="Shift+Delete">Ripple delete</button><label className="zoom-control">Zoom<select aria-label="Timeline zoom" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Fit</option><option value="40">40 px/s</option><option value="80">80 px/s</option></select></label></div></div>
      <div className="timeline-scroll"><div className="track-labels"><div className="ruler-spacer" />{project.timeline.tracks.map(track => <div className="track-label" key={track.id}><div><Icon name={track.type} /><strong>{track.type === 'video' ? 'Picture' : 'Audio'}</strong></div><div className="track-switches"><button className={track.muted ? 'active' : ''} aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.type} track`} aria-pressed={track.muted} onClick={() => toggleTrack(track.id, 'muted')}>M</button>{track.type === 'video' && <button className={track.hidden ? 'active' : ''} aria-label={`${track.hidden ? 'Show' : 'Hide'} picture track`} aria-pressed={track.hidden} onClick={() => toggleTrack(track.id, 'hidden')}>H</button>}</div></div>)}</div>
        <div className="timeline-lanes-scroll"><div className="timeline-lanes" style={zoom === 'fit' ? undefined : { minWidth: `${timelineSeconds * Number(zoom)}px` }}>
          <div className="ruler" onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * timelineFrames); }}>{ticks.map(second => <span className="ruler-tick" style={{ left: `${second / timelineSeconds * 100}%` }} key={second}>{String(Math.floor(second / 60)).padStart(2, '0')}:{String(second % 60).padStart(2, '0')}</span>)}</div>
          {project.timeline.tracks.map(track => <div className={`track-lane ${track.muted || track.hidden ? 'track-disabled' : ''}`} key={track.id} onPointerDown={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * timelineFrames); setSelectedClipId(null); } }}>
            {track.clips.map(clip => { const asset = project.media.find(item => item.id === clip.mediaRef); return <button key={clip.id} className={`timeline-clip clip-${clip.mediaType} ${selectedClipId === clip.id ? 'selected' : ''}`} style={{ left: `${clip.startFrame / timelineFrames * 100}%`, width: `${clip.durationFrames / timelineFrames * 100}%` }} aria-label={`${asset?.name || 'Clip'}, start ${seconds(clip.startFrame, fps)} seconds, duration ${seconds(clip.durationFrames, fps)} seconds`} title={`${asset?.name}\n${seconds(clip.startFrame, fps)}s → ${seconds(clip.startFrame + clip.durationFrames, fps)}s`} onClick={() => { setSelectedClipId(clip.id); }} data-testid="timeline-clip"><span className="clip-name">{asset?.name || 'Media unavailable'}</span><span className="clip-duration">{seconds(clip.durationFrames, fps)}s{clip.volume === 0 ? ' · muted' : ''}</span></button>; })}
            {!track.clips.length && <span className="lane-hint">{track.type === 'video' ? 'Video and still images' : 'Music, dialogue and sound'} · append from the media bin</span>}
          </div>)}
          <div className="playhead" aria-hidden="true" style={{ left: `${playhead / timelineFrames * 100}%` }} />
        </div></div>
      </div>
      <div className="timeline-footer"><label htmlFor="playhead-scrubber" className="small muted">Playhead</label><input id="playhead-scrubber" aria-label="Timeline playhead frame" type="range" min="0" max={timelineFrames} step="1" value={Math.min(playhead, timelineFrames)} onChange={event => seek(Number(event.target.value))} /><span className="small muted">{fps} fps · integer frames</span><button className="subtle-button" onClick={() => { setViewerTab('timeline'); render('preview'); }} disabled={!canRender} data-testid="render-preview">Render preview</button></div>
    </section>

    <footer className="statusbar"><span className="local-status"><span className="status-dot" />Local · No cloud requests</span><span className="status-message" title={notice || savePath || ''}>{busy || notice || (savePath ? savePath : 'Import media to begin. Ctrl+S saves your project.')}</span>{lastExport && <button onClick={() => bridge.revealFile(lastExport).catch(cause => setError(cause.message))}>Show export</button>}<span className="small muted">{status?.tools?.available ? 'FFmpeg ready' : 'FFmpeg not ready'}</span></footer>

    {renderJob && <div className="render-notification" role="status"><div><strong>{renderJob.mode === 'export' ? 'Exporting MP4' : 'Rendering timeline preview'}</strong><span>{Math.round(renderJob.progress * 100)}%</span></div><progress max="1" value={renderJob.progress} /><div><span className="small muted">{signature !== preview?.signature ? 'Local FFmpeg render' : 'Local render'}</span><button onClick={() => bridge.cancelRender().catch(cause => setError(cause.message))}>Cancel</button></div></div>}
    {dragActive && <div className="drop-overlay"><Icon name="import" /><h2>Drop to import media</h2><p>Video, audio and still images</p></div>}
  </main>;
}
