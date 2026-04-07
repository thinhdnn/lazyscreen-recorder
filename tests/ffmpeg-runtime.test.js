jest.mock('ffmpeg-static', () => '/mock/ffmpeg');

const mockFfprobe = jest.fn();
const mockSetFfmpegPath = jest.fn();
const mockFfmpegFactory = jest.fn();

jest.mock('fluent-ffmpeg', () => {
  const api = (...args) => mockFfmpegFactory(...args);
  api.ffprobe = (...args) => mockFfprobe(...args);
  api.setFfmpegPath = (...args) => mockSetFfmpegPath(...args);
  return api;
});

function createCommandHarness() {
  const handlers = {};
  const command = {
    outputOptions: jest.fn(() => command),
    videoFilter: jest.fn(() => command),
    videoFilters: jest.fn(() => command),
    noAudio: jest.fn(() => command),
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
      return command;
    }),
    save: jest.fn(() => command),
  };
  return { command, handlers };
}

describe('ffmpeg runtime paths', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFfprobe.mockReset();
    mockSetFfmpegPath.mockReset();
    mockFfmpegFactory.mockReset();
  });

  test('convertToMp4 applies crop + audio options and resolves on end', async () => {
    const { command, handlers } = createCommandHarness();
    mockFfmpegFactory.mockReturnValue(command);
    mockFfprobe.mockImplementation((_input, cb) => {
      cb(null, { streams: [{ codec_type: 'audio' }] });
    });

    const { convertToMp4 } = require('../src/main/ffmpeg');
    const progress = jest.fn();

    const promise = convertToMp4(
      '/tmp/in.webm',
      '/tmp/out.mp4',
      { x: 1, y: 2, width: 3, height: 4 },
      'compact',
      progress
    );
    await Promise.resolve();

    expect(mockFfmpegFactory).toHaveBeenCalledWith('/tmp/in.webm');
    expect(command.videoFilter).toHaveBeenCalledWith('crop=3:4:1:2');
    expect(command.save).toHaveBeenCalledWith('/tmp/out.mp4');

    handlers.progress({ percent: 42.6 });
    expect(progress).toHaveBeenCalledWith({
      message: 'Converting to MP4… 43%',
      percent: 43,
    });

    handlers.end();
    await expect(promise).resolves.toBe('/tmp/out.mp4');
  });

  test('convertToMp4 disables audio when ffprobe has no audio stream', async () => {
    const { command, handlers } = createCommandHarness();
    mockFfmpegFactory.mockReturnValue(command);
    mockFfprobe.mockImplementation((_input, cb) => {
      cb(null, { streams: [{ codec_type: 'video' }] });
    });

    const { convertToMp4 } = require('../src/main/ffmpeg');
    const promise = convertToMp4('/tmp/in.webm', '/tmp/out.mp4', null, 'normal');
    await Promise.resolve();

    expect(command.noAudio).toHaveBeenCalledTimes(1);
    handlers.end();
    await expect(promise).resolves.toBe('/tmp/out.mp4');
  });

  test('convertToMp4 rejects on ffmpeg error', async () => {
    const { command, handlers } = createCommandHarness();
    mockFfmpegFactory.mockReturnValue(command);
    mockFfprobe.mockImplementation((_input, cb) => {
      cb(null, { streams: [{ codec_type: 'audio' }] });
    });

    const { convertToMp4 } = require('../src/main/ffmpeg');
    const promise = convertToMp4('/tmp/in.webm', '/tmp/out.mp4');
    await Promise.resolve();
    const err = new Error('convert failed');
    handlers.error(err, '', 'stderr');

    await expect(promise).rejects.toThrow('convert failed');
  });

  test('burnSubtitlesIntoVideo escapes subtitle path and reports progress', async () => {
    const { command, handlers } = createCommandHarness();
    mockFfmpegFactory.mockReturnValue(command);
    mockFfprobe.mockImplementation((_input, cb) => {
      cb(null, { streams: [{ codec_type: 'audio' }] });
    });

    const { burnSubtitlesIntoVideo } = require('../src/main/ffmpeg');
    const progress = jest.fn();
    const promise = burnSubtitlesIntoVideo(
      '/tmp/in.mp4',
      "C:\\tmp\\subs:it's.srt",
      '/tmp/out.mp4',
      progress,
      'normal'
    );
    await Promise.resolve();

    expect(command.videoFilters).toHaveBeenCalledWith(
      "subtitles='C\\:/tmp/subs\\:it'\\''s.srt'"
    );

    handlers.progress({ percent: 99.9 });
    expect(progress).toHaveBeenCalledWith({
      message: 'Burning subtitles… 100%',
      percent: 100,
    });

    handlers.end();
    await expect(promise).resolves.toBe('/tmp/out.mp4');
  });
});
