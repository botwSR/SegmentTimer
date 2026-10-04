export function parseRate(value) {
  const [n, d = 1] = String(value).split('/').map(Number);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0 || n / d > 240) throw new Error('Invalid frame rate.');
  return n / d;
}
export function timecode(frame, fps) {
  const nominal = Math.round(fps);
  let remaining = Math.max(0, Math.round(frame));
  const ff = remaining % nominal; remaining = Math.floor(remaining / nominal);
  const ss = remaining % 60; remaining = Math.floor(remaining / 60);
  const mm = remaining % 60; const hh = Math.floor(remaining / 60);
  return [hh, mm, ss, ff].map(v => String(v).padStart(2, '0')).join(':');
}
export function parseTimecode(value, fps) {
  const match = String(value).trim().match(/^(\d+):([0-5]\d):([0-5]\d):(\d{2,3})$/);
  if (!match || Number(match[4]) >= Math.round(fps)) throw new Error('Use HH:MM:SS:FF, with a frame field below the source FPS.');
  const [, h, m, s, f] = match.map(Number);
  const result = ((h * 60 + m) * 60 + s) * Math.round(fps) + f;
  if (!Number.isSafeInteger(result)) throw new Error('Timecode is too large.');
  return result;
}
export function elapsed(seconds) {
  let ms = Math.max(0, Math.round(seconds * 1000));
  const fraction = ms % 1000; ms = Math.floor(ms / 1000);
  const ss = ms % 60; ms = Math.floor(ms / 60);
  const mm = ms % 60; const hh = Math.floor(ms / 60);
  return [hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':') + '.' + String(fraction).padStart(3, '0');
}
export function formatDuration(frames, fps, mode = 'milliseconds') {
  return mode === 'frames' ? timecode(frames, fps) : elapsed(frames / fps);
}
export function frameCount(duration, fps) { return Math.max(1, Math.ceil(duration * fps - 0.001)); }
export function validateSegment(segment, maxFrame) {
  if (!segment || typeof segment.name !== 'string' || segment.name.length > 120 || !Number.isSafeInteger(segment.in) || !Number.isSafeInteger(segment.out) || segment.in < 0 || segment.out <= segment.in || segment.out > maxFrame) throw new Error('Each segment must have valid frame boundaries, with out after in and within the video.');
  return { name: segment.name, in: segment.in, out: segment.out };
}
export function summarize(segments, fps) {
  const frames = segments.reduce((sum, segment) => sum + segment.out - segment.in, 0);
  return { frames, seconds: frames / fps, duration: elapsed(frames / fps) };
}
function csvCell(value) {
  let text = String(value);
  // Neutralize formulas when user-provided names are opened in a spreadsheet.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function makeCsv(project) {
  const fps = parseRate(project.frameRate);
  const rows = [['segment', 'name', 'in_timecode', 'out_timecode_exclusive', 'in_frame', 'out_frame_exclusive', 'duration_frames', 'duration_seconds', 'duration', 'source_file', 'source_fps', 'duration_format']];
  project.segments.forEach((s, i) => rows.push([i + 1, s.name, timecode(s.in, fps), timecode(s.out, fps), s.in, s.out, s.out - s.in, ((s.out - s.in) / fps).toFixed(6), formatDuration(s.out - s.in, fps, project.durationDisplay), project.source.name, fps, project.durationDisplay === 'frames' ? 'HH:MM:SS:FF (non-drop-frame)' : 'HH:MM:SS.mmm']));
  const total = summarize(project.segments, fps);
  rows.push(['TOTAL', '', '', '', '', '', total.frames, total.seconds.toFixed(6), formatDuration(total.frames, fps, project.durationDisplay), project.source.name, fps, project.durationDisplay === 'frames' ? 'HH:MM:SS:FF (non-drop-frame)' : 'HH:MM:SS.mmm']);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
