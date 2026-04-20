const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  dialog,
  screen,
  systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const fixWebmMetaInfo = require('fix-webm-metainfo').default;
const { Decoder, Reader, tools } = require('ts-ebml');
const { SonioxClient } = require('./soniox');
const { buildSrt, buildVtt } = require('./subtitles');
const settingsUtils = require('./settings-utils');

let mainWindow = null;
let areaOverlayWindow = null;
let sttSession = null;
let audioCapMonitorProcess = null;
let audioCapPcmRemainder = Buffer.alloc(0);
let audioCapMonitorStopping = false;
let appSettings = {
  sonioxApiKey: '',
  outputFolder: '',
  uiTheme: 'dark',
  maxSegmentSizeMb: 0,
  subtitleFontSizePx: 16,
  subtitleTextColor: '#ffffff',
  subtitleFontFamily: 'system-ui',
  subtitlePositionX: 50,
  subtitlePositionY: 90,
  burnSubtitlesIntoVideo: true,
  recordingQuality: 'normal',
  sttSourceLanguage: '',
  sttLanguageHintsStrict: false,
  sttContextDomain: '',
  sttContextTopic: '',
  sttContextTerms: '',
  sttContextText: '',
  sttTranslationTargetLanguage: '',
  autoStopOnSilence: false,
  autoStopSilenceMinutes: 3,
  autoStopAudioSource: 'system',
  autoStopMicDeviceId: '',
};

async function probeWebmMetadata(blob) {
  try {
    const arr = await blob.arrayBuffer();
    const elements = new Decoder().decode(Buffer.from(arr));
    const reader = new Reader();
    reader.logging = false;
    for (const elm of elements) reader.read(elm);
    reader.stop();
    return {
      durationMs: Number(reader.duration) || 0,
      cuesCount: Array.isArray(reader.cues) ? reader.cues.length : 0,
    };
  } catch (_) {
    return { durationMs: 0, cuesCount: 0 };
  }
}

async function forceWebmDurationMs(blob, requestedDurationMs) {
  const targetMs = Number(requestedDurationMs) || 0;
  if (targetMs <= 0) return blob;
  try {
    const arr = await blob.arrayBuffer();
    const raw = Buffer.from(arr);
    const elements = new Decoder().decode(raw);
    const reader = new Reader();
    reader.logging = false;
    for (const elm of elements) reader.read(elm);
    reader.stop();
    if (!Number.isFinite(reader.metadataSize) || reader.metadataSize <= 0) {
      return blob;
    }
    const refinedMetadataBuf = tools.makeMetadataSeekable(
      reader.metadatas,
      targetMs,
      reader.cues
    );
    const body = raw.slice(reader.metadataSize);
    return new Blob([refinedMetadataBuf, body], { type: blob.type || 'video/webm' });
  } catch (_) {
    return blob;
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalizeSubtitleSettings() {
  const px = Number(appSettings.subtitleFontSizePx);
  appSettings.subtitleFontSizePx =
    Number.isFinite(px) ? Math.min(48, Math.max(10, Math.round(px))) : 16;
  const col =
    typeof appSettings.subtitleTextColor === 'string'
      ? appSettings.subtitleTextColor.trim()
      : '#ffffff';
  appSettings.subtitleTextColor = /^#[0-9A-Fa-f]{6}$/.test(col) ? col : '#ffffff';
  const allowedFonts = new Set([
    'system-ui',
    'serif',
    'monospace',
  ]);
  if (!allowedFonts.has(appSettings.subtitleFontFamily)) {
    appSettings.subtitleFontFamily = 'system-ui';
  }
  const x = Number(appSettings.subtitlePositionX);
  const y = Number(appSettings.subtitlePositionY);
  appSettings.subtitlePositionX = Number.isFinite(x)
    ? Math.min(100, Math.max(0, x))
    : 50;
  appSettings.subtitlePositionY = Number.isFinite(y)
    ? Math.min(100, Math.max(0, y))
    : 90;
  appSettings.burnSubtitlesIntoVideo =
    appSettings.burnSubtitlesIntoVideo === undefined
      ? true
      : Boolean(appSettings.burnSubtitlesIntoVideo);
}

function normalizeRecordingQuality() {
  appSettings.recordingQuality =
    appSettings.recordingQuality === 'balance' ||
    appSettings.recordingQuality === 'high'
      ? appSettings.recordingQuality
      : 'normal';
}

function normalizeUiTheme() {
  appSettings.uiTheme = appSettings.uiTheme === 'light' ? 'light' : 'dark';
}

function normalizeAutoStopSettings() {
  appSettings.autoStopOnSilence = Boolean(appSettings.autoStopOnSilence);
  const mins = Number(appSettings.autoStopSilenceMinutes);
  appSettings.autoStopSilenceMinutes =
    Number.isFinite(mins) && mins >= 0.5 ? Math.min(60, mins) : 3;
  appSettings.autoStopAudioSource =
    appSettings.autoStopAudioSource === 'mic' ? 'mic' : 'system';
  appSettings.autoStopMicDeviceId =
    typeof appSettings.autoStopMicDeviceId === 'string'
      ? appSettings.autoStopMicDeviceId
      : '';
}

function windowBackgroundForTheme(theme) {
  return theme === 'light' ? '#F8FAFC' : '#0F172A';
}

function applyMainWindowBackground() {
  if (!mainWindow) return;
  try {
    mainWindow.setBackgroundColor(windowBackgroundForTheme(appSettings.uiTheme));
  } catch (_) {}
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    appSettings = {
      ...appSettings,
      ...parsed,
    };
  } catch (_) {}
  normalizeSubtitleSettings();
  normalizeRecordingQuality();
  normalizeUiTheme();
  normalizeSttSettings();
  normalizeAutoStopSettings();
}

function saveSettings() {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(appSettings, null, 2), 'utf-8');
}

const APP_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');
const APP_DOCK_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.icns');

function resolveAudioCapPath() {
  const envPath = process.env.AUDIOCAP_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [
      path.join(
        __dirname,
        '..',
        '..',
        'wasapi-audiocap',
        'bin',
        'Release',
        'net8.0',
        'win-x64',
        'publish',
        'audiocap.exe'
      ),
      path.join(__dirname, '..', '..', 'audiocap-bin', 'win', 'audiocap.exe'),
      path.join(process.resourcesPath || '', 'audiocap', 'audiocap.exe'),
    ]
    : process.platform === 'darwin'
      ? [
        path.join(__dirname, '..', '..', 'swift-audiocap', '.build', 'apple', 'Products', 'Release', 'audiocap'),
        path.join(__dirname, '..', '..', 'swift-audiocap', '.build', 'release', 'audiocap'),
        path.join(__dirname, '..', '..', 'audiocap-bin', 'mac', 'audiocap'),
        path.join(process.resourcesPath || '', 'audiocap', 'audiocap'),
      ]
      : [];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function emitAudioCapLevelFromPcm(chunk) {
  if (!mainWindow || !chunk || chunk.length === 0) return;
  const merged = audioCapPcmRemainder.length
    ? Buffer.concat([audioCapPcmRemainder, chunk])
    : chunk;
  const sampleBytes = 2;
  const completeBytes = merged.length - (merged.length % sampleBytes);
  if (completeBytes <= 0) {
    audioCapPcmRemainder = merged;
    return;
  }
  audioCapPcmRemainder = merged.subarray(completeBytes);
  const frame = merged.subarray(0, completeBytes);
  let sumSquares = 0;
  let sampleCount = 0;
  for (let i = 0; i < frame.length; i += 2) {
    const sample = frame.readInt16LE(i) / 32768;
    sumSquares += sample * sample;
    sampleCount += 1;
  }
  if (sampleCount === 0) return;
  const rms = Math.sqrt(sumSquares / sampleCount);
  mainWindow.webContents.send('audiocap-level', { rms, sampleCount });
  mainWindow.webContents.send('audiocap-pcm', { chunk: Uint8Array.from(chunk) });
}

function stopAudioCapMonitor(force = false) {
  if (!force && !audioCapMonitorProcess) return;
  if (!audioCapMonitorProcess) return;
  audioCapMonitorStopping = true;
  try {
    audioCapMonitorProcess.kill('SIGTERM');
  } catch (_) {}
  audioCapMonitorProcess = null;
  audioCapPcmRemainder = Buffer.alloc(0);
}

function startAudioCapMonitor() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { ok: false, reason: 'unsupported-platform' };
  }
  const audioCapPath = resolveAudioCapPath();
  if (!audioCapPath) {
    return { ok: false, reason: 'audiocap-not-found' };
  }
  if (audioCapMonitorProcess) {
    return { ok: true, reused: true, path: audioCapPath };
  }
  const proc = spawn(audioCapPath, ['--sample-rate', '16000', '--channels', '1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  audioCapMonitorStopping = false;
  audioCapMonitorProcess = proc;
  audioCapPcmRemainder = Buffer.alloc(0);
  proc.stdout.on('data', (chunk) => emitAudioCapLevelFromPcm(chunk));
  proc.stderr.on('data', (d) => {
    const msg = String(d || '').trim();
    if (msg) {
      console.log('[audiocap]', msg);
    }
  });
  proc.on('exit', () => {
    audioCapMonitorProcess = null;
    audioCapPcmRemainder = Buffer.alloc(0);
    if (audioCapMonitorStopping) {
      audioCapMonitorStopping = false;
      return;
    }
    mainWindow?.webContents.send('audiocap-level-error', {
      reason: 'audiocap-exited',
    });
  });
  proc.on('error', (err) => {
    audioCapMonitorProcess = null;
    audioCapPcmRemainder = Buffer.alloc(0);
    mainWindow?.webContents.send('audiocap-level-error', {
      reason: err?.message || 'audiocap-spawn-failed',
    });
  });
  return { ok: true, reused: false, path: audioCapPath };
}

function createMainWindow() {
  normalizeUiTheme();
  const themeArg = appSettings.uiTheme === 'light' ? 'light' : 'dark';
  mainWindow = new BrowserWindow({
    width: 720,
    height: 860,
    minWidth: 560,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: windowBackgroundForTheme(themeArg),
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--ui-theme=${themeArg}`],
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    try {
      const { nativeImage } = require('electron');
      const dockIconPath = fs.existsSync(APP_DOCK_ICON_PATH)
        ? APP_DOCK_ICON_PATH
        : APP_ICON_PATH;
      app.dock.setIcon(nativeImage.createFromPath(dockIconPath));
    } catch (_) {}
  }

  loadSettings();
  createMainWindow();

  // Trigger macOS screen recording permission prompt
  const screenAccess = systemPreferences.getMediaAccessStatus('screen');
  console.log('[permission] Screen recording status:', screenAccess);
  if (screenAccess !== 'granted') {
    // Attempting to get sources will trigger the permission prompt
    try {
      await desktopCapturer.getSources({ types: ['screen'] });
    } catch (_) {}
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// ── Helper: get window → app name mapping via macOS JXA ─────────────────────

function getWindowOwnerMap() {
  try {
    const script = [
      'const se = Application("System Events");',
      'const procs = se.processes.whose({ visible: true })();',
      'const r = {};',
      'for (const p of procs) {',
      '  try {',
      '    const ws = p.windows();',
      '    for (const w of ws) {',
      '      const t = w.name();',
      '      if (t) r[t] = p.name();',
      '    }',
      '  } catch(e) {}',
      '}',
      'JSON.stringify(r);',
    ].join(' ');

    const out = execSync(`osascript -l JavaScript -e '${script}'`, {
      timeout: 3000,
      encoding: 'utf-8',
    }).trim();
    return JSON.parse(out);
  } catch (err) {
    console.warn('[getWindowOwnerMap] Failed:', err.message);
    return {};
  }
}

// ── IPC: Permission check ───────────────────────────────────────────────────

ipcMain.handle('check-screen-permission', () => {
  return systemPreferences.getMediaAccessStatus('screen');
});

/**
 * macOS / Windows: must call askForMediaAccess from main before getUserMedia(mic),
 * otherwise the renderer often gets NotAllowedError / permission denied.
 */
ipcMain.handle('request-microphone-permission', async () => {
  if (process.platform === 'linux') {
    return { ok: true, status: 'unknown' };
  }
  try {
    const before = systemPreferences.getMediaAccessStatus('microphone');
    if (before === 'granted') {
      return { ok: true, status: before };
    }
    const granted = await systemPreferences.askForMediaAccess('microphone');
    const after = systemPreferences.getMediaAccessStatus('microphone');
    return { ok: Boolean(granted), status: after };
  } catch (err) {
    console.error('[request-microphone-permission]', err);
    return { ok: false, status: 'unknown', reason: err.message };
  }
});

// ── IPC: Get capture sources ────────────────────────────────────────────────

/**
 * macOS + recent Electron: first getSources() call can return [] (race / TCC).
 * Retry a few times with short delays (see electron/electron#45181 and related).
 */
async function getDesktopSourcesWithRetry(type) {
  const types = type === 'window' ? ['window'] : ['screen'];
  const opts = {
    types,
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  };
  let last = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      last = await desktopCapturer.getSources(opts);
    } catch (e) {
      if (attempt === 3) throw e;
      last = [];
    }
    if (last.length > 0) return last;
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 120 + attempt * 80));
    }
  }
  return last;
}

ipcMain.handle('get-sources', async (_event, type) => {
  try {
    const sources = await getDesktopSourcesWithRetry(type);

    let ownerMap = {};
    if (type === 'window') {
      ownerMap = getWindowOwnerMap();
    }

    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      display_id: s.display_id,
      appName: type === 'window' ? (ownerMap[s.name] || 'Other') : undefined,
    }));
  } catch (err) {
    console.error('[get-sources] Error:', err.message);
    const access = systemPreferences.getMediaAccessStatus('screen');
    if (access !== 'granted') {
      throw new Error(
        'Screen recording permission not granted. Please enable it in System Settings > Privacy & Security > Screen Recording, then restart the app.'
      );
    }
    throw err;
  }
});

// ── IPC: Area selection overlay ─────────────────────────────────────────────

ipcMain.handle('start-area-selection', async () => {
  return new Promise((resolve) => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor;

    areaOverlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    areaOverlayWindow.setVisibleOnAllWorkspaces(true);
    areaOverlayWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'area-overlay.html')
    );

    ipcMain.once('area-selected', (_event, rect) => {
      if (areaOverlayWindow) {
        areaOverlayWindow.close();
        areaOverlayWindow = null;
      }
      resolve({ ...rect, scaleFactor });
    });

    ipcMain.once('area-cancelled', () => {
      if (areaOverlayWindow) {
        areaOverlayWindow.close();
        areaOverlayWindow = null;
      }
      resolve(null);
    });
  });
});

// ── IPC: Save recording (WebM) ──────────────────────────────────────────────

ipcMain.handle(
  'save-recording',
  async (_event, payload) => {
  const saveFlowStartedAt = Date.now();
  const logSaveFlow = (label, extra) => {
    const elapsed = Date.now() - saveFlowStartedAt;
    if (extra === undefined) {
      console.log(`[timing][main-save] +${elapsed}ms ${label}`);
      return;
    }
    console.log(`[timing][main-save] +${elapsed}ms ${label}`, extra);
  };
  const {
    buffer,
    subtitles,
    subtitleFormat,
    filePath: explicitPath,
    durationMs,
  } = payload;
  const silentAutoSave = Boolean(explicitPath);
  logSaveFlow('entered save-recording handler', {
    bufferBytes: buffer?.byteLength || 0,
    subtitleCount: Array.isArray(subtitles) ? subtitles.length : 0,
    durationMs: Number(durationMs) || 0,
  });

  const desktopPath = app.getPath('desktop');
  const defaultFolder =
    appSettings.outputFolder && fs.existsSync(appSettings.outputFolder)
      ? appSettings.outputFolder
      : desktopPath;

  let filePath = explicitPath;

  if (!filePath) {
    const { filePath: chosen, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Recording',
      defaultPath: path.join(defaultFolder, `recording-${Date.now()}.webm`),
      filters: [{ name: 'WebM Video', extensions: ['webm'] }],
    });

    if (canceled || !chosen) return { success: false, reason: 'cancelled' };
    filePath = chosen;
  }
  logSaveFlow('resolved output path', { filePath });

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (_) {}

  try {
    if (!silentAutoSave) {
      mainWindow?.webContents.send('save-progress', {
        stage: 'start',
        message: 'Fixing WebM metadata…',
        percent: null,
      });
    }
    const rawBlob = new Blob([Buffer.from(buffer)], { type: 'video/webm' });
    const metadataFixedBlob = await fixWebmMetaInfo(rawBlob);
    const requestedDurationMs = Number(durationMs) || 0;
    const finalBlob = await forceWebmDurationMs(
      metadataFixedBlob,
      requestedDurationMs
    );
    const metadataProbe = await probeWebmMetadata(finalBlob);
    const fixedBuffer = Buffer.from(await finalBlob.arrayBuffer());
    logSaveFlow('rebuilt WebM seek metadata', {
      filePath,
      inputBytes: buffer?.byteLength || 0,
      outputBytes: fixedBuffer.byteLength,
      requestedDurationMs,
      metadataDurationMs: metadataProbe.durationMs,
      cuesCount: metadataProbe.cuesCount,
    });
    fs.writeFileSync(filePath, fixedBuffer);
    logSaveFlow('wrote WebM output', { filePath });
    if (!silentAutoSave) {
      mainWindow?.webContents.send('save-progress', {
        stage: 'done',
        message: 'WebM saved',
        filePath,
        percent: 100,
      });
    }
    let subtitlePath = null;

    if (Array.isArray(subtitles) && subtitles.length > 0) {
      const ext = subtitleFormat === 'vtt' ? 'vtt' : 'srt';
      const subtitleContent =
        ext === 'vtt' ? buildVtt(subtitles) : buildSrt(subtitles);
      subtitlePath = filePath.replace(/\.webm$/i, `.${ext}`);
      fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
      logSaveFlow('wrote subtitle sidecar', { subtitlePath, ext });
    }

    logSaveFlow('save-recording complete', {
      totalDurationMs: Date.now() - saveFlowStartedAt,
      filePath,
      subtitlePath,
    });
    return { success: true, filePath, subtitlePath };
  } catch (err) {
    logSaveFlow('save-recording failed', {
      totalDurationMs: Date.now() - saveFlowStartedAt,
      reason: err.message || String(err),
    });
    if (!silentAutoSave) {
      mainWindow?.webContents.send('save-progress', {
        stage: 'error',
        message: err.message || String(err),
      });
    }
    return { success: false, reason: err.message };
  }
}
);

function validateSonioxKey() {
  const rawKey = appSettings.sonioxApiKey;
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Add your Soniox API key in Settings (Speech-to-Text).');
  }
  return key;
}

const STT_ALLOWED_LANGS = new Set([
  'en',
  'vi',
  'zh',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'pl',
  'ru',
  'hi',
  'th',
  'id',
  'ms',
  'tl',
  'ar',
  'tr',
  'uk',
  'sv',
  'da',
  'no',
  'fi',
  'cs',
  'ro',
  'el',
  'he',
  'hu',
]);

function normalizeSttState(s) {
  const raw =
    typeof s.sttSourceLanguage === 'string'
      ? s.sttSourceLanguage.trim().toLowerCase()
      : '';
  return {
    sttSourceLanguage:
      raw === '' || STT_ALLOWED_LANGS.has(raw) ? raw : 'en',
    sttLanguageHintsStrict: Boolean(s.sttLanguageHintsStrict),
    sttContextDomain:
      typeof s.sttContextDomain === 'string'
        ? s.sttContextDomain.trim().slice(0, 200)
        : '',
    sttContextTopic:
      typeof s.sttContextTopic === 'string'
        ? s.sttContextTopic.trim().slice(0, 200)
        : '',
    sttContextTerms:
      typeof s.sttContextTerms === 'string' ? s.sttContextTerms : '',
    sttContextText:
      typeof s.sttContextText === 'string' ? s.sttContextText : '',
    sttTranslationTargetLanguage: (() => {
      const raw =
        typeof s.sttTranslationTargetLanguage === 'string'
          ? s.sttTranslationTargetLanguage.trim().toLowerCase()
          : '';
      return raw === '' || STT_ALLOWED_LANGS.has(raw) ? raw : '';
    })(),
  };
}

function normalizeSttSettings() {
  const n = normalizeSttState(appSettings);
  appSettings.sttSourceLanguage = n.sttSourceLanguage;
  appSettings.sttLanguageHintsStrict = n.sttLanguageHintsStrict;
  appSettings.sttContextDomain = n.sttContextDomain;
  appSettings.sttContextTopic = n.sttContextTopic;
  appSettings.sttContextTerms = n.sttContextTerms;
  appSettings.sttContextText = n.sttContextText;
  appSettings.sttTranslationTargetLanguage = n.sttTranslationTargetLanguage;
}

function pickSttFromAppSettings() {
  return {
    sttSourceLanguage: appSettings.sttSourceLanguage || '',
    sttLanguageHintsStrict: Boolean(appSettings.sttLanguageHintsStrict),
    sttContextDomain: appSettings.sttContextDomain || '',
    sttContextTopic: appSettings.sttContextTopic || '',
    sttContextTerms: appSettings.sttContextTerms || '',
    sttContextText: appSettings.sttContextText || '',
    sttTranslationTargetLanguage: appSettings.sttTranslationTargetLanguage || '',
  };
}

/** Merge saved settings with optional preview/session overrides for one STT connection. */
function resolveSttStateForSession(sessionOverride) {
  normalizeSttSettings();
  const base = pickSttFromAppSettings();
  if (!sessionOverride || typeof sessionOverride !== 'object') {
    return normalizeSttState(base);
  }
  return normalizeSttState({ ...base, ...sessionOverride });
}

function buildSttLanguageHintsFromState(state) {
  const code = state.sttSourceLanguage;
  if (!code) return null;
  return [code];
}

function buildSttContextPayloadFromState(state) {
  const ctx = {};
  const general = [];
  if (state.sttContextDomain) {
    general.push({
      key: 'domain',
      value: state.sttContextDomain,
    });
  }
  if (state.sttContextTopic) {
    general.push({
      key: 'topic',
      value: state.sttContextTopic,
    });
  }
  if (general.length) ctx.general = general;
  const text = (state.sttContextText || '').trim();
  if (text) ctx.text = text.slice(0, 10000);
  const termsRaw = (state.sttContextTerms || '').trim();
  if (termsRaw) {
    ctx.terms = termsRaw
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 200);
  }
  return Object.keys(ctx).length > 0 ? ctx : null;
}

function buildTranslationConfigFromState(state) {
  const tgt = state.sttTranslationTargetLanguage;
  if (!tgt) return null;
  return {
    type: 'one_way',
    target_language: tgt,
  };
}

ipcMain.handle('settings-get', () => {
  normalizeSubtitleSettings();
  normalizeRecordingQuality();
  normalizeUiTheme();
  normalizeSttSettings();
  normalizeAutoStopSettings();
  return {
    sonioxApiKey: appSettings.sonioxApiKey || '',
    outputFolder: appSettings.outputFolder || '',
    uiTheme: appSettings.uiTheme === 'light' ? 'light' : 'dark',
    maxSegmentSizeMb:
      typeof appSettings.maxSegmentSizeMb === 'number'
        ? appSettings.maxSegmentSizeMb
        : Number(appSettings.maxSegmentSizeMb) || 0,
    subtitleFontSizePx: appSettings.subtitleFontSizePx,
    subtitleTextColor: appSettings.subtitleTextColor,
    subtitleFontFamily: appSettings.subtitleFontFamily,
    subtitlePositionX: appSettings.subtitlePositionX,
    subtitlePositionY: appSettings.subtitlePositionY,
    burnSubtitlesIntoVideo: appSettings.burnSubtitlesIntoVideo,
    recordingQuality: appSettings.recordingQuality,
    sttSourceLanguage: appSettings.sttSourceLanguage || '',
    sttLanguageHintsStrict: Boolean(appSettings.sttLanguageHintsStrict),
    sttContextDomain: appSettings.sttContextDomain || '',
    sttContextTopic: appSettings.sttContextTopic || '',
    sttContextTerms: appSettings.sttContextTerms || '',
    sttContextText: appSettings.sttContextText || '',
    sttTranslationTargetLanguage: appSettings.sttTranslationTargetLanguage || '',
    autoStopOnSilence: appSettings.autoStopOnSilence,
    autoStopSilenceMinutes: appSettings.autoStopSilenceMinutes,
    autoStopAudioSource: appSettings.autoStopAudioSource,
    autoStopMicDeviceId: appSettings.autoStopMicDeviceId,
  };
});

ipcMain.handle('settings-set', (_event, nextSettings) => {
  if (nextSettings?.uiTheme === 'light' || nextSettings?.uiTheme === 'dark') {
    appSettings.uiTheme = nextSettings.uiTheme;
    normalizeUiTheme();
  }
  const nextKey = typeof nextSettings?.sonioxApiKey === 'string'
    ? nextSettings.sonioxApiKey.trim()
    : '';
  const nextOutputFolder = typeof nextSettings?.outputFolder === 'string'
    ? nextSettings.outputFolder.trim()
    : '';
  const rawMb = nextSettings?.maxSegmentSizeMb;
  const nextMb =
    rawMb === '' || rawMb === undefined || rawMb === null
      ? 0
      : Math.max(0, Number(rawMb) || 0);
  appSettings.sonioxApiKey = nextKey;
  appSettings.outputFolder = nextOutputFolder;
  appSettings.maxSegmentSizeMb = nextMb;

  const px = Number(nextSettings?.subtitleFontSizePx);
  appSettings.subtitleFontSizePx = Number.isFinite(px)
    ? Math.min(48, Math.max(10, Math.round(px)))
    : appSettings.subtitleFontSizePx;
  const col =
    typeof nextSettings?.subtitleTextColor === 'string'
      ? nextSettings.subtitleTextColor.trim()
      : appSettings.subtitleTextColor;
  appSettings.subtitleTextColor = /^#[0-9A-Fa-f]{6}$/.test(col)
    ? col
    : appSettings.subtitleTextColor;
  const allowedFonts = new Set(['system-ui', 'serif', 'monospace']);
  const ff =
    typeof nextSettings?.subtitleFontFamily === 'string'
      ? nextSettings.subtitleFontFamily.trim()
      : '';
  appSettings.subtitleFontFamily = allowedFonts.has(ff)
    ? ff
    : appSettings.subtitleFontFamily;
  const sx = Number(nextSettings?.subtitlePositionX);
  const sy = Number(nextSettings?.subtitlePositionY);
  if (Number.isFinite(sx)) {
    appSettings.subtitlePositionX = Math.min(100, Math.max(0, sx));
  }
  if (Number.isFinite(sy)) {
    appSettings.subtitlePositionY = Math.min(100, Math.max(0, sy));
  }
  appSettings.burnSubtitlesIntoVideo = Boolean(
    nextSettings?.burnSubtitlesIntoVideo
  );
  appSettings.recordingQuality =
    nextSettings?.recordingQuality === 'balance' ||
    nextSettings?.recordingQuality === 'high'
      ? nextSettings.recordingQuality
      : 'normal';

  const rawLang =
    typeof nextSettings?.sttSourceLanguage === 'string'
      ? nextSettings.sttSourceLanguage.trim().toLowerCase()
      : '';
  appSettings.sttSourceLanguage =
    rawLang === '' || STT_ALLOWED_LANGS.has(rawLang) ? rawLang : 'en';
  appSettings.sttLanguageHintsStrict = Boolean(
    nextSettings?.sttLanguageHintsStrict
  );
  appSettings.sttContextDomain =
    typeof nextSettings?.sttContextDomain === 'string'
      ? nextSettings.sttContextDomain.trim().slice(0, 200)
      : '';
  appSettings.sttContextTopic =
    typeof nextSettings?.sttContextTopic === 'string'
      ? nextSettings.sttContextTopic.trim().slice(0, 200)
      : '';
  appSettings.sttContextTerms =
    typeof nextSettings?.sttContextTerms === 'string'
      ? nextSettings.sttContextTerms
      : '';
  appSettings.sttContextText =
    typeof nextSettings?.sttContextText === 'string'
      ? nextSettings.sttContextText
      : '';
  const rawTgt =
    typeof nextSettings?.sttTranslationTargetLanguage === 'string'
      ? nextSettings.sttTranslationTargetLanguage.trim().toLowerCase()
      : '';
  appSettings.sttTranslationTargetLanguage =
    rawTgt === '' || STT_ALLOWED_LANGS.has(rawTgt) ? rawTgt : '';
  normalizeSttSettings();

  appSettings.autoStopOnSilence = Boolean(nextSettings?.autoStopOnSilence);
  const rawAutoMins = Number(nextSettings?.autoStopSilenceMinutes);
  appSettings.autoStopSilenceMinutes =
    Number.isFinite(rawAutoMins) && rawAutoMins >= 0.5
      ? Math.min(60, rawAutoMins)
      : appSettings.autoStopSilenceMinutes;
  appSettings.autoStopAudioSource =
    nextSettings?.autoStopAudioSource === 'mic' ? 'mic' : 'system';
  appSettings.autoStopMicDeviceId =
    typeof nextSettings?.autoStopMicDeviceId === 'string'
      ? nextSettings.autoStopMicDeviceId
      : '';
  normalizeAutoStopSettings();

  saveSettings();
  applyMainWindowBackground();
  return { success: true };
});

ipcMain.handle('get-auto-part-path', (_event, { sessionId, partIndex }) => {
  const desktopPath = app.getPath('desktop');
  const defaultFolder =
    appSettings.outputFolder && fs.existsSync(appSettings.outputFolder)
      ? appSettings.outputFolder
      : desktopPath;
  const name = `recording-${sessionId}-part${partIndex}.webm`;
  return { filePath: path.join(defaultFolder, name) };
});

ipcMain.handle('settings-pick-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select default output folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, folderPath: result.filePaths[0] };
});

ipcMain.handle('stt-start', (_event, options = {}) => {
  const apiKey = validateSonioxKey();
  const sttState = resolveSttStateForSession(options?.sessionStt);
  const translationConfig = buildTranslationConfigFromState(sttState);
  sttSession = new SonioxClient({
    apiKey,
    wsUrl: process.env.SONIOX_WS_URL,
    languageHints: buildSttLanguageHintsFromState(sttState),
    languageHintsStrict: Boolean(sttState.sttLanguageHintsStrict),
    contextPayload: buildSttContextPayloadFromState(sttState),
    translationConfig,
  });

  sttSession.startSession({
    onTranscript: (payload) => {
      mainWindow?.webContents.send('stt-update', payload);
    },
    onError: (reason) => {
      mainWindow?.webContents.send('stt-error', { reason });
    },
  });

  return { success: true };
});

ipcMain.on('stt-audio-chunk', (_event, { chunk }) => {
  if (!sttSession || !chunk) return;
  sttSession.sendAudioChunk(chunk);
});

ipcMain.handle('stt-stop', () => {
  if (!sttSession) {
    return { transcript: '', segments: [] };
  }
  const result = sttSession.stopSession();
  sttSession = null;
  return result;
});

ipcMain.handle('stt-check-config', () => {
  try {
    validateSonioxKey();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
});

ipcMain.handle('audiocap-level-start', () => {
  return startAudioCapMonitor();
});

ipcMain.handle('audiocap-level-stop', () => {
  stopAudioCapMonitor();
  return { ok: true };
});

// ── IPC: Window controls ────────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => mainWindow?.close());

app.on('before-quit', () => {
  stopAudioCapMonitor(true);
});

module.exports = {
  __test: {
    windowBackgroundForTheme,
    normalizeSttState,
    buildSttLanguageHintsFromState,
    buildSttContextPayloadFromState,
    buildTranslationConfigFromState,
    resolveSttStateForSession,
  },
};
