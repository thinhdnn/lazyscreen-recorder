const {
  STT_ALLOWED_LANGS,
  normalizeSubtitleSettings,
  normalizeRecordingQuality,
  normalizeUiTheme,
  windowBackgroundForTheme,
  normalizeSttState,
  validateSonioxKey,
  buildSttLanguageHintsFromState,
  buildSttContextPayloadFromState,
  buildTranslationConfigFromState,
} = require('../src/main/settings-utils');

// ─── normalizeSubtitleSettings ──────────────────────────────────────────────

describe('normalizeSubtitleSettings', () => {
  test('clamps font size to valid range [10, 48]', () => {
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: 5 }).subtitleFontSizePx).toBe(10);
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: 100 }).subtitleFontSizePx).toBe(48);
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: 24 }).subtitleFontSizePx).toBe(24);
  });

  test('rounds font size to integer', () => {
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: 16.7 }).subtitleFontSizePx).toBe(17);
  });

  test('defaults font size to 16 for NaN', () => {
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: 'abc' }).subtitleFontSizePx).toBe(16);
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: NaN }).subtitleFontSizePx).toBe(16);
    expect(normalizeSubtitleSettings({ subtitleFontSizePx: Infinity }).subtitleFontSizePx).toBe(16);
  });

  test('validates hex color format', () => {
    expect(normalizeSubtitleSettings({ subtitleTextColor: '#ff0000' }).subtitleTextColor).toBe('#ff0000');
    expect(normalizeSubtitleSettings({ subtitleTextColor: '#FF00FF' }).subtitleTextColor).toBe('#FF00FF');
    expect(normalizeSubtitleSettings({ subtitleTextColor: 'red' }).subtitleTextColor).toBe('#ffffff');
    expect(normalizeSubtitleSettings({ subtitleTextColor: '#fff' }).subtitleTextColor).toBe('#ffffff');
    expect(normalizeSubtitleSettings({ subtitleTextColor: '' }).subtitleTextColor).toBe('#ffffff');
  });

  test('defaults color to #ffffff for non-string', () => {
    expect(normalizeSubtitleSettings({ subtitleTextColor: 123 }).subtitleTextColor).toBe('#ffffff');
    expect(normalizeSubtitleSettings({ subtitleTextColor: null }).subtitleTextColor).toBe('#ffffff');
  });

  test('allows valid font families only', () => {
    expect(normalizeSubtitleSettings({ subtitleFontFamily: 'system-ui' }).subtitleFontFamily).toBe('system-ui');
    expect(normalizeSubtitleSettings({ subtitleFontFamily: 'serif' }).subtitleFontFamily).toBe('serif');
    expect(normalizeSubtitleSettings({ subtitleFontFamily: 'monospace' }).subtitleFontFamily).toBe('monospace');
    expect(normalizeSubtitleSettings({ subtitleFontFamily: 'Comic Sans' }).subtitleFontFamily).toBe('system-ui');
    expect(normalizeSubtitleSettings({ subtitleFontFamily: '' }).subtitleFontFamily).toBe('system-ui');
  });

  test('clamps position X to [0, 100]', () => {
    expect(normalizeSubtitleSettings({ subtitlePositionX: -10 }).subtitlePositionX).toBe(0);
    expect(normalizeSubtitleSettings({ subtitlePositionX: 200 }).subtitlePositionX).toBe(100);
    expect(normalizeSubtitleSettings({ subtitlePositionX: 50 }).subtitlePositionX).toBe(50);
  });

  test('defaults position X to 50 for NaN', () => {
    expect(normalizeSubtitleSettings({ subtitlePositionX: 'abc' }).subtitlePositionX).toBe(50);
  });

  test('clamps position Y to [0, 100]', () => {
    expect(normalizeSubtitleSettings({ subtitlePositionY: -5 }).subtitlePositionY).toBe(0);
    expect(normalizeSubtitleSettings({ subtitlePositionY: 150 }).subtitlePositionY).toBe(100);
    expect(normalizeSubtitleSettings({ subtitlePositionY: 90 }).subtitlePositionY).toBe(90);
  });

  test('defaults position Y to 90 for NaN', () => {
    expect(normalizeSubtitleSettings({ subtitlePositionY: undefined }).subtitlePositionY).toBe(90);
  });

  test('coerces burnSubtitlesIntoVideo to boolean', () => {
    expect(normalizeSubtitleSettings({ burnSubtitlesIntoVideo: 1 }).burnSubtitlesIntoVideo).toBe(true);
    expect(normalizeSubtitleSettings({ burnSubtitlesIntoVideo: 0 }).burnSubtitlesIntoVideo).toBe(false);
    expect(normalizeSubtitleSettings({ burnSubtitlesIntoVideo: '' }).burnSubtitlesIntoVideo).toBe(false);
    expect(normalizeSubtitleSettings({ burnSubtitlesIntoVideo: 'yes' }).burnSubtitlesIntoVideo).toBe(true);
  });
});

// ─── normalizeRecordingQuality ──────────────────────────────────────────────

describe('normalizeRecordingQuality', () => {
  test('returns compact for compact', () => {
    expect(normalizeRecordingQuality('compact')).toBe('compact');
  });

  test('returns normal for normal', () => {
    expect(normalizeRecordingQuality('normal')).toBe('normal');
  });

  test('returns normal for unknown values', () => {
    expect(normalizeRecordingQuality('ultra')).toBe('normal');
    expect(normalizeRecordingQuality(undefined)).toBe('normal');
    expect(normalizeRecordingQuality('')).toBe('normal');
  });
});

// ─── normalizeUiTheme ───────────────────────────────────────────────────────

describe('normalizeUiTheme', () => {
  test('returns light for light', () => {
    expect(normalizeUiTheme('light')).toBe('light');
  });

  test('returns dark for dark', () => {
    expect(normalizeUiTheme('dark')).toBe('dark');
  });

  test('defaults to dark for unknown values', () => {
    expect(normalizeUiTheme('neon')).toBe('dark');
    expect(normalizeUiTheme(undefined)).toBe('dark');
    expect(normalizeUiTheme('')).toBe('dark');
  });
});

// ─── windowBackgroundForTheme ───────────────────────────────────────────────

describe('windowBackgroundForTheme', () => {
  test('returns light background for light theme', () => {
    expect(windowBackgroundForTheme('light')).toBe('#F8FAFC');
  });

  test('returns dark background for dark theme', () => {
    expect(windowBackgroundForTheme('dark')).toBe('#0F172A');
  });

  test('returns dark background for unknown theme', () => {
    expect(windowBackgroundForTheme('auto')).toBe('#0F172A');
  });
});

// ─── normalizeSttState ──────────────────────────────────────────────────────

describe('normalizeSttState', () => {
  test('accepts empty language (auto-detect)', () => {
    const result = normalizeSttState({ sttSourceLanguage: '' });
    expect(result.sttSourceLanguage).toBe('');
  });

  test('accepts allowed languages', () => {
    expect(normalizeSttState({ sttSourceLanguage: 'en' }).sttSourceLanguage).toBe('en');
    expect(normalizeSttState({ sttSourceLanguage: 'vi' }).sttSourceLanguage).toBe('vi');
    expect(normalizeSttState({ sttSourceLanguage: 'ja' }).sttSourceLanguage).toBe('ja');
  });

  test('normalizes case and trims', () => {
    expect(normalizeSttState({ sttSourceLanguage: ' EN ' }).sttSourceLanguage).toBe('en');
    expect(normalizeSttState({ sttSourceLanguage: 'Vi' }).sttSourceLanguage).toBe('vi');
  });

  test('falls back to en for unknown language', () => {
    expect(normalizeSttState({ sttSourceLanguage: 'xx' }).sttSourceLanguage).toBe('en');
    expect(normalizeSttState({ sttSourceLanguage: 'klingon' }).sttSourceLanguage).toBe('en');
  });

  test('defaults non-string language to empty', () => {
    expect(normalizeSttState({ sttSourceLanguage: 123 }).sttSourceLanguage).toBe('');
    expect(normalizeSttState({ sttSourceLanguage: null }).sttSourceLanguage).toBe('');
    expect(normalizeSttState({}).sttSourceLanguage).toBe('');
  });

  test('coerces languageHintsStrict to boolean', () => {
    expect(normalizeSttState({ sttLanguageHintsStrict: 1 }).sttLanguageHintsStrict).toBe(true);
    expect(normalizeSttState({ sttLanguageHintsStrict: 0 }).sttLanguageHintsStrict).toBe(false);
    expect(normalizeSttState({}).sttLanguageHintsStrict).toBe(false);
  });

  test('trims and truncates context domain to 200 chars', () => {
    expect(normalizeSttState({ sttContextDomain: '  tech  ' }).sttContextDomain).toBe('tech');
    const long = 'a'.repeat(300);
    expect(normalizeSttState({ sttContextDomain: long }).sttContextDomain).toHaveLength(200);
  });

  test('trims and truncates context topic to 200 chars', () => {
    const long = 'b'.repeat(300);
    expect(normalizeSttState({ sttContextTopic: long }).sttContextTopic).toHaveLength(200);
  });

  test('passes through context terms as string', () => {
    expect(normalizeSttState({ sttContextTerms: 'a,b,c' }).sttContextTerms).toBe('a,b,c');
    expect(normalizeSttState({ sttContextTerms: 123 }).sttContextTerms).toBe('');
  });

  test('passes through context text as string', () => {
    expect(normalizeSttState({ sttContextText: 'some context' }).sttContextText).toBe('some context');
    expect(normalizeSttState({ sttContextText: null }).sttContextText).toBe('');
  });

  test('normalizes translation target language', () => {
    expect(normalizeSttState({ sttTranslationTargetLanguage: 'vi' }).sttTranslationTargetLanguage).toBe('vi');
    expect(normalizeSttState({ sttTranslationTargetLanguage: '' }).sttTranslationTargetLanguage).toBe('');
    expect(normalizeSttState({ sttTranslationTargetLanguage: 'xyz' }).sttTranslationTargetLanguage).toBe('');
  });
});

// ─── validateSonioxKey ──────────────────────────────────────────────────────

describe('validateSonioxKey', () => {
  test('returns trimmed key for valid input', () => {
    expect(validateSonioxKey('  my-api-key  ')).toBe('my-api-key');
  });

  test('throws for empty key', () => {
    expect(() => validateSonioxKey('')).toThrow('Soniox API key');
    expect(() => validateSonioxKey('  ')).toThrow('Soniox API key');
  });

  test('throws for undefined/null string values', () => {
    expect(() => validateSonioxKey('undefined')).toThrow('Soniox API key');
    expect(() => validateSonioxKey('null')).toThrow('Soniox API key');
  });

  test('throws for non-string input', () => {
    expect(() => validateSonioxKey(undefined)).toThrow('Soniox API key');
    expect(() => validateSonioxKey(null)).toThrow('Soniox API key');
    expect(() => validateSonioxKey(123)).toThrow('Soniox API key');
  });
});

// ─── buildSttLanguageHintsFromState ─────────────────────────────────────────

describe('buildSttLanguageHintsFromState', () => {
  test('returns null when no language code', () => {
    expect(buildSttLanguageHintsFromState({ sttSourceLanguage: '' })).toBeNull();
  });

  test('returns array with language code', () => {
    expect(buildSttLanguageHintsFromState({ sttSourceLanguage: 'en' })).toEqual(['en']);
  });
});

// ─── buildSttContextPayloadFromState ────────────────────────────────────────

describe('buildSttContextPayloadFromState', () => {
  test('returns null when all context fields are empty', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: '',
      sttContextText: '',
      sttContextTerms: '',
    });
    expect(result).toBeNull();
  });

  test('builds general array with domain', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: 'technology',
      sttContextTopic: '',
      sttContextText: '',
      sttContextTerms: '',
    });
    expect(result.general).toEqual([
      { key: 'domain', value: 'technology' },
    ]);
  });

  test('builds general array with topic', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: 'machine learning',
      sttContextText: '',
      sttContextTerms: '',
    });
    expect(result.general).toEqual([
      { key: 'topic', value: 'machine learning' },
    ]);
  });

  test('builds general array with both domain and topic', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: 'tech',
      sttContextTopic: 'AI',
      sttContextText: '',
      sttContextTerms: '',
    });
    expect(result.general).toHaveLength(2);
  });

  test('includes text field truncated to 10000 chars', () => {
    const longText = 'x'.repeat(20000);
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: '',
      sttContextText: longText,
      sttContextTerms: '',
    });
    expect(result.text).toHaveLength(10000);
  });

  test('parses terms from comma/newline separated string', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: '',
      sttContextText: '',
      sttContextTerms: 'React, Vue\nAngular,,Svelte',
    });
    expect(result.terms).toEqual(['React', 'Vue', 'Angular', 'Svelte']);
  });

  test('limits terms to 200 entries', () => {
    const terms = Array.from({ length: 300 }, (_, i) => `term${i}`).join(',');
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: '',
      sttContextText: '',
      sttContextTerms: terms,
    });
    expect(result.terms).toHaveLength(200);
  });

  test('ignores whitespace-only text and terms', () => {
    const result = buildSttContextPayloadFromState({
      sttContextDomain: '',
      sttContextTopic: '',
      sttContextText: '   ',
      sttContextTerms: '  ',
    });
    expect(result).toBeNull();
  });
});

// ─── buildTranslationConfigFromState ────────────────────────────────────────

describe('buildTranslationConfigFromState', () => {
  test('returns null when no target language', () => {
    expect(buildTranslationConfigFromState({ sttTranslationTargetLanguage: '' })).toBeNull();
  });

  test('returns one_way config with target language', () => {
    const result = buildTranslationConfigFromState({
      sttTranslationTargetLanguage: 'vi',
    });
    expect(result).toEqual({
      type: 'one_way',
      target_language: 'vi',
    });
  });
});

// ─── STT_ALLOWED_LANGS ─────────────────────────────────────────────────────

describe('STT_ALLOWED_LANGS', () => {
  test('contains expected languages', () => {
    expect(STT_ALLOWED_LANGS.has('en')).toBe(true);
    expect(STT_ALLOWED_LANGS.has('vi')).toBe(true);
    expect(STT_ALLOWED_LANGS.has('zh')).toBe(true);
    expect(STT_ALLOWED_LANGS.has('ja')).toBe(true);
  });

  test('does not contain invalid codes', () => {
    expect(STT_ALLOWED_LANGS.has('xx')).toBe(false);
    expect(STT_ALLOWED_LANGS.has('')).toBe(false);
  });

  test('has 30 supported languages', () => {
    expect(STT_ALLOWED_LANGS.size).toBe(30);
  });
});
