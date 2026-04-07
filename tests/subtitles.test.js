const { buildSrt, buildVtt } = require('../src/main/subtitles');

describe('buildSrt', () => {
  test('returns empty string for empty segments', () => {
    expect(buildSrt([])).toBe('');
  });

  test('generates correct SRT format for a single segment', () => {
    const segments = [{ startMs: 0, endMs: 3500, text: 'Hello world' }];
    const result = buildSrt(segments);
    expect(result).toBe('1\n00:00:00,000 --> 00:00:03,500\nHello world\n');
  });

  test('generates correct SRT for multiple segments', () => {
    const segments = [
      { startMs: 0, endMs: 2000, text: 'First line' },
      { startMs: 2500, endMs: 5000, text: 'Second line' },
    ];
    const result = buildSrt(segments);
    expect(result).toContain('1\n00:00:00,000 --> 00:00:02,000\nFirst line\n');
    expect(result).toContain('2\n00:00:02,500 --> 00:00:05,000\nSecond line\n');
  });

  test('handles large timestamps (hours)', () => {
    const segments = [
      { startMs: 3661500, endMs: 3665000, text: 'After an hour' },
    ];
    const result = buildSrt(segments);
    expect(result).toContain('01:01:01,500 --> 01:01:05,000');
  });

  test('uses comma separator for SRT milliseconds', () => {
    const segments = [{ startMs: 1234, endMs: 5678, text: 'test' }];
    const result = buildSrt(segments);
    expect(result).toContain('00:00:01,234');
    expect(result).toContain('00:00:05,678');
  });

  test('defaults startMs to 0 when missing', () => {
    const segments = [{ endMs: 2000, text: 'No start' }];
    const result = buildSrt(segments);
    expect(result).toContain('00:00:00,000 --> 00:00:02,000');
  });

  test('defaults endMs to startMs + 2000 when missing', () => {
    const segments = [{ startMs: 1000, text: 'No end' }];
    const result = buildSrt(segments);
    expect(result).toContain('00:00:01,000 --> 00:00:03,000');
  });

  test('handles empty text', () => {
    const segments = [{ startMs: 0, endMs: 1000 }];
    const result = buildSrt(segments);
    expect(result).toContain('00:00:00,000 --> 00:00:01,000\n\n');
  });

  test('handles negative ms by clamping to 0', () => {
    const segments = [{ startMs: -500, endMs: 1000, text: 'Negative' }];
    const result = buildSrt(segments);
    expect(result).toContain('00:00:00,000');
  });
});

describe('buildVtt', () => {
  test('returns WEBVTT header for empty segments', () => {
    const result = buildVtt([]);
    expect(result).toBe('WEBVTT\n\n');
  });

  test('starts with WEBVTT header', () => {
    const segments = [{ startMs: 0, endMs: 1000, text: 'Test' }];
    const result = buildVtt(segments);
    expect(result).toMatch(/^WEBVTT\n\n/);
  });

  test('uses dot separator for VTT milliseconds (not comma)', () => {
    const segments = [{ startMs: 1234, endMs: 5678, text: 'test' }];
    const result = buildVtt(segments);
    expect(result).toContain('00:00:01.234');
    expect(result).toContain('00:00:05.678');
    expect(result).not.toContain(',');
  });

  test('generates correct VTT format for a single segment', () => {
    const segments = [{ startMs: 500, endMs: 3000, text: 'Caption' }];
    const result = buildVtt(segments);
    expect(result).toBe(
      'WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nCaption\n'
    );
  });

  test('does not include sequence numbers (unlike SRT)', () => {
    const segments = [
      { startMs: 0, endMs: 1000, text: 'A' },
      { startMs: 1000, endMs: 2000, text: 'B' },
    ];
    const result = buildVtt(segments);
    const lines = result.split('\n');
    expect(lines[0]).toBe('WEBVTT');
    expect(lines[2]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  test('handles missing startMs/endMs same as buildSrt', () => {
    const segments = [{ text: 'Defaults' }];
    const result = buildVtt(segments);
    expect(result).toContain('00:00:00.000 --> 00:00:02.000');
  });
});
