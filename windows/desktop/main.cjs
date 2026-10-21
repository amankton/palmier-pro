const { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { mkdir, stat } = require('node:fs/promises');

protocol.registerSchemesAsPrivileged([
  { scheme: 'palmier', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'palmier-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

app.setName('Palmier Pro Windows Alpha');
if (process.env.PALMIER_TEST_USER_DATA) app.setPath('userData', process.env.PALMIER_TEST_USER_DATA);

let window;
let dirty = false;
let activeRender;
const assets = new Map();
const mediaTokens = new Map();
const savedProjects = new Map();
const outputFiles = new Set();
let toolPromise;

const boot = async () => {
  const { discoverTools, probeMedia, createThumbnail, renderProject } = await import('../media/ffmpeg.mjs');
  const { validateProject } = await import('../core/project.mjs');
  const { assetPath, existingMediaPath, assertLocalPath, MEDIA_EXTENSIONS } = await import('./host-policy.mjs');
  const { readProject, writeProject } = await import('./project-store.mjs');
  const { mediaResponse } = await import('./media-response.mjs');
  const { AppTheme } = await import('../src/AppTheme.js');
  await app.whenReady();
  const cacheDirectory = path.join(app.getPath('userData'), 'media-cache');
  const projectDirectory = path.join(app.getPath('documents'), 'Palmier Projects');
  await mkdir(cacheDirectory, { recursive: true });
  const fileSession = session.fromPartition('palmier-private-file-delivery');
  const getTools = () => toolPromise ??= discoverTools().catch((error) => { toolPromise = undefined; throw error; });
  const grant = (filePath) => {
    const token = randomUUID();
    mediaTokens.set(token, filePath);
    return `palmier-media://asset/${token}`;
  };
  const hydrate = async (asset, tools, register = true) => {
    const result = { ...asset, previewUrl: grant(asset.path) };
    if (asset.type !== 'audio') {
      const thumbnail = path.join(cacheDirectory, `${randomUUID()}.jpg`);
      try {
        await createThumbnail(asset, thumbnail, tools);
        result.thumbnailUrl = grant(thumbnail);
      } catch { /* Thumbnail failure does not invalidate playable source media. */ }
    }
    if (register) assets.set(result.id, result);
    return result;
  };
  const importFiles = async (paths) => {
    if (!Array.isArray(paths) || paths.length > 100) throw new Error('Import at most 100 local media files at a time.');
    const tools = await getTools();
    const imported = [];
    for (const selected of paths) {
      const filePath = await existingMediaPath(selected);
      const existing = [...assets.values()].find((asset) => asset.path === filePath);
      imported.push(existing ?? await hydrate(await probeMedia(filePath, tools), tools));
    }
    return imported;
  };
  const trustedProject = (input) => {
    const project = validateProject(input);
    project.media = project.media.map((media) => {
      const known = assets.get(media.id);
      if (!known || known.path !== media.path) throw new Error(`Import or reopen the source before using it: ${media.name}`);
      return { ...known };
    });
    return validateProject(project);
  };
  const trustedSender = (event) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== 'palmier://app/index.html') throw new Error('Untrusted editor request.');
  };
  const handle = (channel, fn) => ipcMain.handle(`palmier:${channel}`, async (event, ...args) => {
    trustedSender(event);
    return fn(...args);
  });

  protocol.handle('palmier', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const filePath = assetPath(path.join(app.getAppPath(), 'dist'), url.pathname);
      return await fileSession.fetch(pathToFileURL(filePath).href);
    } catch { return new Response('Not found', { status: 404 }); }
  });
  protocol.handle('palmier-media', async (request) => {
    const url = new URL(request.url);
    const filePath = url.host === 'asset' ? mediaTokens.get(url.pathname.slice(1)) : undefined;
    if (!filePath || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    try { return await mediaResponse(filePath, request); }
    catch { return new Response('Source media unavailable', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(palmier:|palmier-media:|devtools:|data:|blob:)/.test(details.url) });
  });

  handle('status', async () => {
    try {
      const tools = await getTools();
      return { platform: process.platform, version: app.getVersion(), tools: { available: true, version: tools.version }, projectDirectory };
    } catch (error) {
      return { platform: process.platform, version: app.getVersion(), tools: { available: false, error: error.message }, projectDirectory };
    }
  });
  handle('import', async () => {
    const selected = await dialog.showOpenDialog(window, { title: 'Import media', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: MEDIA_EXTENSIONS }] });
    return selected.canceled ? [] : importFiles(selected.filePaths);
  });
  handle('import-paths', importFiles);
  handle('save', async (input, saveAs) => {
    const project = trustedProject(input);
    let destination = !saveAs ? savedProjects.get(project.id) : undefined;
    if (!destination) {
      await mkdir(projectDirectory, { recursive: true });
      const safeName = project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'Untitled';
      const selected = await dialog.showSaveDialog(window, { title: 'Save Windows project', defaultPath: path.join(projectDirectory, `${safeName}.palmierpc`), filters: [{ name: 'Palmier Windows project', extensions: ['palmierpc'] }] });
      if (selected.canceled || !selected.filePath) return null;
      destination = { path: selected.filePath };
      if (!destination.path.toLowerCase().endsWith('.palmierpc')) destination.path += '.palmierpc';
      try { await stat(destination.path); throw new Error('Choose a new filename. Save As does not overwrite an existing project.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const saved = await writeProject(destination.path, project, destination.stamp);
    savedProjects.set(project.id, saved);
    outputFiles.add(saved.path);
    return { path: saved.path };
  });
  handle('open', async () => {
    const selected = await dialog.showOpenDialog(window, { title: 'Open Windows project', properties: ['openFile'], filters: [{ name: 'Palmier Windows project', extensions: ['palmierpc'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const filePath = selected.filePaths[0];
    const { project: raw, stamp } = await readProject(filePath);
    const project = validateProject(raw);
    const tools = await getTools();
    const loadedMedia = [];
    for (const media of project.media) {
      let source;
      try { source = await existingMediaPath(media.path); }
      catch { throw new Error(`Source is missing or unavailable: ${media.name}. Restore it to ${media.path} and reopen this project.`); }
      const inspected = await probeMedia(source, tools);
      if (inspected.type !== media.type) throw new Error(`Source type changed: ${media.name}`);
      loadedMedia.push(await hydrate({ ...inspected, id: media.id, name: media.name }, tools, false));
    }
    project.media = loadedMedia;
    const result = validateProject(project);
    for (const media of result.media) assets.set(media.id, media);
    savedProjects.set(result.id, { path: filePath, stamp });
    outputFiles.add(filePath);
    return result;
  });
  handle('render', async (input, mode) => {
    if (!['preview', 'export'].includes(mode)) throw new Error('Invalid render mode.');
    if (activeRender) throw new Error('A render is already running.');
    const project = trustedProject(input);
    let settle;
    const job = { controller: new AbortController(), settled: new Promise((resolve) => { settle = resolve; }) };
    activeRender = job;
    try {
      const tools = await getTools();
      let outputPath = path.join(cacheDirectory, `${randomUUID()}.mp4`);
      if (mode === 'export') {
        const selected = await dialog.showSaveDialog(window, { title: 'Export MP4', defaultPath: `${project.name.replace(/[<>:"/\\|?*]/g, '_')}.mp4`, filters: [{ name: 'H.264 / AAC video', extensions: ['mp4'] }] });
        if (selected.canceled || !selected.filePath) return null;
        outputPath = selected.filePath.toLowerCase().endsWith('.mp4') ? selected.filePath : `${selected.filePath}.mp4`;
        assertLocalPath(outputPath, ['mp4']);
      }
      const result = await renderProject(project, outputPath, { tools, signal: job.controller.signal, onProgress: (progress) => {
        if (window && !window.isDestroyed()) window.webContents.send('palmier:progress', { progress, mode });
      } });
      outputFiles.add(result.path);
      return { ...result, url: grant(result.path) };
    } finally { if (activeRender === job) activeRender = undefined; settle(); }
  });
  handle('cancel', () => { activeRender?.controller.abort(); });
  handle('reveal', (filePath) => {
    if (!outputFiles.has(filePath)) throw new Error('Only saved projects and completed renders can be revealed.');
    shell.showItemInFolder(filePath);
  });
  ipcMain.on('palmier:dirty', (event, value) => {
    try { trustedSender(event); dirty = value === true; } catch { /* Ignore untrusted fire-and-forget messages. */ }
  });

  window = new BrowserWindow({
    ...AppTheme.Window.homeDefault, minWidth: AppTheme.Window.projectMin.width, minHeight: AppTheme.Window.projectMin.height,
    title: 'Palmier Pro — Windows Alpha', backgroundColor: AppTheme.Background.base,
    show: process.env.PALMIER_TEST_HIDDEN !== '1',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  let closingAfterRender = false;
  window.on('close', (event) => {
    if (closingAfterRender) return;
    if (dirty || activeRender) {
      const result = dialog.showMessageBoxSync(window, { type: 'warning', title: 'Close editor?', message: activeRender ? 'A render is running. Closing cancels it.' : 'This project has unsaved changes.', buttons: ['Keep editing', 'Close without saving'], defaultId: 0, cancelId: 0, noLink: true });
      if (result === 0) { event.preventDefault(); return; }
    }
    if (activeRender) {
      event.preventDefault();
      const job = activeRender;
      job.controller.abort();
      job.settled.then(() => { closingAfterRender = true; window.close(); });
    }
  });
  await window.loadURL('palmier://app/index.html');
};

app.on('window-all-closed', () => app.quit());
boot().catch((error) => {
  console.error(error);
  if (app.isReady()) dialog.showErrorBox('Palmier Windows could not start', error.message);
  app.exit(1);
});
