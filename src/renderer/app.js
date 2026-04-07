/* ── State ─────────────────────────────────────────────────── */
let currentMode = 'screen';
let selectedSource = null;
let areaRect = null;
let mediaRecorder = null;
let recordedChunks = [];
let previewStream = null;
let sttResult = null;
let sttProcessorNode = null;
let sttAudioContext = null;
let sttSourceNode = null;
let subtitleDrag = null;
let subtitlePosition = { x: 50, y: 90 };
let subtitlePositionSaveTimer = null;
let subtitleFontSizeSaveTimer = null;
let subtitleEditFocused = false;
let subtitleUserEdited = false;
let lastSttCombinedText = '';
let timerInterval = null;
let timerBaseSeconds = 0;
let timerSegmentStart = null;

/* ── Auto-stop on silence state ─────────────────────────── */
let silenceMonitorCtx = null;
let silenceMonitorSources = [];
let silenceMonitorAnalysers = [];
let silenceMonitorInterval = null;
let silenceStartedAt = null;
let autoStopSilenceMs = 3 * 60 * 1000;
let autoStopSelectedSource = 'both';
let autoStopSelectedMicDeviceId = '';
let autoStopPreviewMicStream = null;
let autoStopMeterRaf = null;

const SUBTITLE_FONT_STACKS = {
  'system-ui':
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const SUBTITLE_SAMPLE_TEXT =
  'Preview subtitle — adjust position and size';

let recordingStreamRef = null;
let recordingSessionId = 0;
let segmentPartIndex = 1;
let segmentByteSize = 0;
let maxSegmentBytes = 0;
let splitPending = false;
let userStoppedRecording = false;
let recordingMimeType = '';
let recordingVideoBitrate = 2_500_000;
/** Mic stream used only for live STT — never mixed into the recorded file */
let sttDedicatedMicStream = null;

function videoBitrateForRecordingQuality(q) {
  return q === 'compact' ? 1_400_000 : 2_500_000;
}

const {
  clampSubtitlePx,
  buildCombinedSegmentText,
  finalizeSubtitleSegments,
  recordingStatusMessage: buildRecordingStatusMessage,
} = window.AppLogic;

/* ── DOM refs ─────────────────────────────────────────────── */
const $ = (sel) => document.querySelector(sel);
const tabs = document.querySelectorAll('.tab');
const sourcesGrid = $('#sources-grid');
const sourcePicker = $('#source-picker');
const areaInfo = $('#area-info');
const areaPreview = $('#area-preview');
const areaDimensions = $('#area-dimensions');
const btnAreaSelect = $('#btn-area-select');
const btnReselect = $('#btn-reselect');
const toggleMic = $('#toggle-mic');
const toggleSystemAudio = $('#toggle-system-audio');
const toggleStt = $('#toggle-stt');
const toggleManualSub = $('#toggle-manual-sub');
const btnRecord = $('#btn-record');
const btnPause = $('#btn-pause');
const btnPauseIcon = btnPause?.querySelector('.btn-pause-icon');
const btnResumeIcon = btnPause?.querySelector('.btn-resume-icon');
const btnStop = $('#btn-stop');
const timer = $('#timer');
const status = $('#status');
const recIndicator = $('#rec-indicator');
const speakingIndicator = $('#speaking-indicator');
const livePreview = $('#live-preview');
const btnPreviewBack = $('#btn-preview-back');
const previewVideo = $('#preview-video');
const subtitleOverlay = $('#subtitle-overlay');
const btnTheme = $('#btn-theme');
const btnSettings = $('#btn-settings');
const settingsModal = $('#settings-modal');
const inputSonioxKey = $('#input-soniox-key');
const selectSttSourceLanguage = $('#select-stt-source-language');
const checkSttLangStrict = $('#check-stt-lang-strict');
const selectSttTranslationTargetLanguage = $(
  '#select-stt-translation-target-language'
);
const inputSttContextDomain = $('#input-stt-context-domain');
const inputSttContextTopic = $('#input-stt-context-topic');
const inputSttContextTerms = $('#input-stt-context-terms');
const textareaSttContextText = $('#textarea-stt-context-text');
const inputOutputFolder = $('#input-output-folder');
const inputMaxSegmentMb = $('#input-max-segment-mb');
const btnPickOutputFolder = $('#btn-pick-output-folder');
const btnSettingsCancel = $('#btn-settings-cancel');
const btnSettingsSave = $('#btn-settings-save');
const inputSubtitleSize = $('#input-subtitle-size');
const inputSubtitleColor = $('#input-subtitle-color');
const selectSubtitleFont = $('#select-subtitle-font');
const inputSubtitleX = $('#input-subtitle-x');
const inputSubtitleY = $('#input-subtitle-y');
const btnSubPosBottom = $('#btn-sub-pos-bottom');
const btnSubPosBottomLeft = $('#btn-sub-pos-bottom-left');
const btnSubPosTop = $('#btn-sub-pos-top');
const checkBurnSubtitles = $('#check-burn-subtitles');
const selectRecordingQuality = $('#select-recording-quality');
const subtitleEditWrap = $('#subtitle-edit-wrap');
const subtitleEdit = $('#subtitle-edit');
const saveModal = $('#save-modal');
const saveModalStatus = $('#save-modal-status');
const saveModalBar = $('#save-modal-bar');
const saveModalPath = $('#save-modal-path');
const saveModalClose = $('#save-modal-close');
const burnModal = $('#burn-modal');
const burnModalStatus = $('#burn-modal-status');
const burnModalBar = $('#burn-modal-bar');
const burnModalPath = $('#burn-modal-path');
const burnModalClose = $('#burn-modal-close');
const subtitlePreviewToolbar = $('#subtitle-preview-toolbar');
const rangeSubtitleFontSize = $('#range-subtitle-font-size');
const btnSubtitleFontMinus = $('#btn-subtitle-font-minus');
const btnSubtitleFontPlus = $('#btn-subtitle-font-plus');
const spanSubtitleFontPx = $('#span-subtitle-font-px');
const previewSttWrap = $('#preview-stt-wrap');
const previewSelectSttSourceLanguage = $('#preview-select-stt-source-language');
const previewCheckSttLangStrict = $('#preview-check-stt-lang-strict');
const previewSelectSttTranslationTargetLanguage = $(
  '#preview-select-stt-translation-target-language'
);
const previewInputSttContextDomain = $('#preview-input-stt-context-domain');
const previewInputSttContextTopic = $('#preview-input-stt-context-topic');
const previewInputSttContextTerms = $('#preview-input-stt-context-terms');
const previewTextareaSttContextText = $('#preview-textarea-stt-context-text');
const toggleAutoStopSilence = $('#toggle-auto-stop-silence');
const autoStopMinutesWrap = $('#auto-stop-minutes-wrap');
const inputAutoStopMinutes = $('#input-auto-stop-minutes');
const selectAutoStopSourceQuick = $('#select-auto-stop-source-quick');
const autoStopCountdown = $('#auto-stop-countdown');
const settingsCheckAutoStop = $('#settings-check-auto-stop');
const settingsInputAutoStopMinutes = $('#settings-input-auto-stop-minutes');
const settingsSelectAutoStopSource = $('#settings-select-auto-stop-source');
const settingsSelectAutoStopMic = $('#settings-select-auto-stop-mic');
const autoStopMeterBar = $('#auto-stop-meter-bar');
const autoStopMeterLabel = $('#auto-stop-meter-label');
const sttApiKeyMissingAlert =
  'Soniox API key is missing. Add it in Settings to enable Speech-to-Text.';

function syncThemeButtonChrome() {
  if (!btnTheme) return;
  const light = document.documentElement.classList.contains('theme-light');
  const label = light ? 'Switch to dark mode' : 'Switch to light mode';
  btnTheme.title = label;
  btnTheme.setAttribute('aria-label', label);
}

async function hydrateUiThemeFromSettings() {
  const s = await window.electronAPI.getSettings();
  const light = s.uiTheme === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  syncThemeButtonChrome();
}

function hideSubtitlePreviewToolbar() {
  subtitlePreviewToolbar.classList.add('hidden');
}

async function syncToolbarFromSettings() {
  const s = await window.electronAPI.getSettings();
  const px = clampSubtitlePx(
    typeof s.subtitleFontSizePx === 'number'
      ? s.subtitleFontSizePx
      : 16
  );
  rangeSubtitleFontSize.value = String(px);
  spanSubtitleFontPx.textContent = `${px}px`;
  inputSubtitleSize.value = String(px);
}

async function syncPreviewSttFromSettings() {
  if (!previewSelectSttSourceLanguage) return;
  const s = await window.electronAPI.getSettings();
  previewSelectSttSourceLanguage.value = s.sttSourceLanguage || '';
  previewCheckSttLangStrict.checked = Boolean(s.sttLanguageHintsStrict);
  previewSelectSttTranslationTargetLanguage.value =
    s.sttTranslationTargetLanguage || '';
  previewInputSttContextDomain.value = s.sttContextDomain || '';
  previewInputSttContextTopic.value = s.sttContextTopic || '';
  previewInputSttContextTerms.value = s.sttContextTerms || '';
  previewTextareaSttContextText.value = s.sttContextText || '';
}

function collectPreviewSttSessionPayload() {
  return {
    sttSourceLanguage: previewSelectSttSourceLanguage?.value || '',
    sttLanguageHintsStrict: Boolean(previewCheckSttLangStrict?.checked),
    sttTranslationTargetLanguage:
      previewSelectSttTranslationTargetLanguage?.value || '',
    sttContextDomain: previewInputSttContextDomain?.value ?? '',
    sttContextTopic: previewInputSttContextTopic?.value ?? '',
    sttContextTerms: previewInputSttContextTerms?.value ?? '',
    sttContextText: previewTextareaSttContextText?.value ?? '',
  };
}

function setPreviewSttPanelLocked(locked) {
  if (!previewSttWrap) return;
  previewSttWrap.querySelectorAll('select, input, textarea').forEach((el) => {
    el.disabled = locked;
  });
}

function scheduleSaveSubtitleFontSize(px) {
  if (subtitleFontSizeSaveTimer) clearTimeout(subtitleFontSizeSaveTimer);
  subtitleFontSizeSaveTimer = setTimeout(async () => {
    subtitleFontSizeSaveTimer = null;
    const cur = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({
      ...cur,
      subtitleFontSizePx: px,
    });
  }, 400);
}

function onToolbarFontSizeChange(rawPx) {
  const px = clampSubtitlePx(rawPx);
  rangeSubtitleFontSize.value = String(px);
  spanSubtitleFontPx.textContent = `${px}px`;
  subtitleOverlay.style.fontSize = `${px}px`;
  inputSubtitleSize.value = String(px);
  scheduleSaveSubtitleFontSize(px);
}

subtitlePreviewToolbar.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

previewSttWrap?.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

rangeSubtitleFontSize.addEventListener('input', () => {
  onToolbarFontSizeChange(rangeSubtitleFontSize.value);
});

btnSubtitleFontMinus.addEventListener('click', () => {
  onToolbarFontSizeChange(Number(rangeSubtitleFontSize.value) - 1);
});

btnSubtitleFontPlus.addEventListener('click', () => {
  onToolbarFontSizeChange(Number(rangeSubtitleFontSize.value) + 1);
});

async function showSubtitlePreviewSample() {
  if (document.body.classList.contains('recording')) return;
  if (livePreview.classList.contains('hidden')) return;
  subtitleOverlay.textContent = SUBTITLE_SAMPLE_TEXT;
  subtitleOverlay.classList.remove('hidden');
  await applySubtitleAppearance();
  await syncToolbarFromSettings();
  await syncPreviewSttFromSettings();
  subtitlePreviewToolbar.classList.remove('hidden');
}

function setMicChipSttMode(on) {
  const micLabel = toggleMic.closest('label');
  if (on) {
    toggleMic.checked = true;
    toggleMic.disabled = true;
    if (micLabel) {
      micLabel.classList.add('audio-chip--stt-mic');
      micLabel.title =
        'Microphone is on for live subtitles only — not recorded into the video';
    }
  } else {
    toggleMic.disabled = false;
    if (micLabel) {
      micLabel.classList.remove('audio-chip--stt-mic');
      micLabel.title = 'Microphone';
    }
  }
}

toggleStt.addEventListener('change', async () => {
  if (!toggleStt.checked) {
    setMicChipSttMode(false);
    subtitleEditWrap.classList.add('hidden');
    livePreview.classList.remove('live-preview--subtitle-edit');
    subtitleEdit.value = '';
    subtitleUserEdited = false;
    if (
      !document.body.classList.contains('recording') &&
      !livePreview.classList.contains('hidden')
    ) {
      await showSubtitlePreviewSample();
    } else {
      subtitleOverlay.classList.add('hidden');
      subtitleOverlay.textContent = '';
    }
    return;
  }

  if (toggleManualSub.checked) {
    toggleManualSub.checked = false;
  }

  const config = await window.electronAPI.checkSttConfig();
  if (!config.ok) {
    toggleStt.checked = false;
    alert(sttApiKeyMissingAlert);
    return;
  }

  setMicChipSttMode(true);
  const micPerm = await window.electronAPI.requestMicrophonePermission();
  if (!micPerm.ok) {
    toggleStt.checked = false;
    setMicChipSttMode(false);
    alert(
      'Microphone permission is required for Speech-to-Text. Enable it in System Settings → Privacy & Security → Microphone.'
    );
  }
});

toggleManualSub.addEventListener('change', async () => {
  if (toggleManualSub.checked && toggleStt.checked) {
    toggleStt.checked = false;
    setMicChipSttMode(false);
  }

  if (!toggleManualSub.checked) {
    if (
      !document.body.classList.contains('recording') &&
      !livePreview.classList.contains('hidden')
    ) {
      await showSubtitlePreviewSample();
    } else if (!toggleStt.checked) {
      subtitleOverlay.classList.add('hidden');
      subtitleOverlay.textContent = '';
    }
    return;
  }

  if (
    !document.body.classList.contains('recording') &&
    !livePreview.classList.contains('hidden')
  ) {
    await showSubtitlePreviewSample();
  }
});

toggleAutoStopSilence.addEventListener('change', async () => {
  const enabled = toggleAutoStopSilence.checked;
  autoStopMinutesWrap.classList.toggle('hidden', !enabled);

  // If both Mic and System are off while Auto-stop is enabled,
  // automatically enable System so the detector has an audio signal.
  if (enabled && !toggleMic.checked && !toggleSystemAudio.checked) {
    toggleSystemAudio.checked = true;
    status.textContent =
      'Auto-stop enabled — System audio turned on so silence can be detected.';
  }

  const cur = await window.electronAPI.getSettings();
  await window.electronAPI.saveSettings({
    ...cur,
    autoStopOnSilence: enabled,
  });
});

inputAutoStopMinutes.addEventListener('change', async () => {
  const v = Math.max(0.5, Math.min(60, Number(inputAutoStopMinutes.value) || 3));
  inputAutoStopMinutes.value = v;
  autoStopSilenceMs = v * 60 * 1000;
  const cur = await window.electronAPI.getSettings();
  await window.electronAPI.saveSettings({
    ...cur,
    autoStopSilenceMinutes: v,
  });
});

function setAutoStopMeterLevel01(level) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  if (autoStopMeterBar) autoStopMeterBar.style.width = `${pct}%`;
  if (autoStopMeterLabel) autoStopMeterLabel.textContent = `${pct}%`;
}

async function stopAutoStopPreviewMic() {
  if (autoStopMeterRaf) {
    cancelAnimationFrame(autoStopMeterRaf);
    autoStopMeterRaf = null;
  }
  if (autoStopPreviewMicStream) {
    autoStopPreviewMicStream.getTracks().forEach((t) => t.stop());
    autoStopPreviewMicStream = null;
  }
  setAutoStopMeterLevel01(0);
}

async function startAutoStopPreviewMic(deviceId) {
  await stopAutoStopPreviewMic();
  try {
    const perm = await window.electronAPI.requestMicrophonePermission();
    if (!perm.ok) return;
    autoStopPreviewMicStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(autoStopPreviewMicStream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      const rms = computeRmsFloat32(buf);
      // Map RMS ~0..0.2 to 0..1 for UI
      setAutoStopMeterLevel01(Math.min(1, rms / 0.2));
      autoStopMeterRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch (_) {
    // ignore
  }
}

async function refreshAutoStopMicDevices(selectedId) {
  if (!settingsSelectAutoStopMic) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cur = settingsSelectAutoStopMic.value;
  settingsSelectAutoStopMic.innerHTML = '<option value=\"\">Default microphone</option>';
  mics.forEach((d, idx) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone ${idx + 1}`;
    settingsSelectAutoStopMic.appendChild(opt);
  });
  const next = selectedId ?? cur;
  if (next) settingsSelectAutoStopMic.value = next;
}

toggleMic.addEventListener('change', async () => {
  if (toggleMic.disabled) return;
  if (!toggleMic.checked) return;
  const r = await window.electronAPI.requestMicrophonePermission();
  if (!r.ok) {
    toggleMic.checked = false;
    status.textContent =
      'Microphone denied — enable LazyScreen in System Settings → Privacy & Security → Microphone';
    alert(
      'Microphone access is required. Enable LazyScreen (or Electron when developing) under System Settings → Privacy & Security → Microphone.'
    );
  }
});

(async function syncAutoStopFromSettings() {
  const s = await window.electronAPI.getSettings();
  toggleAutoStopSilence.checked = Boolean(s.autoStopOnSilence);
  const mins = Number(s.autoStopSilenceMinutes) || 3;
  inputAutoStopMinutes.value = mins;
  autoStopSilenceMs = mins * 60 * 1000;
  autoStopSelectedSource =
    s.autoStopAudioSource === 'system' || s.autoStopAudioSource === 'mic'
      ? s.autoStopAudioSource
      : 'both';
  autoStopSelectedMicDeviceId =
    typeof s.autoStopMicDeviceId === 'string' ? s.autoStopMicDeviceId : '';
  if (selectAutoStopSourceQuick) {
    selectAutoStopSourceQuick.value = autoStopSelectedSource;
  }
  autoStopMinutesWrap.classList.toggle('hidden', !toggleAutoStopSilence.checked);
})();

selectAutoStopSourceQuick?.addEventListener('change', async () => {
  const v = selectAutoStopSourceQuick.value;
  autoStopSelectedSource = v === 'system' || v === 'mic' ? v : 'both';
  const cur = await window.electronAPI.getSettings();
  await window.electronAPI.saveSettings({
    ...cur,
    autoStopAudioSource: autoStopSelectedSource,
  });
});

(async function syncSttToggleWithSettings() {
  const config = await window.electronAPI.checkSttConfig();
  if (!config.ok && toggleStt.checked) {
    toggleStt.checked = false;
    setMicChipSttMode(false);
    subtitleEditWrap.classList.add('hidden');
    livePreview.classList.remove('live-preview--subtitle-edit');
    if (
      !document.body.classList.contains('recording') &&
      !livePreview.classList.contains('hidden')
    ) {
      await showSubtitlePreviewSample();
    } else {
      subtitleOverlay.classList.add('hidden');
      subtitleOverlay.textContent = '';
    }
  }
})();

if (btnTheme) {
  btnTheme.addEventListener('click', async () => {
    const nextLight = !document.documentElement.classList.contains(
      'theme-light'
    );
    document.documentElement.classList.toggle('theme-light', nextLight);
    syncThemeButtonChrome();
    const cur = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({
      ...cur,
      uiTheme: nextLight ? 'light' : 'dark',
    });
  });
}

btnSettings.addEventListener('click', async () => {
  const settings = await window.electronAPI.getSettings();
  inputSonioxKey.value = settings.sonioxApiKey || '';
  inputOutputFolder.value = settings.outputFolder || '';
  inputMaxSegmentMb.value = String(
    typeof settings.maxSegmentSizeMb === 'number'
      ? settings.maxSegmentSizeMb
      : Number(settings.maxSegmentSizeMb) || 0
  );
  inputSubtitleSize.value = String(
    typeof settings.subtitleFontSizePx === 'number'
      ? settings.subtitleFontSizePx
      : 16
  );
  inputSubtitleColor.value = settings.subtitleTextColor || '#ffffff';
  selectSubtitleFont.value = settings.subtitleFontFamily || 'system-ui';
  inputSubtitleX.value = String(
    typeof settings.subtitlePositionX === 'number'
      ? settings.subtitlePositionX
      : 50
  );
  inputSubtitleY.value = String(
    typeof settings.subtitlePositionY === 'number'
      ? settings.subtitlePositionY
      : 90
  );
  checkBurnSubtitles.checked = Boolean(settings.burnSubtitlesIntoVideo);
  selectRecordingQuality.value =
    settings.recordingQuality === 'compact' ? 'compact' : 'normal';
  settingsCheckAutoStop.checked = Boolean(settings.autoStopOnSilence);
  settingsInputAutoStopMinutes.value = String(
    typeof settings.autoStopSilenceMinutes === 'number'
      ? settings.autoStopSilenceMinutes
      : 3
  );
  settingsSelectAutoStopSource.value =
    settings.autoStopAudioSource === 'system' || settings.autoStopAudioSource === 'mic'
      ? settings.autoStopAudioSource
      : 'both';
  if (selectAutoStopSourceQuick) {
    selectAutoStopSourceQuick.value = settingsSelectAutoStopSource.value;
  }
  await refreshAutoStopMicDevices(settings.autoStopMicDeviceId || '');
  // Start mic meter preview only when source includes mic
  if (settingsSelectAutoStopSource.value === 'mic' || settingsSelectAutoStopSource.value === 'both') {
    await startAutoStopPreviewMic(settingsSelectAutoStopMic.value);
  } else {
    await stopAutoStopPreviewMic();
  }
  const sttLang = settings.sttSourceLanguage || '';
  selectSttSourceLanguage.value = sttLang;
  checkSttLangStrict.checked = Boolean(settings.sttLanguageHintsStrict);
  selectSttTranslationTargetLanguage.value =
    settings.sttTranslationTargetLanguage || '';
  inputSttContextDomain.value = settings.sttContextDomain || '';
  inputSttContextTopic.value = settings.sttContextTopic || '';
  inputSttContextTerms.value = settings.sttContextTerms || '';
  textareaSttContextText.value = settings.sttContextText || '';
  settingsModal.classList.remove('hidden');
});

btnPickOutputFolder.addEventListener('click', async () => {
  const result = await window.electronAPI.pickOutputFolder();
  if (!result.canceled && result.folderPath) {
    inputOutputFolder.value = result.folderPath;
  }
});

btnSettingsCancel.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  void stopAutoStopPreviewMic();
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add('hidden');
    void stopAutoStopPreviewMic();
  }
});

settingsSelectAutoStopSource?.addEventListener('change', async () => {
  if (settingsSelectAutoStopSource.value === 'mic' || settingsSelectAutoStopSource.value === 'both') {
    await refreshAutoStopMicDevices(settingsSelectAutoStopMic.value);
    await startAutoStopPreviewMic(settingsSelectAutoStopMic.value);
  } else {
    await stopAutoStopPreviewMic();
  }
});

settingsSelectAutoStopMic?.addEventListener('change', async () => {
  if (settingsSelectAutoStopSource.value === 'mic' || settingsSelectAutoStopSource.value === 'both') {
    await startAutoStopPreviewMic(settingsSelectAutoStopMic.value);
  }
});

btnSettingsSave.addEventListener('click', async () => {
  await window.electronAPI.saveSettings({
    sonioxApiKey: inputSonioxKey.value,
    outputFolder: inputOutputFolder.value,
    uiTheme: document.documentElement.classList.contains('theme-light')
      ? 'light'
      : 'dark',
    maxSegmentSizeMb: Math.max(0, Number(inputMaxSegmentMb.value) || 0),
    subtitleFontSizePx: Math.min(
      48,
      Math.max(10, Number(inputSubtitleSize.value) || 16)
    ),
    subtitleTextColor: inputSubtitleColor.value,
    subtitleFontFamily: selectSubtitleFont.value,
    subtitlePositionX: Math.min(
      100,
      Math.max(0, Number(inputSubtitleX.value) || 0)
    ),
    subtitlePositionY: Math.min(
      100,
      Math.max(0, Number(inputSubtitleY.value) || 0)
    ),
    burnSubtitlesIntoVideo: checkBurnSubtitles.checked,
    recordingQuality:
      selectRecordingQuality.value === 'compact' ? 'compact' : 'normal',
    autoStopOnSilence: settingsCheckAutoStop.checked,
    autoStopSilenceMinutes: Math.max(
      0.5,
      Math.min(60, Number(settingsInputAutoStopMinutes.value) || 3)
    ),
    autoStopAudioSource: settingsSelectAutoStopSource?.value || 'both',
    autoStopMicDeviceId: settingsSelectAutoStopMic?.value || '',
    sttSourceLanguage: selectSttSourceLanguage.value || '',
    sttLanguageHintsStrict: checkSttLangStrict.checked,
    sttTranslationTargetLanguage: selectSttTranslationTargetLanguage.value || '',
    sttContextDomain: inputSttContextDomain.value,
    sttContextTopic: inputSttContextTopic.value,
    sttContextTerms: inputSttContextTerms.value,
    sttContextText: textareaSttContextText.value,
  });
  subtitlePosition = {
    x: Math.min(100, Math.max(0, Number(inputSubtitleX.value) || 0)),
    y: Math.min(100, Math.max(0, Number(inputSubtitleY.value) || 0)),
  };
  applySubtitlePosition();
  if (
    !document.body.classList.contains('recording') &&
    !livePreview.classList.contains('hidden')
  ) {
    await showSubtitlePreviewSample();
  } else {
    await applySubtitleAppearance();
  }
  toggleAutoStopSilence.checked = settingsCheckAutoStop.checked;
  const savedMins = Math.max(
    0.5,
    Math.min(60, Number(settingsInputAutoStopMinutes.value) || 3)
  );
  inputAutoStopMinutes.value = savedMins;
  autoStopSilenceMs = savedMins * 60 * 1000;
  autoStopMinutesWrap.classList.toggle('hidden', !toggleAutoStopSilence.checked);
  autoStopSelectedSource = settingsSelectAutoStopSource?.value || 'both';
  autoStopSelectedMicDeviceId = settingsSelectAutoStopMic?.value || '';
  if (selectAutoStopSourceQuick) {
    selectAutoStopSourceQuick.value = autoStopSelectedSource;
  }

  settingsModal.classList.add('hidden');
  void stopAutoStopPreviewMic();
  status.textContent = 'Settings saved';
  const sttOk = await window.electronAPI.checkSttConfig();
  if (!sttOk.ok && toggleStt.checked) {
    toggleStt.checked = false;
    setMicChipSttMode(false);
    if (
      !document.body.classList.contains('recording') &&
      !livePreview.classList.contains('hidden')
    ) {
      await showSubtitlePreviewSample();
    } else {
      subtitleOverlay.classList.add('hidden');
      subtitleOverlay.textContent = '';
    }
    alert(sttApiKeyMissingAlert);
  }
});

function setSubtitlePreset(x, y) {
  subtitlePosition = { x, y };
  inputSubtitleX.value = String(Math.round(x));
  inputSubtitleY.value = String(Math.round(y));
  applySubtitlePosition();
  scheduleSaveSubtitlePosition();
}

btnSubPosBottom.addEventListener('click', () => setSubtitlePreset(50, 88));
btnSubPosBottomLeft.addEventListener('click', () => setSubtitlePreset(18, 88));
btnSubPosTop.addEventListener('click', () => setSubtitlePreset(50, 12));

async function applySubtitleAppearance() {
  const settings = await window.electronAPI.getSettings();
  const px =
    typeof settings.subtitleFontSizePx === 'number'
      ? settings.subtitleFontSizePx
      : 16;
  const color = settings.subtitleTextColor || '#ffffff';
  const key = settings.subtitleFontFamily || 'system-ui';
  const stack = SUBTITLE_FONT_STACKS[key] || SUBTITLE_FONT_STACKS['system-ui'];
  subtitleOverlay.style.fontSize = `${px}px`;
  subtitleOverlay.style.color = color;
  subtitleOverlay.style.fontFamily = stack;
  subtitlePosition = {
    x:
      typeof settings.subtitlePositionX === 'number'
        ? settings.subtitlePositionX
        : 50,
    y:
      typeof settings.subtitlePositionY === 'number'
        ? settings.subtitlePositionY
        : 90,
  };
  applySubtitlePosition();
  if (!subtitlePreviewToolbar.classList.contains('hidden')) {
    await syncToolbarFromSettings();
  }
}

function scheduleSaveSubtitlePosition() {
  if (subtitlePositionSaveTimer) clearTimeout(subtitlePositionSaveTimer);
  subtitlePositionSaveTimer = setTimeout(async () => {
    subtitlePositionSaveTimer = null;
    const cur = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({
      ...cur,
      subtitlePositionX: subtitlePosition.x,
      subtitlePositionY: subtitlePosition.y,
    });
  }, 400);
}

/* ── Tab switching ────────────────────────────────────────── */
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (mediaRecorder) return;
    tabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    currentMode = tab.dataset.mode;
    selectedSource = null;
    areaRect = null;
    updateView();
  });
});

function updateView() {
  livePreview.classList.add('hidden');
  if (currentMode === 'area') {
    sourcePicker.classList.add('hidden');
    areaInfo.classList.remove('hidden');
    areaPreview.classList.add('hidden');
    btnAreaSelect.classList.remove('hidden');
    updateRecordButton();
  } else {
    sourcePicker.classList.remove('hidden');
    areaInfo.classList.add('hidden');
    loadSources();
  }
}

/* ── Load sources ─────────────────────────────────────────── */
async function loadSources() {
  sourcesGrid.innerHTML = '<div class="loading-text">Loading sources...</div>';
  btnRecord.disabled = true;

  try {
    let sources = await window.electronAPI.getSources(currentMode);
    if (sources.length === 0) {
      await new Promise((r) => setTimeout(r, 400));
      sources = await window.electronAPI.getSources(currentMode);
    }
    sourcesGrid.innerHTML = '';

    if (sources.length === 0) {
      sourcesGrid.innerHTML =
        '<div class="source-placeholder">No sources found. Check Screen Recording permission, then restart the app or switch Screen / Window tab.</div>';
      return;
    }

    if (currentMode === 'window') {
      renderGroupedSources(sources);
    } else {
      renderFlatSources(sources);
    }
  } catch (err) {
    sourcesGrid.innerHTML = `<div class="source-placeholder">Error: ${err.message}</div>`;
  }
}

function renderFlatSources(sources) {
  sourcesGrid.className = 'sources-grid';
  sources.forEach((source) => {
    sourcesGrid.appendChild(createSourceCard(source));
  });
}

function renderGroupedSources(sources) {
  sourcesGrid.className = 'sources-grouped';

  const groups = {};
  for (const source of sources) {
    const app = source.appName || 'Other';
    if (!groups[app]) groups[app] = [];
    groups[app].push(source);
  }

  const sortedApps = Object.keys(groups).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  for (const appName of sortedApps) {
    const appSources = groups[appName];
    const group = document.createElement('div');
    group.className = 'app-group';

    const iconSrc = appSources[0].appIcon;
    const iconHtml = iconSrc
      ? `<img class="app-group-icon" src="${iconSrc}" />`
      : '<div class="app-group-icon-placeholder"></div>';

    const header = document.createElement('div');
    header.className = 'app-group-header';
    header.innerHTML = `
      ${iconHtml}
      <span class="app-group-name">${appName}</span>
      <span class="app-group-count">${appSources.length}</span>
      <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;

    header.addEventListener('click', () => {
      group.classList.toggle('collapsed');
    });

    const content = document.createElement('div');
    content.className = 'app-group-content';

    for (const source of appSources) {
      content.appendChild(createSourceCard(source));
    }

    group.appendChild(header);
    group.appendChild(content);
    sourcesGrid.appendChild(group);
  }
}

function createSourceCard(source) {
  const card = document.createElement('div');
  card.className = 'source-card';
  card.dataset.sourceId = source.id;

  const iconHtml =
    source.appIcon
      ? `<img class="app-icon" src="${source.appIcon}" />`
      : '';

  card.innerHTML = `
    <img class="thumb" src="${source.thumbnail}" alt="${source.name}" />
    <div class="source-name">${iconHtml}<span>${source.name}</span></div>
  `;

  card.addEventListener('click', () => {
    document
      .querySelectorAll('.source-card')
      .forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedSource = source;
    updateRecordButton();
    showPreview();
  });

  return card;
}

async function showPreview() {
  if (!selectedSource) return;

  try {
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
      previewStream = null;
    }

    const videoConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: selectedSource.id,
      },
    };

    previewStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });

    previewVideo.srcObject = previewStream;
    sourcePicker.classList.add('hidden');
    areaInfo.classList.add('hidden');
    livePreview.classList.remove('hidden');
    await showSubtitlePreviewSample();
  } catch (err) {
    console.error('Preview failed:', err);
    status.textContent = `Preview error: ${err.message}`;
  }
}

function clearPreviewStream() {
  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
    previewStream = null;
  }
  previewVideo.srcObject = null;
  hideSubtitlePreviewToolbar();
  subtitleOverlay.classList.add('hidden');
  subtitleOverlay.textContent = '';
  subtitleEditWrap.classList.add('hidden');
  livePreview.classList.remove('live-preview--subtitle-edit');
  subtitleEdit.value = '';
  subtitleUserEdited = false;
  lastSttCombinedText = '';
}

btnPreviewBack.addEventListener('click', () => {
  if (mediaRecorder) return;
  clearPreviewStream();
  livePreview.classList.add('hidden');

  if (currentMode === 'area') {
    areaInfo.classList.remove('hidden');
  } else {
    selectedSource = null;
    updateRecordButton();
    sourcePicker.classList.remove('hidden');
  }
});

function applySubtitlePosition() {
  subtitleOverlay.style.left = `${subtitlePosition.x}%`;
  subtitleOverlay.style.top = `${subtitlePosition.y}%`;
  subtitleOverlay.style.bottom = 'auto';
  subtitleOverlay.style.transform = 'translate(-50%, -50%)';
}

function setupSubtitleDragging() {
  subtitleOverlay.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const bounds = livePreview.getBoundingClientRect();
    const overlayRect = subtitleOverlay.getBoundingClientRect();
    subtitleDrag = {
      bounds,
      offsetX: event.clientX - overlayRect.left,
      offsetY: event.clientY - overlayRect.top,
    };
  });

  document.addEventListener('mousemove', (event) => {
    if (!subtitleDrag) return;
    const { bounds, offsetX, offsetY } = subtitleDrag;
    const overlayWidth = subtitleOverlay.offsetWidth;
    const overlayHeight = subtitleOverlay.offsetHeight;
    const minX = bounds.left;
    const minY = bounds.top;
    const maxX = bounds.right - overlayWidth;
    const maxY = bounds.bottom - overlayHeight;
    const nextLeft = clamp(event.clientX - offsetX, minX, maxX);
    const nextTop = clamp(event.clientY - offsetY, minY, maxY);

    const centerX = nextLeft + overlayWidth / 2 - bounds.left;
    const centerY = nextTop + overlayHeight / 2 - bounds.top;
    subtitlePosition = {
      x: (centerX / bounds.width) * 100,
      y: (centerY / bounds.height) * 100,
    };
    applySubtitlePosition();
  });

  document.addEventListener('mouseup', () => {
    if (subtitleDrag) {
      scheduleSaveSubtitlePosition();
    }
    subtitleDrag = null;
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mergeToMonoFloat32(leftChannel, rightChannel) {
  const merged = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i += 1) {
    const right = rightChannel ? rightChannel[i] : leftChannel[i];
    merged[i] = (leftChannel[i] + right) / 2;
  }
  return merged;
}

function downsampleTo16k(float32Audio, inputRate) {
  if (inputRate === 16000) return float32Audio;
  const ratio = inputRate / 16000;
  const newLength = Math.round(float32Audio.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffset = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffset && i < float32Audio.length; i += 1) {
      accum += float32Audio[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffset;
  }
  return result;
}

function floatTo16BitPCM(float32Audio) {
  const buffer = new ArrayBuffer(float32Audio.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Audio.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32Audio[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/* ── Speech gate: Silero VAD (primary) + RMS fallback for STT upload ───── */
const VAD_RMS_HIGH = 0.018;
const VAD_RMS_LOW = 0.008;
const VAD_MAX_QUIET_FRAMES = 9;

let vadQuietRun = 0;
let vadSpeaking = false;
let vadLastUiSpeaking = null;

/** @type {{ processChunk: Function, reset: Function, dispose: Function } | null} */
let sileroSpeechGate = null;
let useSileroVad = false;
let vadChunkBusy = false;

function computeRmsFloat32(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

function vadStepRmsFallback(rms) {
  if (rms > VAD_RMS_HIGH) {
    vadSpeaking = true;
    vadQuietRun = 0;
  } else if (rms < VAD_RMS_LOW) {
    vadQuietRun += 1;
    if (vadQuietRun >= VAD_MAX_QUIET_FRAMES) {
      vadSpeaking = false;
      vadQuietRun = 0;
    }
  } else {
    vadQuietRun = 0;
  }
  return vadSpeaking;
}

function resetSpeechGate() {
  vadQuietRun = 0;
  vadSpeaking = false;
  vadLastUiSpeaking = null;
  try {
    sileroSpeechGate?.reset();
  } catch (_) {}
}

function updateSpeakingIndicatorUi(isSpeaking) {
  if (!speakingIndicator) return;
  if (vadLastUiSpeaking === isSpeaking) return;
  vadLastUiSpeaking = isSpeaking;
  if (!document.body.classList.contains('recording') || !toggleStt.checked) {
    speakingIndicator.classList.add('hidden');
    return;
  }
  speakingIndicator.classList.toggle('hidden', !isSpeaking);
}

/** Silero bundle is large; load only when STT starts so source list / UI always init first */
let sileroBundleLoadPromise = null;

function ensureSileroVadBundleLoaded() {
  if (typeof window.SileroVadGate?.createSileroSpeechGate === 'function') {
    return Promise.resolve();
  }
  if (sileroBundleLoadPromise) {
    return sileroBundleLoadPromise;
  }
  sileroBundleLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'silero-vad-gate.bundle.js';
    s.onload = () => resolve();
    s.onerror = () => {
      sileroBundleLoadPromise = null;
      reject(new Error('silero-vad-gate.bundle.js failed to load'));
    };
    document.head.appendChild(s);
  });
  return sileroBundleLoadPromise;
}

async function startSttPipeline() {
  if (!toggleStt.checked) return;
  const config = await window.electronAPI.checkSttConfig();
  if (!config.ok) {
    toggleStt.checked = false;
    setMicChipSttMode(false);
    alert(sttApiKeyMissingAlert);
    return;
  }

  await window.electronAPI.sttStart({
    sessionStt: collectPreviewSttSessionPayload(),
  });
  resetSpeechGate();

  sileroSpeechGate = null;
  useSileroVad = false;
  if (window.vadEnv?.onnxWasmBaseUrl) {
    try {
      await ensureSileroVadBundleLoaded();
    } catch (err) {
      console.warn('[VAD] Silero bundle not available, using RMS fallback:', err);
    }
    if (typeof window.SileroVadGate?.createSileroSpeechGate === 'function') {
      try {
        sileroSpeechGate = await window.SileroVadGate.createSileroSpeechGate({
          onnxWasmBaseUrl: window.vadEnv.onnxWasmBaseUrl,
        });
        useSileroVad = true;
      } catch (err) {
        console.warn('[VAD] Silero init failed, using RMS fallback:', err);
      }
    }
  }

  const inputStream = new MediaStream();
  const sttTrack =
    toggleStt.checked && sttDedicatedMicStream
      ? sttDedicatedMicStream.getAudioTracks()[0]
      : mediaRecorder.stream.getAudioTracks()[0];
  if (sttTrack) {
    inputStream.addTrack(sttTrack);
  } else {
    if (sileroSpeechGate) {
      try {
        await sileroSpeechGate.dispose();
      } catch (_) {}
      sileroSpeechGate = null;
      useSileroVad = false;
    }
    await window.electronAPI.sttStop();
    status.textContent = 'Speech-to-Text requires an audio source';
    return;
  }

  sttAudioContext = new AudioContext({ sampleRate: 48000 });
  sttSourceNode = sttAudioContext.createMediaStreamSource(inputStream);
  sttProcessorNode = sttAudioContext.createScriptProcessor(4096, 1, 1);
  sttSourceNode.connect(sttProcessorNode);
  sttProcessorNode.connect(sttAudioContext.destination);

  sttProcessorNode.onaudioprocess = (event) => {
    if (vadChunkBusy) return;
    vadChunkBusy = true;
    void (async () => {
      try {
        const left = event.inputBuffer.getChannelData(0);
        const right =
          event.inputBuffer.numberOfChannels > 1
            ? event.inputBuffer.getChannelData(1)
            : null;
        const mono = mergeToMonoFloat32(left, right);
        let shouldSend;
        if (useSileroVad && sileroSpeechGate) {
          shouldSend = await sileroSpeechGate.processChunk(
            mono,
            sttAudioContext.sampleRate
          );
        } else {
          const rms = computeRmsFloat32(mono);
          shouldSend = vadStepRmsFallback(rms);
        }
        updateSpeakingIndicatorUi(shouldSend);
        // Always stream PCM to Soniox; VAD above is for the "Speaking" badge only.
        // Gating upload caused missed audio (Silero never opened) and empty transcripts.
        const downsampled = downsampleTo16k(mono, sttAudioContext.sampleRate);
        const pcm16 = floatTo16BitPCM(downsampled);
        window.electronAPI.sttAudioChunk(pcm16);
      } finally {
        vadChunkBusy = false;
      }
    })();
  };
}

async function stopSttPipeline() {
  resetSpeechGate();
  speakingIndicator?.classList.add('hidden');
  if (sileroSpeechGate) {
    try {
      await sileroSpeechGate.dispose();
    } catch (_) {}
    sileroSpeechGate = null;
    useSileroVad = false;
  }
  if (sttProcessorNode) {
    sttProcessorNode.disconnect();
    sttProcessorNode.onaudioprocess = null;
    sttProcessorNode = null;
  }
  if (sttSourceNode) {
    sttSourceNode.disconnect();
    sttSourceNode = null;
  }
  if (sttAudioContext) {
    await sttAudioContext.close();
    sttAudioContext = null;
  }
  if (toggleStt.checked) {
    sttResult = await window.electronAPI.sttStop();
  }
  if (sttDedicatedMicStream) {
    sttDedicatedMicStream.getTracks().forEach((t) => t.stop());
    sttDedicatedMicStream = null;
  }
}

/* ── Area selection ───────────────────────────────────────── */
btnAreaSelect.addEventListener('click', selectArea);
btnReselect.addEventListener('click', selectArea);

async function selectArea() {
  const result = await window.electronAPI.startAreaSelection();
  if (result) {
    areaRect = result;
    btnAreaSelect.classList.add('hidden');
    areaPreview.classList.remove('hidden');
    areaDimensions.textContent = `${Math.round(result.width * result.scaleFactor)}×${Math.round(result.height * result.scaleFactor)}px selected`;
    updateRecordButton();

    try {
      if (!selectedSource) {
        const sources = await window.electronAPI.getSources('screen');
        if (sources.length > 0) {
          selectedSource = sources[0];
        }
      }
      if (selectedSource) {
        await showPreview();
      }
    } catch (err) {
      console.error('Area preview failed:', err);
    }
  }
}

/* ── Record button state ──────────────────────────────────── */
function updateRecordButton() {
  if (currentMode === 'area') {
    btnRecord.disabled = !areaRect;
  } else {
    btnRecord.disabled = !selectedSource;
  }
}

/* ── Silence monitoring for auto-stop ───────────────────────
 * Stops when *no* audible signal is detected on any monitored branch for X minutes:
 * - recorded audio (mic and/or system as mixed into the capture), and
 * - STT-only mic when Speech is on (not part of the video file but still "mic").
 */
// Treat anything consistently below ~-37 dBFS as "no audio".
// This is high enough to ignore typical YouTube / system noise floor,
// but low enough that real speech or music will reset the timer.
const SILENCE_RMS_THRESHOLD = 0.013;
const SILENCE_CHECK_INTERVAL_MS = 2000;

function startSilenceMonitor({ recordStream, sttMicStream }) {
  stopSilenceMonitor();

  silenceMonitorCtx = new AudioContext();

  const addBranch = (stream) => {
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    const src = silenceMonitorCtx.createMediaStreamSource(
      new MediaStream([tracks[0]])
    );
    const an = silenceMonitorCtx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    silenceMonitorSources.push(src);
    silenceMonitorAnalysers.push(an);
  };

  addBranch(recordStream);
  addBranch(sttMicStream);

  if (silenceMonitorAnalysers.length === 0) {
    silenceMonitorCtx.close().catch(() => {});
    silenceMonitorCtx = null;
    silenceMonitorSources = [];
    return;
  }

  const dataArrays = silenceMonitorAnalysers.map(
    (a) => new Float32Array(a.fftSize)
  );
  silenceStartedAt = null;

  silenceMonitorInterval = setInterval(() => {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

    let maxRms = 0;
    for (let i = 0; i < silenceMonitorAnalysers.length; i += 1) {
      silenceMonitorAnalysers[i].getFloatTimeDomainData(dataArrays[i]);
      maxRms = Math.max(maxRms, computeRmsFloat32(dataArrays[i]));
    }

    if (maxRms < SILENCE_RMS_THRESHOLD) {
      if (silenceStartedAt === null) {
        silenceStartedAt = Date.now();
      }
      const silentMs = Date.now() - silenceStartedAt;
      if (silentMs >= autoStopSilenceMs) {
        console.log(
          `[auto-stop] No mic/system audio above threshold for ${Math.round(silentMs / 1000)}s — stopping`
        );
        autoStopRecording();
      }
      if (autoStopCountdown) {
        const remaining = Math.max(0, autoStopSilenceMs - silentMs);
        const secs = Math.round(remaining / 1000);
        const mins = Math.floor(secs / 60);
        const sRem = secs % 60;
        autoStopCountdown.textContent =
          mins > 0
            ? `Auto-stop in ${mins}m ${String(sRem).padStart(2, '0')}s (no audio)`
            : `Auto-stop in ${secs}s (no audio)`;
        autoStopCountdown.classList.add('auto-stop-countdown--active');
        autoStopCountdown.classList.remove('hidden');
      }
    } else {
      silenceStartedAt = null;
      if (autoStopCountdown) {
        autoStopCountdown.textContent = '';
        autoStopCountdown.classList.remove('auto-stop-countdown--active');
        autoStopCountdown.classList.add('hidden');
      }
    }
  }, SILENCE_CHECK_INTERVAL_MS);
}

function stopSilenceMonitor() {
  if (silenceMonitorInterval) {
    clearInterval(silenceMonitorInterval);
    silenceMonitorInterval = null;
  }
  for (const s of silenceMonitorSources) {
    try {
      s.disconnect();
    } catch (_) {}
  }
  if (autoStopCountdown) {
    autoStopCountdown.textContent = '';
    autoStopCountdown.classList.remove('auto-stop-countdown--active');
    autoStopCountdown.classList.add('hidden');
  }
  silenceMonitorSources = [];
  silenceMonitorAnalysers = [];
  if (silenceMonitorCtx) {
    silenceMonitorCtx.close().catch(() => {});
    silenceMonitorCtx = null;
  }
  silenceStartedAt = null;
}

async function stopIdleDetectorExtraMic(stream) {
  if (!stream) return;
  // Never stop the STT mic stream here (it is owned by the STT pipeline).
  if (stream === sttDedicatedMicStream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch (_) {}
}

/* ── Start recording ──────────────────────────────────────── */
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', () => {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'recording') {
    const shouldStop = window.confirm(
      'Stop recording now?\n\nOK = Stop and save\nCancel = Pause recording'
    );
    if (shouldStop) {
      stopRecording();
    } else {
      pauseRecording();
    }
    return;
  }
  if (mediaRecorder.state === 'paused') {
    stopRecording();
    return;
  }
  stopRecording();
});

function autoStopRecording() {
  if (!mediaRecorder) return;
  status.textContent = 'Auto-stopping (no mic/system audio)...';
  stopRecording();
}

async function startRecording() {
  try {
    let videoStream;

    if (currentMode === 'area') {
      const sources = await window.electronAPI.getSources('screen');
      if (sources.length === 0) throw new Error('No screen source found');
      selectedSource = sources[0];
    }

    const videoConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: selectedSource.id,
      },
    };

    const wantStt = toggleStt.checked;
    const wantMicInRecording = toggleMic.checked && !wantStt;
    const wantSystemAudio = toggleSystemAudio.checked;

    if (wantStt || wantMicInRecording) {
      const micPerm = await window.electronAPI.requestMicrophonePermission();
      if (!micPerm.ok) {
        throw new Error(
          'Microphone access denied. Enable LazyScreen in System Settings → Privacy & Security → Microphone, then try again.'
        );
      }
    }

    if (wantStt) {
      sttDedicatedMicStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }

    const streamConstraints = {
      audio: wantSystemAudio
        ? { mandatory: { chromeMediaSource: 'desktop' } }
        : false,
      video: videoConstraints,
    };

    videoStream = await navigator.mediaDevices.getUserMedia(streamConstraints);

    let finalStream = videoStream;

    if (wantMicInRecording) {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      if (wantSystemAudio) {
        // Mix system audio + mic using Web Audio API
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();

        const systemSource = ctx.createMediaStreamSource(videoStream);
        systemSource.connect(dest);

        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(dest);

        const mixedAudioTrack = dest.stream.getAudioTracks()[0];
        const videoTrack = videoStream.getVideoTracks()[0];

        finalStream = new MediaStream([videoTrack, mixedAudioTrack]);
      } else {
        // Mic only (recording — not used when Speech is on)
        const videoTrack = videoStream.getVideoTracks()[0];
        const micTrack = micStream.getAudioTracks()[0];
        finalStream = new MediaStream([videoTrack, micTrack]);
      }
    }

    recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    recordingStreamRef = finalStream;
    recordingSessionId = Date.now();
    segmentPartIndex = 1;
    segmentByteSize = 0;
    userStoppedRecording = false;
    splitPending = false;
    recordingMimeType = mimeType;

    const settings = await window.electronAPI.getSettings();
    maxSegmentBytes = Math.max(
      0,
      (Number(settings.maxSegmentSizeMb) || 0) * 1024 * 1024
    );
    recordingVideoBitrate = videoBitrateForRecordingQuality(
      settings.recordingQuality
    );

    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType,
      videoBitsPerSecond: recordingVideoBitrate,
    });

    attachMediaRecorderHandlers();

    mediaRecorder.start(1000);

    if (toggleAutoStopSilence.checked) {
      autoStopSilenceMs =
        Math.max(0.5, Number(inputAutoStopMinutes.value) || 3) * 60 * 1000;
      const s = await window.electronAPI.getSettings();
      autoStopSelectedSource =
        s.autoStopAudioSource === 'system' || s.autoStopAudioSource === 'mic'
          ? s.autoStopAudioSource
          : 'both';
      autoStopSelectedMicDeviceId =
        typeof s.autoStopMicDeviceId === 'string' ? s.autoStopMicDeviceId : '';

      let idleMicStream = null;
      if (autoStopSelectedSource === 'mic' || autoStopSelectedSource === 'both') {
        // Prefer existing STT mic stream if present; otherwise create dedicated mic stream.
        if (sttDedicatedMicStream) {
          idleMicStream = sttDedicatedMicStream;
        } else {
          const perm = await window.electronAPI.requestMicrophonePermission();
          if (perm.ok) {
            idleMicStream = await navigator.mediaDevices.getUserMedia({
              audio: autoStopSelectedMicDeviceId
                ? { deviceId: { exact: autoStopSelectedMicDeviceId } }
                : true,
              video: false,
            });
          }
        }
      }

      startSilenceMonitor({
        recordStream: autoStopSelectedSource === 'mic' ? null : finalStream,
        sttMicStream: idleMicStream,
      });

      // Ensure this extra mic stream is stopped when recording ends.
      if (idleMicStream && idleMicStream !== sttDedicatedMicStream) {
        const extra = idleMicStream;
        const prevOnStop = mediaRecorder.onstop;
        mediaRecorder.onstop = async (...args) => {
          await stopIdleDetectorExtraMic(extra);
          return prevOnStop?.apply(mediaRecorder, args);
        };
      }
    }

    sttResult = null;
    hideSubtitlePreviewToolbar();
    subtitleOverlay.classList.add('hidden');
    subtitleOverlay.textContent = '';
    await startSttPipeline();

    if (toggleStt.checked || toggleManualSub.checked) {
      subtitleEditWrap.classList.remove('hidden');
      livePreview.classList.add('live-preview--subtitle-edit');
      subtitleEdit.value = '';
      subtitleUserEdited = false;
      lastSttCombinedText = '';
      if (toggleManualSub.checked && !toggleStt.checked) {
        subtitleOverlay.classList.add('hidden');
        subtitleOverlay.textContent = '';
      }
    }

    // UI update
    document.body.classList.add('recording');
    setPreviewSttPanelLocked(true);
    btnRecord.classList.add('hidden');
    btnPause?.classList.remove('hidden');
    setPauseButtonUi(false);
    if (btnPause) btnPause.disabled = false;
    btnStop.classList.remove('hidden');
    recIndicator.classList.remove('hidden');
    recIndicator.classList.remove('rec-indicator--paused');
    document.body.classList.remove('recording-paused');
    status.textContent = recordingStatusMessage();
    startTimer();
  } catch (err) {
    console.error('Recording failed:', err);
    status.textContent = `Error: ${err.message}`;
    if (sttDedicatedMicStream) {
      sttDedicatedMicStream.getTracks().forEach((t) => t.stop());
      sttDedicatedMicStream = null;
    }
  }
}

/* ── Stop recording ───────────────────────────────────────── */
function stopRecording() {
  if (!mediaRecorder) return;
  userStoppedRecording = true;
  splitPending = false;
  mediaRecorder.stop();
  status.textContent = 'Processing...';
}

function recordingStatusMessage() {
  return buildRecordingStatusMessage(maxSegmentBytes, segmentPartIndex);
}

function setPauseButtonUi(showResume) {
  if (!btnPause || !btnPauseIcon || !btnResumeIcon) return;
  btnPauseIcon.classList.toggle('hidden', showResume);
  btnResumeIcon.classList.toggle('hidden', !showResume);
  if (showResume) {
    btnPause.title = 'Resume recording';
    btnPause.setAttribute('aria-label', 'Resume recording');
  } else {
    btnPause.title = 'Pause recording';
    btnPause.setAttribute('aria-label', 'Pause recording');
  }
}

function togglePauseRecording() {
  if (!mediaRecorder || btnPause?.disabled) return;
  if (mediaRecorder.state === 'recording') pauseRecording();
  else if (mediaRecorder.state === 'paused') resumeRecording();
}

function pauseRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  mediaRecorder.pause();
  void sttAudioContext?.suspend();
  void silenceMonitorCtx?.suspend();
  silenceStartedAt = null;
  pauseTimer();
  document.body.classList.add('recording-paused');
  recIndicator.classList.add('rec-indicator--paused');
  setPauseButtonUi(true);
  status.textContent = 'Paused';
}

function resumeRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'paused') return;
  mediaRecorder.resume();
  void sttAudioContext?.resume();
  void silenceMonitorCtx?.resume();
  silenceStartedAt = null;
  resumeTimer();
  document.body.classList.remove('recording-paused');
  recIndicator.classList.remove('rec-indicator--paused');
  setPauseButtonUi(false);
  status.textContent = recordingStatusMessage();
}

btnPause?.addEventListener('click', togglePauseRecording);

function attachMediaRecorderHandlers() {
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
      segmentByteSize += e.data.size;
      if (
        maxSegmentBytes > 0 &&
        segmentByteSize >= maxSegmentBytes &&
        mediaRecorder &&
        mediaRecorder.state === 'recording'
      ) {
        splitPending = true;
        mediaRecorder.stop();
      }
    }
  };
  mediaRecorder.onstop = handleRecordingStopped;
}

function getCropRectForEncode() {
  if (currentMode === 'area' && areaRect) {
    const cropRect = {
      x: Math.round(areaRect.x * areaRect.scaleFactor),
      y: Math.round(areaRect.y * areaRect.scaleFactor),
      width: Math.round(areaRect.width * areaRect.scaleFactor),
      height: Math.round(areaRect.height * areaRect.scaleFactor),
    };
    cropRect.width = cropRect.width - (cropRect.width % 2);
    cropRect.height = cropRect.height - (cropRect.height % 2);
    return cropRect;
  }
  return null;
}

async function cleanupRecordingSession() {
  stopSilenceMonitor();
  setPreviewSttPanelLocked(false);
  await stopSttPipeline();
  if (recordingStreamRef) {
    recordingStreamRef.getTracks().forEach((track) => track.stop());
  }
  recordingStreamRef = null;
  clearPreviewStream();
  livePreview.classList.add('hidden');
  updateView();
  document.body.classList.remove('recording');
  document.body.classList.remove('recording-paused');
  btnPause?.classList.add('hidden');
  if (btnPause) btnPause.disabled = false;
  setPauseButtonUi(false);
  btnStop.classList.add('hidden');
  btnRecord.classList.remove('hidden');
  recIndicator.classList.add('hidden');
  recIndicator.classList.remove('rec-indicator--paused');
  btnStop.disabled = false;
  stopTimer();
  timer.textContent = '00:00';
  mediaRecorder = null;
  recordedChunks = [];
  sttResult = null;
  userStoppedRecording = false;
  splitPending = false;
}

/* ── Handle recording data ────────────────────────────────── */
async function handleRecordingStopped() {
  stopSilenceMonitor();
  const cropRect = getCropRectForEncode();
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const arrayBuffer = await blob.arrayBuffer();

  if (userStoppedRecording) {
    if (arrayBuffer.byteLength === 0) {
      status.textContent = 'Nothing recorded';
      await cleanupRecordingSession();
      return;
    }

    status.textContent = 'Converting to MP4...';

    await stopSttPipeline();

    const segmentsRaw = sttResult?.segments || [];
    const recordingDurationMs = Math.max(0, getRecordingElapsedMs());
    const subs = finalizeSubtitleSegments(
      segmentsRaw,
      subtitleEdit.value,
      subtitleUserEdited || toggleManualSub.checked,
      recordingDurationMs
    );

    let result;
    if (maxSegmentBytes > 0) {
      const { filePath } = await window.electronAPI.getAutoPartPath({
        sessionId: recordingSessionId,
        partIndex: segmentPartIndex,
      });
      result = await window.electronAPI.saveRecording({
        buffer: arrayBuffer,
        cropRect,
        filePath,
        subtitles: subs,
        subtitleFormat: 'srt',
      });
    } else {
      result = await window.electronAPI.saveRecording({
        buffer: arrayBuffer,
        cropRect,
        subtitles: subs,
        subtitleFormat: 'srt',
      });
    }

    if (result.success) {
      const videoName = result.filePath.split('/').pop();
      if (result.burnedPath) {
        status.textContent = `Saved: ${videoName} + subtitles + burned`;
      } else if (result.subtitlePath) {
        status.textContent = `Saved: ${videoName} + subtitles`;
      } else {
        status.textContent = `Saved: ${videoName}`;
      }
    } else if (result.reason === 'cancelled') {
      status.textContent = 'Save cancelled';
    } else {
      status.textContent = `Error: ${result.reason}`;
    }

    subtitleEditWrap.classList.add('hidden');
    livePreview.classList.remove('live-preview--subtitle-edit');
    subtitleEdit.value = '';
    subtitleUserEdited = false;
    lastSttCombinedText = '';

    if (recordingStreamRef) {
      recordingStreamRef.getTracks().forEach((track) => track.stop());
    }
    recordingStreamRef = null;

    setPreviewSttPanelLocked(false);
    clearPreviewStream();
    livePreview.classList.add('hidden');
    updateView();

    document.body.classList.remove('recording');
    document.body.classList.remove('recording-paused');
    btnPause?.classList.add('hidden');
    if (btnPause) btnPause.disabled = false;
    setPauseButtonUi(false);
    btnStop.classList.add('hidden');
    btnRecord.classList.remove('hidden');
    recIndicator.classList.add('hidden');
    recIndicator.classList.remove('rec-indicator--paused');
    btnStop.disabled = false;
    stopTimer();
    timer.textContent = '00:00';
    mediaRecorder = null;
    recordedChunks = [];
    sttResult = null;
    userStoppedRecording = false;
    return;
  }

  if (splitPending) {
    splitPending = false;
    if (arrayBuffer.byteLength === 0) {
      status.textContent = 'Split error: empty segment';
      await cleanupRecordingSession();
      return;
    }

    btnStop.disabled = true;
    if (btnPause) btnPause.disabled = true;
    const { filePath } = await window.electronAPI.getAutoPartPath({
      sessionId: recordingSessionId,
      partIndex: segmentPartIndex,
    });
    status.textContent = `Saving part ${segmentPartIndex}...`;
    const result = await window.electronAPI.saveRecording({
      buffer: arrayBuffer,
      cropRect,
      filePath,
      subtitles: [],
      subtitleFormat: 'srt',
    });
    btnStop.disabled = false;
    if (btnPause) btnPause.disabled = false;

    if (!result.success) {
      status.textContent = `Error: ${result.reason}`;
      await cleanupRecordingSession();
      return;
    }

    segmentPartIndex += 1;
    recordedChunks = [];
    segmentByteSize = 0;
    status.textContent = recordingStatusMessage();

    mediaRecorder = new MediaRecorder(recordingStreamRef, {
      mimeType: recordingMimeType,
      videoBitsPerSecond: recordingVideoBitrate,
    });
    attachMediaRecorderHandlers();
    mediaRecorder.start(1000);
    return;
  }
}

/* ── Timer (excludes paused time) ─────────────────────────── */
function getTimerElapsedSeconds() {
  const seg =
    timerSegmentStart != null
      ? Math.floor((Date.now() - timerSegmentStart) / 1000)
      : 0;
  return timerBaseSeconds + seg;
}

function getRecordingElapsedMs() {
  return Math.max(0, getTimerElapsedSeconds() * 1000);
}

function updateTimerDisplay() {
  const elapsed = getTimerElapsedSeconds();
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  timer.textContent = `${mins}:${secs}`;
}

function startTimer() {
  timerBaseSeconds = 0;
  timerSegmentStart = Date.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 200);
}

function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerSegmentStart != null) {
    timerBaseSeconds += Math.floor((Date.now() - timerSegmentStart) / 1000);
    timerSegmentStart = null;
  }
  updateTimerDisplay();
}

function resumeTimer() {
  if (timerSegmentStart != null) return;
  timerSegmentStart = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 200);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerBaseSeconds = 0;
  timerSegmentStart = null;
}

/* ── Keyboard shortcuts ───────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
  }
  if (e.key === 'Escape' && !saveModal.classList.contains('hidden') && !saveModalClose.classList.contains('hidden')) {
    saveModal.classList.add('hidden');
  }
  if (e.key === 'Escape' && !burnModal.classList.contains('hidden') && !burnModalClose.classList.contains('hidden')) {
    burnModal.classList.add('hidden');
  }
});

/* ── Window controls ──────────────────────────────────────── */
$('#btn-minimize').addEventListener('click', () =>
  window.electronAPI.minimize()
);
$('#btn-close').addEventListener('click', () => window.electronAPI.close());

/* ── Conversion progress ──────────────────────────────────── */
window.electronAPI.onConversionProgress((msg) => {
  status.textContent = msg;
});

window.electronAPI.onSttUpdate((payload) => {
  const text = payload?.combinedText || payload?.text || '';
  if (!text.trim()) return;
  lastSttCombinedText = text;
  subtitleOverlay.textContent = text;
  subtitleOverlay.classList.remove('hidden');
  applySubtitlePosition();
  if (!subtitleEditFocused) {
    subtitleEdit.value = text;
  }
});

subtitleEdit.addEventListener('focus', () => {
  subtitleEditFocused = true;
});

subtitleEdit.addEventListener('blur', () => {
  subtitleEditFocused = false;
  const auto = (lastSttCombinedText || '').trim();
  if (subtitleEdit.value.trim() !== auto) {
    subtitleUserEdited = true;
  }
});

function syncManualTypedSubtitleToOverlay() {
  if (!document.body.classList.contains('recording')) return;
  if (toggleStt.checked || !toggleManualSub.checked) return;
  const v = subtitleEdit.value;
  if (v.trim()) {
    subtitleOverlay.textContent = v;
    subtitleOverlay.classList.remove('hidden');
    applySubtitlePosition();
  } else {
    subtitleOverlay.textContent = '';
    subtitleOverlay.classList.add('hidden');
  }
}

subtitleEdit.addEventListener('input', () => {
  subtitleUserEdited = true;
  syncManualTypedSubtitleToOverlay();
});

window.electronAPI.onSaveProgress((payload) => {
  if (!payload) return;
  if (payload.stage === 'start') {
    saveModal.classList.remove('hidden');
    saveModalBar.style.width = '0%';
    saveModalStatus.textContent = payload.message || 'Converting to MP4…';
    saveModalPath.classList.add('hidden');
    saveModalClose.classList.add('hidden');
  } else if (payload.stage === 'progress') {
    saveModalStatus.textContent = payload.message || 'Converting…';
    if (payload.percent != null && !Number.isNaN(payload.percent)) {
      saveModalBar.style.width = `${Math.min(100, Math.max(0, payload.percent))}%`;
    }
  } else if (payload.stage === 'done') {
    saveModalStatus.textContent = payload.message || 'Conversion complete';
    saveModalBar.style.width = '100%';
    if (payload.filePath) {
      saveModalPath.textContent = payload.filePath;
      saveModalPath.classList.remove('hidden');
    }
    saveModalClose.classList.remove('hidden');
  } else if (payload.stage === 'error') {
    saveModalStatus.textContent = payload.message || 'Conversion failed';
    saveModalClose.classList.remove('hidden');
  }
});

saveModalClose.addEventListener('click', () => {
  saveModal.classList.add('hidden');
});

window.electronAPI.onBurnProgress((payload) => {
  if (!payload) return;
  if (payload.stage === 'start') {
    saveModal.classList.add('hidden');
    burnModal.classList.remove('hidden');
    burnModalBar.style.width = '0%';
    burnModalStatus.textContent = payload.message || 'Burning subtitles…';
    burnModalPath.classList.add('hidden');
    burnModalClose.classList.add('hidden');
  } else if (payload.stage === 'progress') {
    burnModalStatus.textContent = payload.message || 'Burning…';
    if (payload.percent != null && !Number.isNaN(payload.percent)) {
      burnModalBar.style.width = `${Math.min(100, Math.max(0, payload.percent))}%`;
    }
  } else if (payload.stage === 'done') {
    burnModalStatus.textContent = payload.message || 'Burn complete';
    burnModalBar.style.width = '100%';
    if (payload.filePath) {
      burnModalPath.textContent = payload.filePath;
      burnModalPath.classList.remove('hidden');
    }
    burnModalClose.classList.remove('hidden');
  } else if (payload.stage === 'error') {
    burnModalStatus.textContent = payload.message || 'Burn failed';
    burnModalClose.classList.remove('hidden');
  }
});

burnModalClose.addEventListener('click', () => {
  burnModal.classList.add('hidden');
});

window.electronAPI.onSttError((payload) => {
  const reason = payload?.reason || 'Speech-to-Text failed';
  status.textContent = reason;
});

/* ── Initial load ─────────────────────────────────────────── */
(async () => {
  try {
    if (!window.electronAPI) {
      sourcesGrid.innerHTML =
        '<div class="source-placeholder">App bridge failed to load. Reinstall or run from project folder.</div>';
      status.textContent = 'Preload error';
      return;
    }
    setupSubtitleDragging();
    await hydrateUiThemeFromSettings();
    await applySubtitleAppearance();
    const permission = await window.electronAPI.checkScreenPermission();
    if (permission !== 'granted') {
      status.textContent = 'Grant Screen Recording permission, then restart';
      sourcesGrid.innerHTML =
        '<div class="source-placeholder">Screen Recording permission required.<br>Go to System Settings → Privacy & Security → Screen Recording</div>';
    } else {
      updateView();
    }
  } catch (err) {
    console.error('[init]', err);
    status.textContent = 'Startup error';
    sourcesGrid.innerHTML = `<div class="source-placeholder">Startup error: ${String(err?.message || err)}</div>`;
  }
})();
