const {
  SonioxClient,
  joinTokensForDisplay,
  timedSourceTokens,
  extractTranscriptText,
} = require('../src/main/soniox');

// ─── joinTokensForDisplay ────────────────────────────────────────────────────

describe('joinTokensForDisplay', () => {
  test('returns empty string for empty/null tokens', () => {
    expect(joinTokensForDisplay([], false)).toBe('');
    expect(joinTokensForDisplay(null, false)).toBe('');
    expect(joinTokensForDisplay(undefined, false)).toBe('');
  });

  test('joins text from all tokens when preferTranslation is false', () => {
    const tokens = [
      { text: 'Hello' },
      { text: ' ' },
      { text: 'world' },
    ];
    expect(joinTokensForDisplay(tokens, false)).toBe('Hello world');
  });

  test('joins only translation tokens when preferTranslation is true', () => {
    const tokens = [
      { text: 'Bonjour', translation_status: 'original' },
      { text: ' ', translation_status: 'original' },
      { text: 'Hello', translation_status: 'translation' },
      { text: ' ', translation_status: 'translation' },
      { text: 'world', translation_status: 'translation' },
    ];
    expect(joinTokensForDisplay(tokens, true)).toBe('Hello world');
  });

  test('returns empty when preferTranslation is true but no translation tokens', () => {
    const tokens = [
      { text: 'Bonjour', translation_status: 'original' },
    ];
    expect(joinTokensForDisplay(tokens, true)).toBe('');
  });

  test('handles tokens with missing text', () => {
    const tokens = [{ text: 'Hi' }, { notext: true }, { text: '!' }];
    expect(joinTokensForDisplay(tokens, false)).toBe('Hi!');
  });

  test('handles null tokens in array', () => {
    const tokens = [null, { text: 'test' }, undefined];
    expect(joinTokensForDisplay(tokens, false)).toBe('test');
  });
});

// ─── timedSourceTokens ──────────────────────────────────────────────────────

describe('timedSourceTokens', () => {
  test('returns empty array for null/undefined', () => {
    expect(timedSourceTokens(null)).toEqual([]);
    expect(timedSourceTokens(undefined)).toEqual([]);
  });

  test('filters out translation tokens', () => {
    const tokens = [
      { text: 'Hello', start_ms: 0, translation_status: undefined },
      { text: 'Bonjour', start_ms: 100, translation_status: 'translation' },
    ];
    const result = timedSourceTokens(tokens);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello');
  });

  test('filters out tokens without start_ms', () => {
    const tokens = [
      { text: 'A', start_ms: 0 },
      { text: 'B' },
    ];
    const result = timedSourceTokens(tokens);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('A');
  });

  test('includes tokens with start_ms = 0', () => {
    const tokens = [{ text: 'Start', start_ms: 0 }];
    expect(timedSourceTokens(tokens)).toHaveLength(1);
  });
});

// ─── extractTranscriptText ──────────────────────────────────────────────────

describe('extractTranscriptText', () => {
  test('returns empty for null/undefined/non-object', () => {
    expect(extractTranscriptText(null, false)).toBe('');
    expect(extractTranscriptText(undefined, false)).toBe('');
    expect(extractTranscriptText('string', false)).toBe('');
  });

  test('extracts from tokens array', () => {
    const msg = { tokens: [{ text: 'Hello' }, { text: ' world' }] };
    expect(extractTranscriptText(msg, false)).toBe('Hello world');
  });

  test('falls back to msg.text', () => {
    const msg = { text: '  Hello  ' };
    expect(extractTranscriptText(msg, false)).toBe('Hello');
  });

  test('falls back to msg.transcript', () => {
    const msg = { transcript: '  Test  ' };
    expect(extractTranscriptText(msg, false)).toBe('Test');
  });

  test('falls back to msg.result.text', () => {
    const msg = { result: { text: 'Nested result' } };
    expect(extractTranscriptText(msg, false)).toBe('Nested result');
  });

  test('falls back to msg.results array', () => {
    const msg = {
      results: [{ text: 'First' }, { transcript: 'Second' }],
    };
    expect(extractTranscriptText(msg, false)).toBe('First Second');
  });

  test('tokens take priority over text fields', () => {
    const msg = {
      tokens: [{ text: 'From tokens' }],
      text: 'From text',
    };
    expect(extractTranscriptText(msg, false)).toBe('From tokens');
  });

  test('empty tokens array falls through to text', () => {
    const msg = { tokens: [], text: 'Fallback' };
    expect(extractTranscriptText(msg, false)).toBe('Fallback');
  });
});

// ─── SonioxClient ───────────────────────────────────────────────────────────

describe('SonioxClient', () => {
  describe('constructor', () => {
    test('sets default wsUrl when not provided', () => {
      const client = new SonioxClient({ apiKey: 'test-key' });
      expect(client.wsUrl).toBe('wss://stt-rt.soniox.com/transcribe-websocket');
    });

    test('uses custom wsUrl when provided', () => {
      const client = new SonioxClient({
        apiKey: 'test-key',
        wsUrl: 'wss://custom.example.com',
      });
      expect(client.wsUrl).toBe('wss://custom.example.com');
    });

    test('initializes languageHints from array', () => {
      const client = new SonioxClient({
        apiKey: 'k',
        languageHints: ['en', 'vi'],
      });
      expect(client.languageHints).toEqual(['en', 'vi']);
    });

    test('sets languageHints to null for empty array', () => {
      const client = new SonioxClient({
        apiKey: 'k',
        languageHints: [],
      });
      expect(client.languageHints).toBeNull();
    });

    test('sets languageHints to null when undefined', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      expect(client.languageHints).toBeNull();
    });

    test('sets preferTranslation based on translationConfig', () => {
      const withTranslation = new SonioxClient({
        apiKey: 'k',
        translationConfig: { type: 'one_way', target_language: 'vi' },
      });
      expect(withTranslation.preferTranslation).toBe(true);

      const withoutTranslation = new SonioxClient({ apiKey: 'k' });
      expect(withoutTranslation.preferTranslation).toBe(false);
    });

    test('initializes empty state', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      expect(client.partialText).toBe('');
      expect(client.finalSegments).toEqual([]);
      expect(client.segmentCounter).toBe(0);
      expect(client.connected).toBe(false);
      expect(client.ws).toBeNull();
    });

    test('contextPayload set when valid object', () => {
      const client = new SonioxClient({
        apiKey: 'k',
        contextPayload: { general: [{ key: 'domain', value: 'tech' }] },
      });
      expect(client.contextPayload).toEqual({
        general: [{ key: 'domain', value: 'tech' }],
      });
    });

    test('contextPayload null for non-object', () => {
      const client = new SonioxClient({
        apiKey: 'k',
        contextPayload: 'invalid',
      });
      expect(client.contextPayload).toBeNull();
    });
  });

  describe('startSession', () => {
    test('throws when apiKey is missing', () => {
      const client = new SonioxClient({ apiKey: '' });
      expect(() =>
        client.startSession({ onTranscript: jest.fn(), onError: jest.fn() })
      ).toThrow('SONIOX_API_KEY is missing');
    });
  });

  describe('getCombinedTranscript', () => {
    test('returns empty string when no segments or partial', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      expect(client.getCombinedTranscript()).toBe('');
    });

    test('combines final segments', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.finalSegments = [
        { text: 'Hello' },
        { text: 'world' },
      ];
      expect(client.getCombinedTranscript()).toBe('Hello world');
    });

    test('appends partial text', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.finalSegments = [{ text: 'Hello' }];
      client.partialText = 'wor';
      expect(client.getCombinedTranscript()).toBe('Hello wor');
    });

    test('returns partial only when no final segments', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.partialText = 'typing...';
      expect(client.getCombinedTranscript()).toBe('typing...');
    });
  });

  describe('stopSession', () => {
    test('returns transcript and segments when no ws', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.finalSegments = [{ text: 'Done', startMs: 0, endMs: 1000 }];
      const result = client.stopSession();
      expect(result.transcript).toBe('Done');
      expect(result.segments).toHaveLength(1);
    });

    test('clears audio queue on stop', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client._audioQueue = [Buffer.from('test')];
      client.stopSession();
      expect(client._audioQueue).toEqual([]);
    });

    test('sets connected to false and ws to null', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.connected = true;
      client.stopSession();
      expect(client.connected).toBe(false);
      expect(client.ws).toBeNull();
    });
  });

  describe('sendAudioChunk', () => {
    test('does nothing when ws is null', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      expect(() => client.sendAudioChunk(new ArrayBuffer(10))).not.toThrow();
    });

    test('queues data when not connected', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.ws = { send: jest.fn() };
      client.connected = false;
      client.sendAudioChunk(new ArrayBuffer(10));
      expect(client._audioQueue).toHaveLength(1);
      expect(client.ws.send).not.toHaveBeenCalled();
    });

    test('sends directly when connected', () => {
      const client = new SonioxClient({ apiKey: 'k' });
      client.ws = { send: jest.fn() };
      client.connected = true;
      client.sendAudioChunk(new ArrayBuffer(10));
      expect(client.ws.send).toHaveBeenCalledTimes(1);
      expect(client._audioQueue).toHaveLength(0);
    });
  });
});
