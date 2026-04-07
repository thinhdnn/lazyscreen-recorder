function clampSubtitlePx(px) {
  return Math.min(48, Math.max(10, Math.round(Number(px) || 16)));
}

function buildCombinedSegmentText(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '';
  return segments.map((s) => s.text).join(' ').trim();
}

function finalizeSubtitleSegments(
  segments,
  userText,
  userEdited,
  recordingDurationMs
) {
  if (!segments || segments.length === 0) {
    const t = (userText || '').trim();
    if (!t) return [];
    const cap = 24 * 3600000;
    const endMs = Math.max(
      1000,
      Math.min(
        typeof recordingDurationMs === 'number' && recordingDurationMs > 0
          ? recordingDurationMs
          : 60000,
        cap
      )
    );
    return [{ startMs: 0, endMs, text: t }];
  }
  const auto = buildCombinedSegmentText(segments);
  const trimmed = (userText || '').trim();
  if (!userEdited || trimmed === auto) return segments;
  if (!trimmed) return [];
  const start = segments[0].startMs ?? 0;
  const last = segments[segments.length - 1];
  const end = last.endMs ?? last.startMs + 2000;
  return [{ startMs: start, endMs: Math.max(end, start + 500), text: trimmed }];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clampSubtitlePx,
    buildCombinedSegmentText,
    finalizeSubtitleSegments,
    clamp,
  };
}
