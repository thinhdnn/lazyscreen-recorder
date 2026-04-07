const WebSocket = require('ws');

/**
 * @param {Array<{ text?: string, translation_status?: string }>} tokens
 * @param {boolean} preferTranslation
 */
function joinTokensForDisplay(tokens, preferTranslation) {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  if (!preferTranslation) {
    return tokens.map((t) => (t && typeof t.text === 'string' ? t.text : '')).join('');
  }
  // Translation mode: only use translation tokens. Never fall back to original/none here —
  // mixing final translated segments with partial originals made live subs show two languages.
  const trans = tokens.filter(
    (t) => t && t.translation_status === 'translation'
  );
  return trans.map((t) => (typeof t.text === 'string' ? t.text : '')).join('');
}

/**
 * Tokens with audio-aligned timestamps (not translation tokens).
 * @param {Array<{ translation_status?: string, start_ms?: number }>} tokens
 */
function timedSourceTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  return tokens.filter(
    (t) =>
      t &&
      t.translation_status !== 'translation' &&
      typeof t.start_ms === 'number'
  );
}

function extractTranscriptText(msg, preferTranslation) {
  if (!msg || typeof msg !== 'object') return '';
  if (Array.isArray(msg.tokens) && msg.tokens.length > 0) {
    return joinTokensForDisplay(msg.tokens, preferTranslation);
  }
  if (typeof msg.text === 'string') return msg.text.trim();
  if (typeof msg.transcript === 'string') return msg.transcript.trim();
  if (typeof msg.result?.text === 'string') return msg.result.text.trim();
  if (Array.isArray(msg.results)) {
    return msg.results
      .map((r) => r?.text || r?.transcript || '')
      .join(' ')
      .trim();
  }
  return '';
}

class SonioxClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.wsUrl]
   * @param {string[] | null} [opts.languageHints] — omit from config when null/empty (auto-detect)
   * @param {boolean} [opts.languageHintsStrict]
   * @param {Record<string, unknown> | null} [opts.contextPayload] — Soniox `context` object
   * @param {{ type: string, target_language?: string, language_a?: string, language_b?: string } | null} [opts.translationConfig]
   */
  constructor({
    apiKey,
    wsUrl,
    languageHints,
    languageHintsStrict,
    contextPayload,
    translationConfig,
  }) {
    this.apiKey = apiKey;
    this.wsUrl = wsUrl || 'wss://stt-rt.soniox.com/transcribe-websocket';
    this.languageHints =
      Array.isArray(languageHints) && languageHints.length > 0
        ? languageHints
        : null;
    this.languageHintsStrict = Boolean(languageHintsStrict);
    this.contextPayload =
      contextPayload && typeof contextPayload === 'object'
        ? contextPayload
        : null;
    this.translationConfig =
      translationConfig && typeof translationConfig === 'object'
        ? translationConfig
        : null;
    /** Prefer subtitle text from tokens with translation_status "translation" */
    this.preferTranslation = Boolean(this.translationConfig);
    this.ws = null;
    this.connected = false;
    /** @type {Buffer[]} */
    this._audioQueue = [];
    this.partialText = '';
    this.finalSegments = [];
    this.segmentCounter = 0;
    this.onTranscript = null;
    this.onError = null;
  }

  startSession({ onTranscript, onError }) {
    if (!this.apiKey) {
      throw new Error('SONIOX_API_KEY is missing');
    }

    this.onTranscript = onTranscript;
    this.onError = onError;

    // API key is sent in the first JSON config message (see Soniox WebSocket docs).
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.connected = true;
      // Current Soniox RT API: config JSON (not legacy event:start). See
      // https://soniox.com/docs/stt/api-reference/websocket-api
      const cfg = {
        api_key: this.apiKey,
        model: 'stt-rt-preview',
        audio_format: 'pcm_s16le',
        sample_rate: 16000,
        num_channels: 1,
      };
      if (this.languageHints) {
        cfg.language_hints = this.languageHints;
      }
      if (this.languageHintsStrict) {
        cfg.language_hints_strict = true;
      }
      if (this.contextPayload) {
        cfg.context = this.contextPayload;
      }
      if (this.translationConfig) {
        cfg.translation = this.translationConfig;
      }
      this.ws.send(JSON.stringify(cfg));
      this._flushAudioQueue();
    });

    this.ws.on('message', (raw) => {
      try {
        let rawStr;
        if (Buffer.isBuffer(raw)) {
          rawStr = raw.toString('utf8');
        } else if (raw instanceof ArrayBuffer) {
          rawStr = Buffer.from(raw).toString('utf8');
        } else {
          rawStr = String(raw);
        }
        const trimmed = rawStr.trim();
        if (!trimmed.startsWith('{')) return;
        const msg = JSON.parse(trimmed);
        if (msg.error_message || msg.error_code) {
          this.onError?.(
            typeof msg.error_message === 'string'
              ? msg.error_message
              : `Soniox error ${msg.error_code}`
          );
          return;
        }
        if (msg.finished) {
          const text = extractTranscriptText(msg, this.preferTranslation);
          this.onTranscript?.({
            text,
            isFinal: true,
            combinedText: text || this.getCombinedTranscript(),
            segments: this.finalSegments,
          });
          return;
        }
        const tokens = msg.tokens;
        const text = extractTranscriptText(msg, this.preferTranslation);
        if (!text && (!Array.isArray(tokens) || tokens.length === 0)) return;

        const allTokensFinal =
          Array.isArray(tokens) &&
          tokens.length > 0 &&
          tokens.every((t) => t && t.is_final);

        if (allTokensFinal) {
          const shouldStoreSegment =
            !this.preferTranslation || Boolean(text && text.trim());
          if (shouldStoreSegment) {
            const idx = this.segmentCounter;
            this.segmentCounter += 1;
            const timed = timedSourceTokens(tokens);
            const startMs = timed.length ? Number(timed[0].start_ms) : 0;
            const endMs = timed.length
              ? Number(timed[timed.length - 1].end_ms ?? 0)
              : 0;
            this.finalSegments.push({
              index: idx,
              text,
              startMs,
              endMs,
            });
          }
          this.partialText = '';
        } else {
          this.partialText = text;
        }

        this.onTranscript?.({
          text,
          isFinal: allTokensFinal,
          combinedText: this.getCombinedTranscript(),
          segments: this.finalSegments,
        });
      } catch (err) {
        this.onError?.(`Invalid Soniox response: ${err.message}`);
      }
    });

    this.ws.on('error', (err) => {
      this._audioQueue = [];
      this.onError?.(`Soniox socket error: ${err.message}`);
    });

    this.ws.on('close', () => {
      this.connected = false;
      this._audioQueue = [];
    });
  }

  _flushAudioQueue() {
    if (!this.ws || !this.connected || !this._audioQueue.length) return;
    for (let i = 0; i < this._audioQueue.length; i += 1) {
      this.ws.send(this._audioQueue[i]);
    }
    this._audioQueue = [];
  }

  sendAudioChunk(chunkBuffer) {
    if (!this.ws) return;
    const buf = Buffer.from(chunkBuffer);
    if (!this.connected) {
      this._audioQueue.push(buf);
      return;
    }
    this.ws.send(buf);
  }

  stopSession() {
    this._audioQueue = [];
    if (this.ws && this.connected) {
      try {
        this.ws.send(Buffer.alloc(0));
      } catch (_) {}
      try {
        this.ws.close();
      } catch (_) {}
    }
    this.connected = false;
    this.ws = null;

    return {
      transcript: this.getCombinedTranscript(),
      segments: this.finalSegments,
    };
  }

  getCombinedTranscript() {
    const finalText = this.finalSegments.map((s) => s.text).join(' ').trim();
    if (this.partialText) {
      return `${finalText} ${this.partialText}`.trim();
    }
    return finalText;
  }
}

module.exports = {
  SonioxClient,
  joinTokensForDisplay,
  timedSourceTokens,
  extractTranscriptText,
};
