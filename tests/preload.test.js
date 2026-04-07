const mockExposeInMainWorld = jest.fn();
const mockInvoke = jest.fn();
const mockSend = jest.fn();
const mockOn = jest.fn();

jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args) => mockExposeInMainWorld(...args),
  },
  ipcRenderer: {
    invoke: (...args) => mockInvoke(...args),
    send: (...args) => mockSend(...args),
    on: (...args) => mockOn(...args),
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExposeInMainWorld.mockReset();
    mockInvoke.mockReset();
    mockSend.mockReset();
    mockOn.mockReset();
  });

  test('exposes initial theme from process argv', () => {
    const originalArgv = process.argv.slice();
    process.argv = ['node', 'test', '--ui-theme=light'];
    require('../src/preload');

    expect(mockExposeInMainWorld).toHaveBeenCalledWith('__initialUiTheme', 'light');
    process.argv = originalArgv;
  });

  test('exposes default dark theme when arg is missing', () => {
    const originalArgv = process.argv.slice();
    process.argv = ['node', 'test'];
    require('../src/preload');

    expect(mockExposeInMainWorld).toHaveBeenCalledWith('__initialUiTheme', 'dark');
    process.argv = originalArgv;
  });

  test('electronAPI forwards invoke/send/on channels', () => {
    require('../src/preload');
    const call = mockExposeInMainWorld.mock.calls.find((c) => c[0] === 'electronAPI');
    const api = call[1];

    api.checkScreenPermission();
    expect(mockInvoke).toHaveBeenCalledWith('check-screen-permission');

    api.getSources('screen');
    expect(mockInvoke).toHaveBeenCalledWith('get-sources', 'screen');

    api.sttAudioChunk(new ArrayBuffer(2));
    expect(mockSend).toHaveBeenCalledWith('stt-audio-chunk', {
      chunk: expect.any(ArrayBuffer),
    });

    const cb = jest.fn();
    api.onSttUpdate(cb);
    expect(mockOn).toHaveBeenCalledWith('stt-update', expect.any(Function));
  });
});
