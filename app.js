import { parseRate, timecode, parseTimecode, elapsed, frameCount, validateSegment, summarize, makeCsv, formatDuration } from './timing.js';

export function createClipWorkspace(root, isActive) {
const $ = id => root.querySelector('[data-control="' + id + '"]');
const video = $('video');
function syncVolume() {
  const percent = video.muted ? 0 : Math.round(video.volume * 100);
  $('volumeSlider').value = percent;
  $('volumeSlider').setAttribute('aria-valuetext', `${percent}%`);
  $('volumeValue').textContent = `${percent}%`;
}
$('volumeSlider').addEventListener('input', event => {
  video.volume = Number(event.target.value) / 100;
  video.muted = video.volume === 0;
  syncVolume();
});
video.addEventListener('volumechange', syncVolume);
syncVolume();

const colors = ['#c6f36b', '#9cbbff', '#e8b287', '#b9a0ef', '#72d5c7', '#e8a7c5'];
let source = null, sourceUrl = null, ready = false, total = 0, current = 0;
let fps = 30, segments = [], draft = { in: null, out: null }, editing = null;
let serial = 1, drag = null, loadSerial = 0, thumbnailVideo = null, awaitingSource = false;
let playbackCallback = null;

function notice(text = '') { $('message').textContent = text; $('message').hidden = !text; }
function rateValue() { return $('fpsSelect').value; }
function durationMode() { return $('durationDisplay').value; }
function displayDuration(frames) { return formatDuration(frames, fps, durationMode()); }
function validDraft() { return ready && draft.in !== null && draft.out !== null && draft.in < draft.out; }
function defaultName() { return `Segment ${String(serial).padStart(2, '0')}`; }
function projectData() {
  return { app: 'Load Segment Timer', version: 1, durationDisplay: durationMode(), frameRate: rateValue(), timecodeFormat: 'non-drop-frame', outPoint: 'exclusive', source: { ...source }, segments: segments.map(({name, in: start, out}) => ({ name, in: start, out })), total: summarize(segments, fps) };
}
function renderPoints() {
  $('inTime').value = timecode(draft.in ?? 0, fps); $('outTime').value = timecode(draft.out ?? 0, fps);
  $('inFrame').value = draft.in ?? 0; $('outFrame').value = draft.out ?? 0;
  $('inFrame').max = Math.max(0, total - 1); $('outFrame').max = total;
  $('selectionDuration').textContent = validDraft() ? displayDuration(draft.out - draft.in) : '—';
  $('addSegment').disabled = !validDraft();
  $('addSegment').firstElementChild.textContent = editing === null ? '＋ Add segment' : 'Save changes';
  $('selectionHeading').textContent = editing === null ? 'NEW SEGMENT' : 'EDIT SEGMENT';
  $('cancelEdit').hidden = editing === null;
  $('selectionHint').textContent = editing !== null ? 'Adjust the boundaries, then save your changes.' : draft.in === null ? 'Mark an in point and an out point to create a segment.' : draft.out === null ? 'Move to the end of your segment and mark out.' : !validDraft() ? 'The out point must be after the in point.' : `${draft.out - draft.in} frames selected. Ready to add.`;
  renderRange();
}
function renderRange() {
  const show = ready && (draft.in !== null || draft.out !== null);
  $('draftRange').hidden = !show;
  if (show) {
    const start = draft.in ?? 0, end = draft.out ?? start;
    $('draftRange').style.left = `${Math.min(start, end) / total * 100}%`;
    $('draftRange').style.width = `${Math.abs(end - start) / total * 100}%`;
    $('inHandle').hidden = draft.in === null; $('outHandle').hidden = draft.out === null;
  }
}
function renderCurrent() {
  $('currentTime').textContent = timecode(current, fps);
  $('framePosition').textContent = `FRAME ${current.toLocaleString()}`;
  $('playhead').hidden = !ready;
  $('playhead').style.left = `${total ? Math.min(current / total * 100, 99.97) : 0}%`;
  $('timeline').setAttribute('aria-valuenow', current);
  $('timeline').setAttribute('aria-valuetext', `${timecode(current, fps)}, frame ${current}`);
}
function renderTotals() {
  const sum = summarize(segments, fps);
  $('totalTime').textContent = displayDuration(sum.frames);
  $('totalTime').title = durationMode() === 'frames' ? 'HH:MM:SS:FF · non-drop-frame timecode' : 'HH:MM:SS.mmm · elapsed time';
  $('totalFrames').textContent = `${sum.frames.toLocaleString()} frames`;
  $('totalCount').textContent = `${segments.length} segment${segments.length === 1 ? '' : 's'}`;
  $('segmentCount').textContent = segments.length;
  $('exportData').disabled = !source || !segments.length;
}
function renderRuler() {
  const ruler = $('ruler'); ruler.replaceChildren();
  const count = Math.max(4, Math.round($('timeline').clientWidth / 120));
  for (let i = 0; i <= count; i++) {
    const tick = document.createElement('span');
    tick.style.left = `${i / count * 100}%`;
    tick.textContent = timecode(Math.round(total * i / count), fps);
    if (i === count) tick.style.transform = 'translateX(-100%)';
    ruler.append(tick);
  }
}
function renderBars() {
  $('segmentTrack').querySelectorAll('.segment-bar').forEach(el => el.remove());
  $('emptyTrack').hidden = !!segments.length;
  const lanes = [];
  segments.forEach((s, index) => {
    let lane = lanes.findIndex(items => items.every(item => s.out <= item.in || s.in >= item.out));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push(s);
    const bar = document.createElement('button');
    bar.className = 'segment-bar' + (editing === index ? ' selected' : '');
    bar.style.top = `${5 + lane * 30}px`;
    bar.style.setProperty('--segment-color', colors[index % colors.length]);
    bar.style.left = `${s.in / total * 100}%`; bar.style.width = `${(s.out - s.in) / total * 100}%`;
    bar.textContent = `${String(index + 1).padStart(2, '0')} ${s.name}`;
    bar.title = `${s.name}: ${timecode(s.in, fps)} → ${timecode(s.out, fps)}`;
    bar.setAttribute('aria-label', `Edit ${s.name}`);
    bar.addEventListener('click', () => editSegment(index));
    $('segmentTrack').append(bar);
  });
  const height = Math.max(35, lanes.length * 30 + 5);
  $('segmentTrack').style.height = `${height}px`;
  $('timeline').style.height = `${height + 110}px`;
}
function renderRows() {
  $('segmentRows').replaceChildren();
  $('emptySegments').hidden = !!segments.length; $('tableWrap').hidden = !segments.length;
  segments.forEach((segment, index) => {
    const row = document.createElement('tr'); row.className = index === editing ? 'active' : '';
    row.style.setProperty('--segment-color', colors[index % colors.length]);
    const number = row.insertCell(); number.className = 'row-number'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('input'); name.value = segment.name; name.maxLength = 120; name.className = 'segment-label'; name.setAttribute('aria-label', `Segment ${index + 1} name`);
    name.addEventListener('change', () => { segment.name = name.value.trim() || `Segment ${index + 1}`; name.value = segment.name; if (editing === index) $('segmentName').value = segment.name; renderBars(); renderTimeList(); root.dispatchEvent(new Event('segmentschange')); });
    row.insertCell().append(name);
    for (const point of ['in', 'out']) {
      const input = document.createElement('input'); input.className = 'table-time'; input.value = timecode(segment[point], fps); input.spellcheck = false;
      input.setAttribute('aria-label', `Segment ${index + 1} ${point} timecode`);
      input.addEventListener('change', () => {
        try { const changed = { ...segment, [point]: parseTimecode(input.value, fps) }; validateSegment(changed, total); Object.assign(segment, changed); if (editing === index) { draft = { in: segment.in, out: segment.out }; renderPoints(); } notice(); renderSegments(); }
        catch (err) { notice(err.message); input.value = timecode(segment[point], fps); }
      });
      row.insertCell().append(input);
    }
    const duration = row.insertCell(); duration.className = 'duration-cell'; duration.textContent = displayDuration(segment.out - segment.in);
    const frames = row.insertCell(); frames.className = 'frames-cell'; frames.textContent = (segment.out - segment.in).toLocaleString();
    const actions = row.insertCell();
    const edit = document.createElement('button'); edit.className = 'row-action'; edit.textContent = 'Edit'; edit.disabled = !ready; edit.setAttribute('aria-label', `Edit segment ${index + 1}`); edit.addEventListener('click', () => editSegment(index));
    const remove = document.createElement('button'); remove.className = 'row-action remove-row'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete segment ${index + 1}`); remove.addEventListener('click', () => { segments.splice(index, 1); if (editing === index) resetDraft(); else if (editing !== null && editing > index) editing--; renderSegments(); });
    actions.append(edit, remove); $('segmentRows').append(row);
  });
}
function renderTimeList() {
  const list = $('segmentTimes'), scrollTop = list.scrollTop;
  list.replaceChildren(); list.hidden = !segments.length;
  $('summaryEmpty').hidden = !!segments.length;
  $('summaryCount').textContent = segments.length;
  $('summaryFormat').textContent = durationMode() === 'frames' ? 'HH:MM:SS:FF' : 'HH:MM:SS.mmm';
  segments.forEach((segment, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'summary-segment' + (editing === index ? ' active' : '');
    button.disabled = !ready;
    button.setAttribute('aria-label', `${segment.name}, ${displayDuration(segment.out - segment.in)}; edit segment ${index + 1}`);
    const number = Object.assign(document.createElement('span'), { className: 'summary-number', textContent: String(index + 1).padStart(2, '0') });
    const name = Object.assign(document.createElement('span'), { className: 'summary-name', textContent: segment.name });
    const duration = Object.assign(document.createElement('strong'), { textContent: displayDuration(segment.out - segment.in) });
    button.append(number, name, duration); button.addEventListener('click', () => editSegment(index));
    item.append(button); list.append(item);
  });
  list.scrollTop = scrollTop;
}
function renderSegments() { renderRows(); renderBars(); renderTotals(); renderTimeList(); root.dispatchEvent(new Event('segmentschange')); }
function resetDraft() { draft = { in: null, out: null }; editing = null; $('segmentName').value = ''; $('segmentName').placeholder = defaultName(); renderPoints(); }
function editSegment(index) {
  if (!ready) { notice('Open the source video to edit this segment on the timeline.'); return; }
  editing = index; const s = segments[index]; draft = { in: s.in, out: s.out }; $('segmentName').value = s.name;
  seekFrame(s.in); renderPoints(); renderSegments();
}
function setPoint(point, frame) {
  if (!ready) return;
  const limit = point === 'in' ? total - 1 : total;
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > limit) { notice(`The ${point} frame must be a whole number from 0 to ${limit}.`); renderPoints(); return; }
  draft[point] = frame; notice(); renderPoints();
}
function pause() { video.pause(); updatePlayback(); }
function seekFrame(frame) {
  if (!ready) return;
  pause(); current = Math.min(total, Math.max(0, Math.round(frame)));
  // Seek just inside the selected frame, avoiding floating-point boundary ambiguity.
  video.currentTime = Math.max(0, Math.min(video.duration - 0.00001, (current + 0.01) / fps));
  renderCurrent();
}
async function togglePlay() {
  if (!ready) return;
  if (!video.paused) { pause(); return; }
  if (current >= total) { current = 0; video.currentTime = 0; }
  try { await video.play(); } catch { notice('The browser could not play this video. Try another browser-supported MP4 or WebM file.'); }
  updatePlayback();
}
function updatePlayback() { $('playPause').textContent = video.paused ? '▶' : 'Ⅱ'; $('playPause').setAttribute('aria-label', video.paused ? 'Play' : 'Pause'); }
function trackPlayback() {
  if (!video.requestVideoFrameCallback) return;
  playbackCallback = video.requestVideoFrameCallback((_, metadata) => {
    if (!video.paused && ready) { current = Math.min(total - 1, Math.max(0, Math.round(metadata.mediaTime * fps))); renderCurrent(); }
    trackPlayback();
  });
}
video.addEventListener('timeupdate', () => { if (!video.paused && !video.requestVideoFrameCallback) { current = Math.min(total - 1, Math.floor(video.currentTime * fps)); renderCurrent(); } });
video.addEventListener('play', updatePlayback); video.addEventListener('pause', updatePlayback);
video.addEventListener('ended', () => { current = total; renderCurrent(); updatePlayback(); });
function enableControls() {
  for (const id of ['prevFrame', 'playPause', 'nextFrame', 'segmentName', 'inTime', 'outTime', 'inFrame', 'outFrame', 'markIn', 'markOut']) $(id).disabled = !ready;
  $('timeline').setAttribute('aria-disabled', !ready); $('timeline').setAttribute('aria-valuemax', total);
}
async function loadVideo(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v|avi|ogg|ogv)$/i.test(file.name)) { notice('Choose a video file, such as MP4, WebM, or MOV.'); return; }
  if (awaitingSource && file.name !== source.name) { notice(`This project uses “${source.name}”. Open that video to reconnect the saved marks.`); return; }
  if (!awaitingSource && segments.length && !confirm('Open a different video and clear this session? Export JSON first if you want to keep these marks.')) return;
  const generation = ++loadSerial; ready = false; pause(); enableControls();
  if (thumbnailVideo) { thumbnailVideo.pause(); thumbnailVideo.removeAttribute('src'); thumbnailVideo.load(); thumbnailVideo = null; }
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file); video.src = sourceUrl; video.hidden = false; $('emptyVideo').hidden = true;
  $('thumbnails').replaceChildren(); notice('Opening video…');
  video.onloadedmetadata = () => {
    if (generation !== loadSerial) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) { failVideo('This video has no usable duration. Try a seekable MP4 or WebM file.'); return; }
    if (awaitingSource && Math.abs(source.duration - video.duration) > 1 / fps) { failVideo('The video duration does not match the saved project. Open the original video.'); return; }
    if (!awaitingSource) { segments = []; serial = 1; }
    source = { name: file.name, size: file.size, duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    total = frameCount(source.duration, fps); current = 0; ready = true; awaitingSource = false;
    $('projectTitle').textContent = file.name.replace(/\.[^.]+$/, '');
    $('fileMeta').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    $('resolution').textContent = `${video.videoWidth} × ${video.videoHeight}`;
    $('durationTime').textContent = timecode(total, fps); $('timelineBadge').textContent = `${fps.toFixed(fps % 1 ? 3 : 0)} FPS`;
    $('trackLabel').replaceChildren(document.createTextNode('V1 '), Object.assign(document.createElement('span'), { textContent: file.name }));
    $('sourceTrack').classList.add('loaded');
    enableControls(); resetDraft(); renderCurrent(); renderSegments(); renderRuler();
    notice('Video ready. Confirm Source FPS matches your file. Frame stepping uses that rate; variable-frame-rate footage should be converted to constant frame rate for exact source-frame alignment.');
    generateThumbnails(sourceUrl, generation);
  };
  video.onerror = () => { if (generation === loadSerial) failVideo('This video’s format or codec is not supported by this browser. Try H.264 MP4 or WebM.'); };
  video.load();
}
function failVideo(message) {
  ready = false; video.hidden = true; $('emptyVideo').hidden = false; enableControls(); notice(message); renderPoints();
}
async function generateThumbnails(url, generation) {
  const helper = document.createElement('video'); thumbnailVideo = helper; helper.muted = true; helper.preload = 'auto'; helper.src = url;
  const waitEvent = (event, action) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Thumbnail timeout')); }, 5000);
    const done = () => { cleanup(); resolve(); }; const error = () => { cleanup(); reject(new Error('Thumbnail unavailable')); };
    const cleanup = () => { clearTimeout(timer); helper.removeEventListener(event, done); helper.removeEventListener('error', error); };
    helper.addEventListener(event, done, { once: true }); helper.addEventListener('error', error, { once: true }); action();
  });
  try {
    await waitEvent('loadeddata', () => helper.load());
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = Math.max(1, Math.round(180 * helper.videoHeight / helper.videoWidth));
    const ctx = canvas.getContext('2d');
    for (let index = 0; index < 12; index++) {
      if (generation !== loadSerial) break;
      await waitEvent('seeked', () => { helper.currentTime = Math.min(helper.duration - .001, helper.duration * (index + .25) / 12); });
      if (generation !== loadSerial) break;
      ctx.drawImage(helper, 0, 0, canvas.width, canvas.height);
      const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = canvas.toDataURL('image/jpeg', .6); $('thumbnails').append(img);
    }
  } catch { /* A preview strip is optional; playback and marks remain available. */ }
  finally { helper.removeAttribute('src'); helper.load(); if (thumbnailVideo === helper) thumbnailVideo = null; }
}
function addSegment() {
  if (!validDraft()) return;
  const segment = { name: $('segmentName').value.trim() || defaultName(), in: draft.in, out: draft.out };
  if (editing === null) { segments.push(segment); serial++; } else segments[editing] = segment;
  const appended = editing === null;
  resetDraft(); renderSegments(); notice();
  if (appended) $('segmentTimes').scrollTop = $('segmentTimes').scrollHeight;
}
function changeRate() {
  const next = parseRate(rateValue()), previous = fps;
  if (segments.length || draft.in !== null || draft.out !== null) {
    const nextTotal = source ? frameCount(source.duration, next) : 0;
    const convert = frame => Math.min(nextTotal, Math.round(frame / previous * next));
    const changed = segments.map(s => ({ ...s, in: convert(s.in), out: convert(s.out) }));
    if (changed.some(s => s.out <= s.in)) { $('fpsSelect').value = [...$('fpsSelect').options].find(o => parseRate(o.value) === previous).value; notice('This rate would collapse a short segment to zero frames. Remove or extend that segment before changing FPS.'); return; }
    segments = changed;
    for (const key of ['in', 'out']) if (draft[key] !== null) draft[key] = convert(draft[key]);
  }
  fps = next; total = source ? frameCount(source.duration, fps) : 0;
  if (ready) seekFrame(Math.round(current / previous * fps));
  $('durationTime').textContent = timecode(total, fps); $('timelineBadge').textContent = source ? `${fps.toFixed(fps % 1 ? 3 : 0)} FPS` : 'NO SOURCE';
  $('fpsHelp').textContent = fps % 1 ? 'Fractional FPS uses non-drop-frame timecode; milliseconds show elapsed time.' : 'Set source FPS to match your video for accurate frame marks.';
  renderPoints(); renderCurrent(); renderSegments(); renderRuler(); enableControls();
  notice(source ? 'Frame rate updated. Existing marks keep their time positions, rounded to the new frame grid.' : '');
}
function timelineFrame(event) { const rect = $('timeline').getBoundingClientRect(); return Math.min(total, Math.max(0, Math.round((event.clientX - rect.left) / rect.width * total))); }
$('timeline').addEventListener('pointerdown', event => {
  if (!ready || event.button !== 0 || event.target.closest('.segment-bar')) return;
  const handle = event.target.closest('.range-handle'); drag = handle ? (handle.dataset.control === 'inHandle' ? 'in' : 'out') : 'scrub';
  $('timeline').setPointerCapture(event.pointerId); pause();
  if (drag === 'scrub') seekFrame(timelineFrame(event));
});
$('timeline').addEventListener('pointermove', event => {
  if (!drag) return;
  const frame = timelineFrame(event);
  if (drag === 'scrub') seekFrame(frame);
  else {
    const limit = drag === 'in' ? Math.min(total - 1, (draft.out ?? total) - 1) : total;
    const lower = drag === 'out' ? (draft.in ?? 0) + 1 : 0;
    const target = Math.max(lower, Math.min(limit, frame)); setPoint(drag, target); seekFrame(target);
  }
});
$('timelineScroll').addEventListener('wheel', event => {
  // Leave pinch zoom and horizontal/Shift-wheel panning to the browser.
  if (!ready || drag || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  seekFrame(current + Math.sign(event.deltaY));
  const viewport = $('timelineScroll');
  const x = current / total * $('timeline').clientWidth;
  if (x < viewport.scrollLeft || x > viewport.scrollLeft + viewport.clientWidth - 12) viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 2);
}, { passive: false });
function endDrag() { drag = null; }
$('timeline').addEventListener('pointerup', endDrag); $('timeline').addEventListener('pointercancel', endDrag); $('timeline').addEventListener('lostpointercapture', endDrag);
for (const point of ['in', 'out']) {
  $(`${point}Handle`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1);
    setPoint(point, (draft[point] ?? 0) + delta);
  });
  $(`${point}Time`).addEventListener('change', event => { try { setPoint(point, parseTimecode(event.target.value, fps)); } catch (err) { notice(err.message); renderPoints(); } });
  $(`${point}Frame`).addEventListener('change', event => { if (!event.target.value.trim()) { notice('Enter a whole frame number.'); renderPoints(); } else setPoint(point, Number(event.target.value)); });
}
$('markIn').addEventListener('click', () => { pause(); setPoint('in', current); });
$('markOut').addEventListener('click', () => { pause(); setPoint('out', current); });
$('addSegment').addEventListener('click', addSegment);
$('cancelEdit').addEventListener('click', () => { resetDraft(); renderSegments(); });
$('prevFrame').addEventListener('click', () => seekFrame(current - 1)); $('nextFrame').addEventListener('click', () => seekFrame(current + 1));
$('playPause').addEventListener('click', togglePlay); video.addEventListener('click', togglePlay);
$('openVideo').addEventListener('click', () => $('fileInput').click()); $('chooseVideo').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', event => { loadVideo(event.target.files[0]); event.target.value = ''; });
$('dropZone').addEventListener('dragover', event => { event.preventDefault(); $('dropZone').classList.add('dragging'); });
$('dropZone').addEventListener('dragleave', event => { if (!$('dropZone').contains(event.relatedTarget)) $('dropZone').classList.remove('dragging'); });
$('dropZone').addEventListener('drop', event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); loadVideo(event.dataTransfer.files[0]); });
window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
$('fpsSelect').addEventListener('change', changeRate);
$('durationDisplay').addEventListener('change', () => {
  renderPoints(); renderSegments();
  try { localStorage.setItem('load-segment-timer-duration-display', durationMode()); } catch { /* Preferences are optional. */ }
});
function zoomTimeline() { $('timeline').style.width = `${Number($('zoom').value) * 100}%`; renderRuler(); if (ready) $('timelineScroll').scrollLeft = Math.max(0, current / total * $('timeline').clientWidth - $('timelineScroll').clientWidth / 2); }
$('zoom').addEventListener('input', zoomTimeline); $('fitTimeline').addEventListener('click', () => { $('zoom').value = 1; zoomTimeline(); });
new ResizeObserver(renderRuler).observe($('timelineScroll'));
document.addEventListener('keydown', event => {
  if (!isActive() || !ready || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,select,textarea,[contenteditable=true]')) return;
  if (event.target.closest('button') && [' ', 'Enter'].includes(event.key)) return;
  const key = event.key.toLowerCase();
  if ([' ', 'i', 'o', 'enter', 'arrowleft', 'arrowright', 'home', 'end', 'escape'].includes(key)) event.preventDefault();
  if (key === ' ') togglePlay();
  if (key === 'i') { pause(); setPoint('in', current); }
  if (key === 'o') { pause(); setPoint('out', current); }
  if (key === 'enter') addSegment();
  if (key === 'arrowleft' || key === 'arrowright') seekFrame(current + (key === 'arrowleft' ? -1 : 1) * (event.shiftKey ? 10 : 1));
  if (key === 'home') seekFrame(0); if (key === 'end') seekFrame(total);
  if (key === 'escape') { resetDraft(); renderSegments(); }
});
$('exportData').addEventListener('click', () => {
  if (!source || !segments.length) return;
  const format = $('exportFormat').value, project = projectData();
  const content = format === 'csv' ? makeCsv(project) : JSON.stringify(project, null, 2);
  const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
  a.download = `${source.name.replace(/\.[^.]+$/, '')}-segments.${format}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
});
$('importProject').addEventListener('click', () => $('projectInput').click());
$('projectInput').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a Load Segment Timer JSON project smaller than 5 MB.');
    const project = JSON.parse(await file.text());
    if (!['Load Segment Timer', 'Frameledger'].includes(project.app) || project.version !== 1 || project.outPoint !== 'exclusive' || project.timecodeFormat !== 'non-drop-frame' || !Array.isArray(project.segments) || project.segments.length > 10000) throw new Error('This is not a supported Load Segment Timer JSON project.');
    if (![...$('fpsSelect').options].some(o => o.value === project.frameRate)) throw new Error('This project has an unsupported frame rate.');
    const importedFps = parseRate(project.frameRate), importedSource = project.source;
    if (!importedSource || typeof importedSource.name !== 'string' || importedSource.name.length > 1024 || !Number.isFinite(importedSource.duration) || importedSource.duration <= 0 || importedSource.duration > 7 * 86400) throw new Error('The project source information is invalid.');
    const importedTotal = frameCount(importedSource.duration, importedFps);
    const importedSegments = project.segments.map(s => validateSegment(s, importedTotal));
    if (segments.length && !confirm('Replace the current marks with this JSON project? Export your current session first if you want to keep it.')) return;
    const matches = ready && source?.name === importedSource.name && Math.abs(source.duration - importedSource.duration) < 1 / importedFps;
    pause(); fps = importedFps; $('fpsSelect').value = project.frameRate;
    if (['frames', 'milliseconds'].includes(project.durationDisplay)) $('durationDisplay').value = project.durationDisplay;
    source = { name: importedSource.name, duration: importedSource.duration, size: importedSource.size || 0, width: importedSource.width || 0, height: importedSource.height || 0 };
    total = importedTotal; segments = importedSegments; serial = segments.length + 1; current = 0;
    if (!matches) {
      ++loadSerial; ready = false; awaitingSource = true; video.removeAttribute('src'); video.load(); video.hidden = true; $('emptyVideo').hidden = false;
      $('thumbnails').replaceChildren(); $('sourceTrack').classList.remove('loaded'); $('resolution').textContent = 'SOURCE NOT CONNECTED';
      $('trackLabel').textContent = 'V1 · Reconnect source video';
    } else { awaitingSource = false; seekFrame(0); }
    $('projectTitle').textContent = source.name.replace(/\.[^.]+$/, ''); $('fileMeta').textContent = matches ? source.name : `Reconnect: ${source.name}`;
    $('durationTime').textContent = timecode(total, fps); $('timelineBadge').textContent = `${fps.toFixed(fps % 1 ? 3 : 0)} FPS`;
    enableControls(); resetDraft(); renderCurrent(); renderSegments(); renderRuler();
    $('fpsHelp').textContent = fps % 1 ? 'Fractional FPS uses non-drop-frame timecode; milliseconds show elapsed time.' : 'Set source FPS to match your video for accurate frame marks.';
    notice(matches ? 'Project imported. Your saved segments are ready.' : `Project imported. Open “${source.name}” to reconnect the video. Your marks are loaded; video files are not stored in JSON.`);
  } catch (err) { notice(`Could not import: ${err.message}`); }
});
window.addEventListener('beforeunload', event => { if (segments.length) { event.preventDefault(); event.returnValue = ''; } });
try { const savedDisplay = localStorage.getItem('load-segment-timer-duration-display'); if (['frames', 'milliseconds'].includes(savedDisplay)) $('durationDisplay').value = savedDisplay; } catch { /* Preferences are optional. */ }
trackPlayback(); renderPoints(); renderCurrent(); renderTotals(); renderTimeList(); renderRuler();

return { pause, snapshot: () => ({ fps, segments: segments.map(s => ({ ...s })) }) };
}
