const {
  clampSubtitlePx,
  buildCombinedSegmentText,
  finalizeSubtitleSegments,
  recordingStatusMessage,
} = require('../src/renderer/app-logic');

describe('renderer app logic helpers', () => {
  test('clampSubtitlePx clamps and rounds into [10, 48]', () => {
    expect(clampSubtitlePx(undefined)).toBe(16);
    expect(clampSubtitlePx(8)).toBe(10);
    expect(clampSubtitlePx(49)).toBe(48);
    expect(clampSubtitlePx(17.6)).toBe(18);
  });

  test('buildCombinedSegmentText joins segment texts', () => {
    expect(buildCombinedSegmentText([])).toBe('');
    expect(
      buildCombinedSegmentText([{ text: 'hello' }, { text: 'world' }])
    ).toBe('hello world');
  });

  test('finalizeSubtitleSegments creates fallback segment when only user text exists', () => {
    const result = finalizeSubtitleSegments([], 'typed text', true, 5000);
    expect(result).toEqual([{ startMs: 0, endMs: 5000, text: 'typed text' }]);
  });

  test('finalizeSubtitleSegments preserves auto segments when not edited', () => {
    const input = [{ startMs: 100, endMs: 300, text: 'auto' }];
    expect(finalizeSubtitleSegments(input, 'auto', false, 1000)).toBe(input);
  });

  test('finalizeSubtitleSegments rewrites to one segment when edited', () => {
    const input = [{ startMs: 100, endMs: 300, text: 'auto' }];
    const output = finalizeSubtitleSegments(input, 'manual text', true, 1000);
    expect(output).toEqual([{ startMs: 100, endMs: 600, text: 'manual text' }]);
  });

  test('recordingStatusMessage supports segmented and single-file modes', () => {
    expect(recordingStatusMessage(0, 1)).toBe('Recording...');
    expect(recordingStatusMessage(20 * 1024 * 1024, 3)).toBe('Recording...');
  });
});
