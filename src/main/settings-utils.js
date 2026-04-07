const STT_ALLOWED_LANGS = new Set([
  'en', 'vi', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it',
  'nl', 'pl', 'ru', 'hi', 'th', 'id', 'ms', 'tl', 'ar', 'tr',
  'uk', 'sv', 'da', 'no', 'fi', 'cs', 'ro', 'el', 'he', 'hu',
]);

function normalizeSubtitleSettings(settings) {
  const out = { ...settings };
  const px = Number(out.subtitleFontSizePx);
  out.subtitleFontSizePx =
    Number.isFinite(px) ? Math.min(48, Math.max(10, Math.round(px))) : 16;
  const col =
    typeof out.subtitleTextColor === 'string'
      ? out.subtitleTextColor.trim()
      : '#ffffff';
  out.subtitleTextColor = /^#[0-9A-Fa-f]{6}$/.test(col) ? col : '#ffffff';
  const allowedFonts = new Set(['system-ui', 'serif', 'monospace']);
  if (!allowedFonts.has(out.subtitleFontFamily)) {
    out.subtitleFontFamily = 'system-ui';
  }
  const x = Number(out.subtitlePositionX);
  const y = Number(out.subtitlePositionY);
  out.subtitlePositionX = Number.isFinite(x)
    ? Math.min(100, Math.max(0, x))
    : 50;
  out.subtitlePositionY = Number.isFinite(y)
    ? Math.min(100, Math.max(0, y))
    : 90;
  out.burnSubtitlesIntoVideo =
    out.burnSubtitlesIntoVideo === undefined
      ? true
      : Boolean(out.burnSubtitlesIntoVideo);
  return out;
}

function normalizeRecordingQuality(quality) {
  return quality === 'compact' ? 'compact' : 'normal';
}

function normalizeUiTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

function windowBackgroundForTheme(theme) {
  return theme === 'light' ? '#F8FAFC' : '#0F172A';
}

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

function validateSonioxKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Add your Soniox API key in Settings (Speech-to-Text).');
  }
  return key;
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
    general.push({ key: 'domain', value: state.sttContextDomain });
  }
  if (state.sttContextTopic) {
    general.push({ key: 'topic', value: state.sttContextTopic });
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
  return { type: 'one_way', target_language: tgt };
}

module.exports = {
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
};
