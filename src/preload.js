const path = require('path');
const { pathToFileURL } = require('url');
const { contextBridge, ipcRenderer } = require('electron');

function readInitialUiTheme() {
  try {
    const arg = process.argv.find((a) => String(a).startsWith('--ui-theme='));
    if (arg) {
      const v = String(arg).slice('--ui-theme='.length);
      if (v === 'light' || v === 'dark') return v;
    }
  } catch (_) {}
  return 'dark';
}

contextBridge.exposeInMainWorld('__initialUiTheme', readInitialUiTheme());

const onnxWasmDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'onnxruntime-web',
  'dist'
);

contextBridge.exposeInMainWorld('vadEnv', {
  /** Directory URL (trailing slash) for onnxruntime WASM — required by Silero VAD */
  onnxWasmBaseUrl: pathToFileURL(path.join(onnxWasmDir, path.sep)).href,
});

contextBridge.exposeInMainWorld('electronAPI', {
  checkScreenPermission: () => ipcRenderer.invoke('check-screen-permission'),
  requestMicrophonePermission: () =>
    ipcRenderer.invoke('request-microphone-permission'),
  getSources: (type) => ipcRenderer.invoke('get-sources', type),
  startAreaSelection: () => ipcRenderer.invoke('start-area-selection'),
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  checkSttConfig: () => ipcRenderer.invoke('stt-check-config'),
  sttStart: (options) => ipcRenderer.invoke('stt-start', options),
  sttStop: () => ipcRenderer.invoke('stt-stop'),
  sttAudioChunk: (chunk) => ipcRenderer.send('stt-audio-chunk', { chunk }),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings-set', settings),
  pickOutputFolder: () => ipcRenderer.invoke('settings-pick-output-folder'),
  getAutoPartPath: (payload) =>
    ipcRenderer.invoke('get-auto-part-path', payload),
  startAudioCapLevelMonitor: () => ipcRenderer.invoke('audiocap-level-start'),
  stopAudioCapLevelMonitor: () => ipcRenderer.invoke('audiocap-level-stop'),

  // area overlay → main
  areaSelected: (rect) => ipcRenderer.send('area-selected', rect),
  areaCancelled: () => ipcRenderer.send('area-cancelled'),

  // window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  // listen for conversion progress
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', (_event, msg) => callback(msg));
  },
  onSaveProgress: (callback) => {
    ipcRenderer.on('save-progress', (_event, payload) => callback(payload));
  },
  onBurnProgress: (callback) => {
    ipcRenderer.on('burn-progress', (_event, payload) => callback(payload));
  },
  onSttUpdate: (callback) => {
    ipcRenderer.on('stt-update', (_event, payload) => callback(payload));
  },
  onSttError: (callback) => {
    ipcRenderer.on('stt-error', (_event, payload) => callback(payload));
  },
  onAudioCapLevel: (callback) => {
    ipcRenderer.on('audiocap-level', (_event, payload) => callback(payload));
  },
  onAudioCapPcm: (callback) => {
    ipcRenderer.on('audiocap-pcm', (_event, payload) => callback(payload));
  },
  onAudioCapLevelError: (callback) => {
    ipcRenderer.on('audiocap-level-error', (_event, payload) => callback(payload));
  },
});
