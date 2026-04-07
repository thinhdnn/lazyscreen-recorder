function toSrtTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const hours = String(Math.floor(total / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
  const millis = String(total % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${millis}`;
}

function toVttTime(ms) {
  return toSrtTime(ms).replace(',', '.');
}

function buildSrt(segments) {
  return segments
    .map((seg, idx) => {
      const start = toSrtTime(seg.startMs ?? 0);
      const end = toSrtTime(seg.endMs ?? (seg.startMs ?? 0) + 2000);
      return `${idx + 1}\n${start} --> ${end}\n${seg.text || ''}\n`;
    })
    .join('\n');
}

function buildVtt(segments) {
  const body = segments
    .map((seg) => {
      const start = toVttTime(seg.startMs ?? 0);
      const end = toVttTime(seg.endMs ?? (seg.startMs ?? 0) + 2000);
      return `${start} --> ${end}\n${seg.text || ''}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

module.exports = {
  buildSrt,
  buildVtt,
};
