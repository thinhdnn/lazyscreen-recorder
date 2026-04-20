const mockHandle = jest.fn();
const mockOn = jest.fn();
const mockOnce = jest.fn();
const mockGetMediaAccessStatus = jest.fn(() => 'granted');
const mockAskForMediaAccess = jest.fn(async () => true);
const mockDesktopGetSources = jest.fn(async () => []);
const mockShowOpenDialog = jest.fn(async () => ({ canceled: true, filePaths: [] }));
const mockShowSaveDialog = jest.fn(async () => ({ canceled: true }));
const mockFixWebmMetaInfo = jest.fn(async (blob) => blob);

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => {
      if (name === 'userData') return '/tmp';
      if (name === 'desktop') return '/tmp';
      if (name === 'temp') return '/tmp';
      return '/tmp';
    }),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn(),
    on: jest.fn(),
    setBackgroundColor: jest.fn(),
    webContents: { send: jest.fn() },
  })),
  ipcMain: {
    handle: (...args) => mockHandle(...args),
    on: (...args) => mockOn(...args),
    once: (...args) => mockOnce(...args),
  },
  desktopCapturer: {
    getSources: (...args) => mockDesktopGetSources(...args),
  },
  dialog: {
    showSaveDialog: (...args) => mockShowSaveDialog(...args),
    showOpenDialog: (...args) => mockShowOpenDialog(...args),
  },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({ size: { width: 100, height: 100 }, scaleFactor: 2 })),
  },
  systemPreferences: {
    getMediaAccessStatus: (...args) => mockGetMediaAccessStatus(...args),
    askForMediaAccess: (...args) => mockAskForMediaAccess(...args),
  },
}));

jest.mock('../src/main/soniox', () => ({
  SonioxClient: jest.fn(),
}));
jest.mock('../src/main/subtitles', () => ({
  buildSrt: jest.fn(() => ''),
  buildVtt: jest.fn(() => ''),
}));
jest.mock('../src/main/settings-utils', () => ({}));
jest.mock('fix-webm-metainfo', () => ({
  __esModule: true,
  default: (...args) => mockFixWebmMetaInfo(...args),
}));
jest.mock('ts-ebml', () => ({
  Decoder: class {
    decode() {
      return [];
    }
  },
  Reader: class {
    constructor() {
      this.duration = 0;
      this.cues = [];
      this.metadatas = [];
      this.metadataSize = 0;
      this.logging = false;
    }
    read() {}
    stop() {}
  },
  tools: {
    makeMetadataSeekable: jest.fn(() => Buffer.from([])),
  },
}));

describe('main/index helper logic', () => {
  const loadIndex = () => require('../src/main/index');
  const getTestHelpers = () => loadIndex().__test;
  const getHandleMap = () => {
    const map = {};
    for (const [channel, fn] of mockHandle.mock.calls) {
      map[channel] = fn;
    }
    return map;
  };

  beforeEach(() => {
    jest.resetModules();
    mockHandle.mockReset();
    mockOn.mockReset();
    mockOnce.mockReset();
    mockGetMediaAccessStatus.mockReset();
    mockGetMediaAccessStatus.mockReturnValue('granted');
    mockAskForMediaAccess.mockReset();
    mockAskForMediaAccess.mockResolvedValue(true);
    mockDesktopGetSources.mockReset();
    mockDesktopGetSources.mockResolvedValue([]);
    mockShowOpenDialog.mockReset();
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    mockShowSaveDialog.mockReset();
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    mockFixWebmMetaInfo.mockReset();
    mockFixWebmMetaInfo.mockImplementation(async (blob) => blob);
  });

  test('windowBackgroundForTheme returns expected colors', () => {
    const { windowBackgroundForTheme } = getTestHelpers();
    expect(windowBackgroundForTheme('light')).toBe('#F8FAFC');
    expect(windowBackgroundForTheme('dark')).toBe('#0F172A');
  });

  test('normalizeSttState sanitizes language, flags and text fields', () => {
    const { normalizeSttState } = getTestHelpers();
    const result = normalizeSttState({
      sttSourceLanguage: 'ZZ',
      sttLanguageHintsStrict: 1,
      sttContextDomain: '  demo  ',
      sttContextTopic: 'topic',
      sttContextTerms: null,
      sttContextText: 99,
      sttTranslationTargetLanguage: 'xx',
    });
    expect(result).toEqual({
      sttSourceLanguage: 'en',
      sttLanguageHintsStrict: true,
      sttContextDomain: 'demo',
      sttContextTopic: 'topic',
      sttContextTerms: '',
      sttContextText: '',
      sttTranslationTargetLanguage: '',
    });
  });

  test('buildSttLanguageHintsFromState returns null or single-item list', () => {
    const { buildSttLanguageHintsFromState } = getTestHelpers();
    expect(buildSttLanguageHintsFromState({ sttSourceLanguage: '' })).toBeNull();
    expect(buildSttLanguageHintsFromState({ sttSourceLanguage: 'vi' })).toEqual(['vi']);
  });

  test('buildSttContextPayloadFromState maps general/text/terms correctly', () => {
    const { buildSttContextPayloadFromState } = getTestHelpers();
    const payload = buildSttContextPayloadFromState({
      sttContextDomain: 'healthcare',
      sttContextTopic: 'meeting',
      sttContextText: ' background ',
      sttContextTerms: 'A, B\nC',
    });
    expect(payload).toEqual({
      general: [
        { key: 'domain', value: 'healthcare' },
        { key: 'topic', value: 'meeting' },
      ],
      text: 'background',
      terms: ['A', 'B', 'C'],
    });
  });

  test('buildTranslationConfigFromState toggles one-way translation', () => {
    const { buildTranslationConfigFromState } = getTestHelpers();
    expect(buildTranslationConfigFromState({ sttTranslationTargetLanguage: '' })).toBeNull();
    expect(buildTranslationConfigFromState({ sttTranslationTargetLanguage: 'en' })).toEqual({
      type: 'one_way',
      target_language: 'en',
    });
  });

  test('resolveSttStateForSession applies override and normalization', () => {
    const { resolveSttStateForSession } = getTestHelpers();
    const result = resolveSttStateForSession({
      sttSourceLanguage: 'VI',
      sttContextDomain: '  my-domain ',
      sttTranslationTargetLanguage: 'EN',
    });
    expect(result.sttSourceLanguage).toBe('vi');
    expect(result.sttContextDomain).toBe('my-domain');
    expect(result.sttTranslationTargetLanguage).toBe('en');
  });

  test('request-microphone-permission returns granted without prompting', async () => {
    loadIndex();
    const handlers = getHandleMap();
    mockGetMediaAccessStatus.mockImplementation((kind) =>
      kind === 'microphone' ? 'granted' : 'granted'
    );
    const result = await handlers['request-microphone-permission']();
    expect(result).toEqual({ ok: true, status: 'granted' });
    expect(mockAskForMediaAccess).not.toHaveBeenCalled();
  });

  test('settings-get and settings-set handlers normalize values', async () => {
    loadIndex();
    const handlers = getHandleMap();
    await handlers['settings-set'](null, {
      uiTheme: 'light',
      sonioxApiKey: '  key  ',
      outputFolder: '  /tmp/out  ',
      subtitleFontSizePx: 100,
      subtitleTextColor: '#ABCDEF',
      subtitleFontFamily: 'monospace',
      subtitlePositionX: 110,
      subtitlePositionY: -10,
      burnSubtitlesIntoVideo: false,
      recordingQuality: 'high',
      sttSourceLanguage: 'vi',
      sttLanguageHintsStrict: 1,
      sttContextDomain: 'x',
      sttContextTopic: 'y',
      sttContextTerms: 'a,b',
      sttContextText: 'txt',
      sttTranslationTargetLanguage: 'en',
      autoStopOnSilence: true,
      autoStopSilenceMinutes: 2,
      autoStopAudioSource: 'mic',
      autoStopMicDeviceId: 'mic-device-1',
    });
    const settings = handlers['settings-get']();
    expect(settings.uiTheme).toBe('light');
    expect(settings.sonioxApiKey).toBe('key');
    expect(settings.subtitleFontSizePx).toBe(48);
    expect(settings.subtitlePositionX).toBe(100);
    expect(settings.subtitlePositionY).toBe(0);
    expect(settings.recordingQuality).toBe('high');
    expect(settings.autoStopOnSilence).toBe(true);
    expect(settings.autoStopAudioSource).toBe('mic');
    expect(settings.autoStopMicDeviceId).toBe('mic-device-1');
  });

  test('settings-pick-output-folder returns selected path', async () => {
    loadIndex();
    const handlers = getHandleMap();
    mockShowOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/tmp/records'],
    });
    const result = await handlers['settings-pick-output-folder']();
    expect(result).toEqual({ canceled: false, folderPath: '/tmp/records' });
  });

  test('save-recording rebuilds WebM metadata before writing file', async () => {
    loadIndex();
    const handlers = getHandleMap();
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: '/tmp/recording.webm',
    });
    const fs = require('fs');
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

    const result = await handlers['save-recording'](null, {
      buffer: new Uint8Array([1, 2, 3, 4]).buffer,
      durationMs: 4321,
      subtitles: [],
      subtitleFormat: 'srt',
    });

    expect(mockFixWebmMetaInfo).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('/tmp/recording.webm', expect.any(Buffer));
    expect(result).toEqual({
      success: true,
      filePath: '/tmp/recording.webm',
      subtitlePath: null,
    });

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
  });
});
