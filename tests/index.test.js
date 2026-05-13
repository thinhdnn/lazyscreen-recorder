const mockHandle = jest.fn();
const mockOn = jest.fn();
const mockOnce = jest.fn();
const mockGetMediaAccessStatus = jest.fn(() => 'granted');
const mockAskForMediaAccess = jest.fn(async () => true);
const mockDesktopGetSources = jest.fn(async () => []);
const mockShowOpenDialog = jest.fn(async () => ({ canceled: true, filePaths: [] }));
const mockShowSaveDialog = jest.fn(async () => ({ canceled: true }));
const mockFixWebmMetaInfo = jest.fn(async (blob) => blob);
const mockSpawn = jest.fn();

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

jest.mock('child_process', () => {
  const EventEmitter = require('events');
  return {
    execSync: jest.fn(() => ''),
    spawn: (...args) => mockSpawn(...args),
  };
});

jest.mock('../src/main/soniox', () => ({
  SonioxClient: jest.fn(),
}));
jest.mock('../src/main/subtitles', () => ({
  buildSrt: jest.fn(() => '1\n00:00:00,000 --> 00:00:01,000\nHello\n'),
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
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(() => {
      const EventEmitter = require('events');
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('time=00:00:01.00'));
        child.emit('close', 0);
      });
      return child;
    });
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

  test('normalizeSelectedArea offsets overlay-local rect by display bounds', () => {
    const { normalizeSelectedArea } = getTestHelpers();
    expect(
      normalizeSelectedArea(
        { x: 20, y: 30, width: 300, height: 200 },
        {
          id: 42,
          scaleFactor: 2,
          bounds: { x: -1440, y: 120, width: 1440, height: 900 },
        }
      )
    ).toEqual({
      x: -1420,
      y: 150,
      width: 300,
      height: 200,
      scaleFactor: 2,
      displayId: 42,
      displayBounds: { x: -1440, y: 120, width: 1440, height: 900 },
    });
  });

  test('mergeSubtitleSegmentsForBurn groups nearby speech into one held subtitle', () => {
    const { mergeSubtitleSegmentsForBurn } = getTestHelpers();
    expect(
      mergeSubtitleSegmentsForBurn([
        { startMs: 1000, endMs: 1500, text: 'We can set' },
        { startMs: 2300, endMs: 2800, text: 'the value has changed.' },
        { startMs: 7000, endMs: 7600, text: 'Next sentence.' },
      ])
    ).toEqual([
      {
        startMs: 1000,
        endMs: 4800,
        text: 'We can set the value has changed.',
      },
      {
        startMs: 7000,
        endMs: 9600,
        text: 'Next sentence.',
      },
    ]);
  });

  test('mergeSubtitleSegmentsForBurn adds a period when speech text has no punctuation', () => {
    const { mergeSubtitleSegmentsForBurn } = getTestHelpers();
    expect(
      mergeSubtitleSegmentsForBurn([
        { startMs: 0, endMs: 1000, text: 'hello world' },
      ])
    ).toEqual([{ startMs: 0, endMs: 3000, text: 'hello world.' }]);
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
      burnedSubtitles: false,
    });

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  test('save-recording burns speech subtitles into MP4 when requested', async () => {
    loadIndex();
    const handlers = getHandleMap();
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: '/tmp/recording.mp4',
    });
    const fs = require('fs');
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    const mkdtempSpy = jest
      .spyOn(fs, 'mkdtempSync')
      .mockImplementation(() => '/tmp/lazyscreen-burn-test');
    const rmSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

    const result = await handlers['save-recording'](null, {
      buffer: new Uint8Array([1, 2, 3, 4]).buffer,
      durationMs: 1000,
      subtitles: [
        { index: 0, text: 'Hello', startMs: 0, endMs: 400 },
        { index: 1, text: 'world', startMs: 1000, endMs: 1400 },
      ],
      subtitleFormat: 'srt',
      burnSubtitlesIntoVideo: true,
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('ffmpeg'),
      expect.arrayContaining([
        '-i',
        '/tmp/lazyscreen-burn-test/input.webm',
        '-vf',
        expect.stringContaining("drawtext="),
        '/tmp/recording.mp4',
      ]),
      { windowsHide: true }
    );
    expect(mockSpawn.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("textfile='/tmp/lazyscreen-burn-test/subtitle-0.txt'"),
      ])
    );
    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/lazyscreen-burn-test/input.webm',
      expect.any(Buffer)
    );
    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/lazyscreen-burn-test/subtitle-0.txt',
      'Hello world.',
      'utf-8'
    );
    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/lazyscreen-burn-test/subtitles.srt',
      expect.any(String),
      'utf-8'
    );
    expect(rmSpy).toHaveBeenCalledWith('/tmp/lazyscreen-burn-test', {
      recursive: true,
      force: true,
    });
    expect(result).toEqual({
      success: true,
      filePath: '/tmp/recording.mp4',
      subtitlePath: null,
      burnedSubtitles: true,
    });

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
    mkdtempSpy.mockRestore();
    rmSpy.mockRestore();
  });
});
