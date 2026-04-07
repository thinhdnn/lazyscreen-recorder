const {
  clampSubtitlePx,
  buildCombinedSegmentText,
  finalizeSubtitleSegments,
  clamp,
} = require('../src/renderer/subtitle-utils');

// ─── clamp ──────────────────────────────────────────────────────────────────

describe('clamp', () => {
  test('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('returns min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('returns max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('returns min when min equals max', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  test('handles negative ranges', () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(-20, -10, -1)).toBe(-10);
    expect(clamp(5, -10, -1)).toBe(-1);
  });
});

// ─── clampSubtitlePx ────────────────────────────────────────────────────────

describe('clampSubtitlePx', () => {
  test('returns value within valid range', () => {
    expect(clampSubtitlePx(16)).toBe(16);
    expect(clampSubtitlePx(24)).toBe(24);
  });

  test('clamps below minimum to 10', () => {
    expect(clampSubtitlePx(5)).toBe(10);
    expect(clampSubtitlePx(-10)).toBe(10);
  });

  test('defaults to 16 for zero (falsy coercion via ||)', () => {
    expect(clampSubtitlePx(0)).toBe(16);
  });

  test('clamps above maximum to 48', () => {
    expect(clampSubtitlePx(100)).toBe(48);
    expect(clampSubtitlePx(49)).toBe(48);
  });

  test('rounds to nearest integer', () => {
    expect(clampSubtitlePx(16.4)).toBe(16);
    expect(clampSubtitlePx(16.5)).toBe(17);
    expect(clampSubtitlePx(16.9)).toBe(17);
  });

  test('defaults to 16 for NaN values', () => {
    expect(clampSubtitlePx(NaN)).toBe(16);
    expect(clampSubtitlePx('abc')).toBe(16);
    expect(clampSubtitlePx(undefined)).toBe(16);
    expect(clampSubtitlePx(null)).toBe(16);
  });

  test('handles string numbers', () => {
    expect(clampSubtitlePx('24')).toBe(24);
    expect(clampSubtitlePx('100')).toBe(48);
  });
});

// ─── buildCombinedSegmentText ───────────────────────────────────────────────

describe('buildCombinedSegmentText', () => {
  test('returns empty string for empty array', () => {
    expect(buildCombinedSegmentText([])).toBe('');
  });

  test('returns empty string for null/undefined', () => {
    expect(buildCombinedSegmentText(null)).toBe('');
    expect(buildCombinedSegmentText(undefined)).toBe('');
  });

  test('returns empty string for non-array', () => {
    expect(buildCombinedSegmentText('string')).toBe('');
  });

  test('joins segment texts with space', () => {
    const segments = [
      { text: 'Hello' },
      { text: 'world' },
    ];
    expect(buildCombinedSegmentText(segments)).toBe('Hello world');
  });

  test('trims outer whitespace but preserves inner joins', () => {
    const segments = [{ text: ' Hello ' }, { text: ' world ' }];
    expect(buildCombinedSegmentText(segments)).toBe('Hello   world');
  });

  test('handles single segment', () => {
    expect(buildCombinedSegmentText([{ text: 'Only' }])).toBe('Only');
  });
});

// ─── finalizeSubtitleSegments ───────────────────────────────────────────────

describe('finalizeSubtitleSegments', () => {
  describe('when segments are empty', () => {
    test('returns empty array when userText is empty', () => {
      expect(finalizeSubtitleSegments([], '', false, 5000)).toEqual([]);
      expect(finalizeSubtitleSegments(null, '', false, 5000)).toEqual([]);
    });

    test('returns empty array when userText is whitespace only', () => {
      expect(finalizeSubtitleSegments([], '   ', false, 5000)).toEqual([]);
    });

    test('creates single segment from userText', () => {
      const result = finalizeSubtitleSegments([], 'Manual text', false, 10000);
      expect(result).toHaveLength(1);
      expect(result[0].startMs).toBe(0);
      expect(result[0].endMs).toBe(10000);
      expect(result[0].text).toBe('Manual text');
    });

    test('uses recording duration as endMs', () => {
      const result = finalizeSubtitleSegments([], 'Text', false, 30000);
      expect(result[0].endMs).toBe(30000);
    });

    test('defaults endMs to 60000 when duration not provided', () => {
      const result = finalizeSubtitleSegments([], 'Text', false, 0);
      expect(result[0].endMs).toBe(60000);
    });

    test('enforces minimum endMs of 1000', () => {
      const result = finalizeSubtitleSegments([], 'Text', false, 500);
      expect(result[0].endMs).toBe(1000);
    });

    test('caps endMs at 24 hours', () => {
      const day = 24 * 3600000;
      const result = finalizeSubtitleSegments([], 'Text', false, day + 100000);
      expect(result[0].endMs).toBeLessThanOrEqual(day);
    });
  });

  describe('when segments exist and user has not edited', () => {
    test('returns original segments when not user edited', () => {
      const segments = [
        { startMs: 0, endMs: 2000, text: 'Hello' },
        { startMs: 2000, endMs: 4000, text: 'World' },
      ];
      const result = finalizeSubtitleSegments(segments, 'Hello World', false, 5000);
      expect(result).toBe(segments);
    });

    test('returns original segments when user text matches auto text', () => {
      const segments = [
        { startMs: 0, endMs: 2000, text: 'Hello' },
        { startMs: 2000, endMs: 4000, text: 'World' },
      ];
      const result = finalizeSubtitleSegments(segments, 'Hello World', true, 5000);
      expect(result).toBe(segments);
    });
  });

  describe('when user has edited text', () => {
    test('returns empty array when user clears text', () => {
      const segments = [{ startMs: 0, endMs: 2000, text: 'Auto' }];
      const result = finalizeSubtitleSegments(segments, '', true, 5000);
      expect(result).toEqual([]);
    });

    test('returns single segment with user text spanning original time range', () => {
      const segments = [
        { startMs: 1000, endMs: 3000, text: 'Hello' },
        { startMs: 3000, endMs: 5000, text: 'World' },
      ];
      const result = finalizeSubtitleSegments(segments, 'Custom text', true, 6000);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Custom text');
      expect(result[0].startMs).toBe(1000);
      expect(result[0].endMs).toBe(5000);
    });

    test('ensures minimum duration of 500ms for edited segment', () => {
      const segments = [{ startMs: 1000, endMs: 1000, text: 'Quick' }];
      const result = finalizeSubtitleSegments(segments, 'Edited', true, 5000);
      expect(result[0].endMs).toBeGreaterThanOrEqual(result[0].startMs + 500);
    });

    test('handles missing endMs on last segment', () => {
      const segments = [{ startMs: 1000, text: 'No end' }];
      const result = finalizeSubtitleSegments(segments, 'Edited', true, 5000);
      expect(result[0].endMs).toBe(3000);
    });
  });
});
