const socketInstances = [];

jest.mock('ws', () =>
  jest.fn().mockImplementation(() => {
    const handlers = {};
    const ws = {
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
        return ws;
      }),
      send: jest.fn(),
      close: jest.fn(),
      __emit: (event, payload) => handlers[event]?.(payload),
    };
    socketInstances.push(ws);
    return ws;
  })
);

const { SonioxClient } = require('../src/main/soniox');

describe('SonioxClient runtime websocket flow', () => {
  beforeEach(() => {
    socketInstances.length = 0;
  });

  test('sends config on open and flushes queued audio', () => {
    const onTranscript = jest.fn();
    const onError = jest.fn();
    const client = new SonioxClient({
      apiKey: 'k',
      languageHints: ['en'],
      languageHintsStrict: true,
      contextPayload: { text: 'context' },
      translationConfig: { type: 'one_way', target_language: 'vi' },
    });

    client.startSession({ onTranscript, onError });
    const ws = socketInstances[0];
    client.sendAudioChunk(new ArrayBuffer(4));
    expect(ws.send).not.toHaveBeenCalled();

    ws.__emit('open');
    expect(ws.send).toHaveBeenCalled();
    expect(String(ws.send.mock.calls[0][0])).toContain('"api_key":"k"');
    expect(String(ws.send.mock.calls[0][0])).toContain('"language_hints":["en"]');
    expect(String(ws.send.mock.calls[0][0])).toContain('"translation"');
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  test('handles final token message and finished message', () => {
    const onTranscript = jest.fn();
    const client = new SonioxClient({ apiKey: 'k' });
    client.startSession({ onTranscript, onError: jest.fn() });
    const ws = socketInstances[0];
    ws.__emit('open');

    ws.__emit(
      'message',
      JSON.stringify({
        tokens: [
          { text: 'Hello', is_final: true, start_ms: 0, end_ms: 100 },
          { text: ' world', is_final: true, start_ms: 100, end_ms: 220 },
        ],
      })
    );

    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        text: 'Hello world',
      })
    );

    ws.__emit('message', JSON.stringify({ finished: true, text: 'Done' }));
    expect(onTranscript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isFinal: true,
        text: 'Done',
      })
    );
  });

  test('reports websocket and payload errors', () => {
    const onError = jest.fn();
    const client = new SonioxClient({ apiKey: 'k' });
    client.startSession({ onTranscript: jest.fn(), onError });
    const ws = socketInstances[0];
    ws.__emit('open');

    ws.__emit('message', 'not-json');
    ws.__emit('message', JSON.stringify({ error_code: 403 }));
    ws.__emit('error', new Error('socket down'));

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Soniox error 403'));
    expect(onError).toHaveBeenCalledWith('Soniox socket error: socket down');
  });
});
