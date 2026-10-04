import { createClipWorkspace } from './app.js';
import { compareDurations } from './comparison.js';
import { elapsed } from './timing.js';

const titleBar = document.createElement('header');
titleBar.className = 'site-title';
titleBar.append(document.querySelector('.brand'));
const layout = document.createElement('div');
layout.className = 'clip-layout';
const first = document.createElement('section');
first.className = 'clip-workspace';
first.setAttribute('aria-label', 'Clip 1 workspace');
first.append(document.querySelector('.topbar'), document.querySelector('main'));
first.querySelectorAll('[id]').forEach(element => { element.dataset.control = element.id; });
const second = first.cloneNode(true);
second.setAttribute('aria-label', 'Clip 2 workspace');
second.hidden = true;
// Keep labels, IDs and controls unique while using one shared workspace template.
second.querySelectorAll('[id]').forEach(element => { element.id = 'clip2-' + element.id; });
second.querySelectorAll('[for]').forEach(element => {
  element.setAttribute('for', element.getAttribute('for').split(' ').map(id => 'clip2-' + id).join(' '));
});
layout.append(first, second);
const modeBar = document.createElement('nav');
modeBar.className = 'clip-mode';
modeBar.setAttribute('aria-label', 'Clip workspace layout');
const hint = document.createElement('p');
hint.textContent = 'Work on two clips side by side.';
const toggle = document.createElement('button');
toggle.className = 'button secondary';
toggle.textContent = 'Two Clip Mode';
toggle.setAttribute('aria-pressed', 'false');
modeBar.append(toggle);
titleBar.append(modeBar);
document.body.append(titleBar, layout);

let active = first;
const selectors = [first, second].map((root, index) => {
  const button = document.createElement('button');
  button.className = 'clip-select';
  button.type = 'button';
  button.append(document.createTextNode('Clip ' + (index + 1)), document.createElement('span'));
  root.prepend(button);
  const activate = () => { active = root; updateSelection(); };
  root.addEventListener('pointerdown', activate);
  root.addEventListener('focusin', activate);
  button.addEventListener('click', activate);
  return button;
});
function updateSelection() {
  selectors.forEach((button, index) => {
    const selected = active === [first, second][index];
    button.setAttribute('aria-pressed', String(selected));
    button.lastElementChild.textContent = selected ? 'Keyboard shortcuts active' : 'Select clip';
  });
}
const instances = [
  createClipWorkspace(first, () => active === first),
  createClipWorkspace(second, () => active === second)
];
const openButtons = [first, second].map((root, index) => {
  const button = root.querySelector('[data-control="openVideo"]');
  button.addEventListener('click', () => { active = root; updateSelection(); });
  modeBar.append(button);
  root.querySelector('.topbar').hidden = true;
  return button;
});
openButtons[1].hidden = true;

toggle.addEventListener('click', () => {
  const dual = second.hidden;
  second.hidden = !dual;
  layout.classList.toggle('dual', dual);
  comparison.hidden = !dual;
  openButtons[0].textContent = dual ? 'Open video · Clip 1' : 'Open video';
  openButtons[1].textContent = 'Open video · Clip 2';
  openButtons[1].hidden = !dual;
  toggle.textContent = dual ? 'Single Clip Mode' : 'Two Clip Mode';
  toggle.setAttribute('aria-pressed', String(dual));
  hint.textContent = dual ? 'Select a clip to use keyboard shortcuts. Each clip exports separately.' : 'Work on two clips side by side.';
  if (!dual) { instances[1].pause(); active = first; }
  updateSelection();
});
updateSelection();


const comparison = document.createElement('section');
comparison.className = 'comparison panel';
comparison.hidden = true;
comparison.setAttribute('aria-labelledby', 'comparisonTitle');
comparison.innerHTML = `
  <h2 id="comparisonTitle">Total time comparison</h2>
  <div class="comparison-totals">
    <div><span>Clip 1 total</span><strong id="compareTotal1"></strong></div>
    <div><span>Clip 2 total</span><strong id="compareTotal2"></strong></div>
  </div>
  <div id="comparisonResult" class="comparison-result" role="status" aria-live="polite"></div>
`;
layout.after(comparison);
const result = comparison.querySelector('#comparisonResult');
function updateComparison() {
  const clips = instances.map(instance => instance.snapshot());
  const totals = clips.map(clip => ({
    in: 0, out: clip.segments.reduce((sum, segment) => sum + segment.out - segment.in, 0)
  }));
  const difference = compareDurations(totals[0], clips[0].fps, totals[1], clips[1].fps, clips[0].fps);
  comparison.querySelector('#compareTotal1').textContent = elapsed(difference.firstSeconds);
  comparison.querySelector('#compareTotal2').textContent = elapsed(difference.secondSeconds);
  const heading = document.createElement('strong');
  heading.textContent = difference.direction === 0 ? 'Same total time' : 'Clip ' + (difference.direction > 0 ? '2' : '1') + ' is longer by';
  const amount = document.createElement('div');
  amount.className = 'comparison-amount';
  amount.textContent = difference.minutes + ' min ' + difference.seconds + ' sec ' + difference.frames + ' frames';
  const note = document.createElement('p');
  note.textContent = 'Frames shown at Clip 1’s ' + Number(clips[0].fps.toFixed(3)) + ' FPS.';
  result.replaceChildren(heading, amount, note);
}
[first, second].forEach(root => root.addEventListener('segmentschange', updateComparison));
updateComparison();
