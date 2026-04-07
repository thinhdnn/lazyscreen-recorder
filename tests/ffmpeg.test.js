const { getEncodingProfile } = require('../src/main/ffmpeg');

describe('getEncodingProfile', () => {
  test('returns normal profile by default', () => {
    const profile = getEncodingProfile('normal');
    expect(profile).toEqual({
      crf: 23,
      preset: 'veryfast',
      audioK: '128k',
    });
  });

  test('returns compact profile', () => {
    const profile = getEncodingProfile('compact');
    expect(profile).toEqual({
      crf: 26,
      preset: 'veryfast',
      audioK: '96k',
    });
  });

  test('returns normal profile for undefined input', () => {
    const profile = getEncodingProfile(undefined);
    expect(profile).toEqual({
      crf: 23,
      preset: 'veryfast',
      audioK: '128k',
    });
  });

  test('returns normal profile for unknown string', () => {
    const profile = getEncodingProfile('ultra');
    expect(profile).toEqual({
      crf: 23,
      preset: 'veryfast',
      audioK: '128k',
    });
  });

  test('compact has higher CRF (lower quality, smaller file)', () => {
    const compact = getEncodingProfile('compact');
    const normal = getEncodingProfile('normal');
    expect(compact.crf).toBeGreaterThan(normal.crf);
  });

  test('compact has lower audio bitrate', () => {
    const compact = getEncodingProfile('compact');
    const normal = getEncodingProfile('normal');
    expect(parseInt(compact.audioK)).toBeLessThan(parseInt(normal.audioK));
  });
});
