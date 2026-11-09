/**
 * app.js —— 全站仪作业引导（测回法）
 * 设站 → 每测回盘左 → 同测回盘右 → 置盘 → 下一测回 → 成果。
 */
import {
  dmsPartsToSeconds,
  angleFromReadings,
  twoCSeconds,
  meanAngles,
  formatAngle,
  formatDelta,
  formatSignedDelta,
  angleSeparationSec,
  spreadAngles,
  formatMeters,
  parseDistance,
  distanceStats,
} from './calc.js';

const STORE_KEY = 'tsguide.v2';
const VERSION = 2;
const LIMITS = {
  DJ6: { half: 40, sets: 24, twoC: null },
  DJ2: { half: 20, sets: 12, twoC: 13 },
};
const PHASES = ['setup', 'left', 'right', 'circle', 'result'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- 状态 ---------------- */

function emptyReading() {
  return { d: '', m: '', s: '', dist: '' };
}

function createRound() {
  return {
    left: { a: emptyReading(), b: emptyReading() },
    right: { a: emptyReading(), b: emptyReading() },
  };
}

function defaultStation() {
  return { name: '测站 1', ih: '1.500', instrument: 'DJ6', bs: '后视点' };
}

function defaultState() {
  return {
    version: VERSION,
    phase: 'setup',
    roundIndex: 0,
    roundCount: 2,
    station: defaultStation(),
    rounds: [createRound(), createRound()],
  };
}

function normalizeReading(raw) {
  return {
    d: String(raw?.d ?? ''),
    m: String(raw?.m ?? ''),
    s: String(raw?.s ?? ''),
    dist: String(raw?.dist ?? ''),
  };
}

function normalizeState(raw) {
  if (!raw || raw.version !== VERSION || !Array.isArray(raw.rounds)) return defaultState();
  const count = Math.min(4, Math.max(1, Number(raw.roundCount) || raw.rounds.length || 2));
  const rounds = [];
  for (let i = 0; i < count; i += 1) {
    const round = raw.rounds[i];
    rounds.push({
      left: {
        a: normalizeReading(round?.left?.a),
        b: normalizeReading(round?.left?.b),
      },
      right: {
        a: normalizeReading(round?.right?.a),
        b: normalizeReading(round?.right?.b),
      },
    });
  }
  const phase = PHASES.includes(raw.phase) ? raw.phase : 'setup';
  const roundIndex = Math.min(count - 1, Math.max(0, Number(raw.roundIndex) || 0));
  return {
    version: VERSION,
    phase,
    roundIndex,
    roundCount: count,
    station: {
      name: String(raw?.station?.name ?? defaultStation().name),
      ih: String(raw?.station?.ih ?? defaultStation().ih),
      instrument: raw?.station?.instrument === 'DJ2' ? 'DJ2' : 'DJ6',
      bs: String(raw?.station?.bs ?? defaultStation().bs),
    },
    rounds,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state = loadState();
let active = null;
let keypadVisible = false;
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, 120);
}

/* ---------------- 小工具 ---------------- */

let toastTimer = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function reading(d, m, s, dist) {
  return { d: String(d), m: String(m), s: String(s), dist: String(dist) };
}

function currentFace() {
  if (state.phase === 'left') return 'left';
  if (state.phase === 'right') return 'right';
  return null;
}

function currentRound() {
  return state.rounds[state.roundIndex];
}

function readingValid(item) {
  return dmsPartsToSeconds(item) !== null;
}

function faceComplete(face, roundIndex = state.roundIndex) {
  const round = state.rounds[roundIndex];
  return Boolean(round) && readingValid(round[face].a) && readingValid(round[face].b);
}

function allComplete() {
  return state.rounds.every((_, index) => faceComplete('left', index) && faceComplete('right', index));
}

function setupValid() {
  const ih = Number(state.station.ih);
  return Boolean(state.station.name.trim()) && Number.isFinite(ih) && ih > 0;
}

function startReading(roundIndex, count = state.roundCount) {
  return (roundIndex * 180) / count;
}

function formatStartReading(roundIndex, count = state.roundCount) {
  const deg = startReading(roundIndex, count);
  return `${Number.isInteger(deg) ? deg : deg.toFixed(1)}°00′00″`;
}

/* ---------------- 计算 ---------------- */

function roundCalc(round) {
  const l = angleFromReadings(round.left.a, round.left.b);
  const r = angleFromReadings(round.right.a, round.right.b);
  return {
    l,
    r,
    one: l != null && r != null ? meanAngles([l, r]) : null,
    cA: twoCSeconds(round.left.a, round.right.a),
    cB: twoCSeconds(round.left.b, round.right.b),
  };
}

function targetDistance(target) {
  const values = [];
  state.rounds.forEach((round) => {
    ['left', 'right'].forEach((side) => {
      const value = parseDistance(round[side][target].dist);
      if (value != null) values.push(value);
    });
  });
  return distanceStats(values);
}

function computeSummary() {
  const calcs = state.rounds.map(roundCalc);
  const ones = calcs.map((item) => item.one).filter((v) => v != null);
  const halfDiffs = calcs
    .map((item) => (item.l != null && item.r != null ? angleSeparationSec(item.l, item.r) : null))
    .filter((v) => v != null);
  const twoSpreads = calcs
    .map((item) => (item.cA != null && item.cB != null ? Math.abs(item.cA - item.cB) : null))
    .filter((v) => v != null);
  const limits = LIMITS[state.station.instrument];

  return {
    calcs,
    angle: meanAngles(ones),
    halfDiff: halfDiffs.length ? Math.max(...halfDiffs) : null,
    setsDiff: spreadAngles(ones),
    twoCSpread: twoSpreads.length ? Math.max(...twoSpreads) : null,
    limits,
    distA: targetDistance('a'),
    distB: targetDistance('b'),
  };
}

/* ---------------- 键盘槽位 ---------------- */

function getSlots() {
  const face = currentFace();
  if (!face) return [];
  const roundIndex = state.roundIndex;
  const slots = [];
  ['a', 'b'].forEach((target) => {
    ['d', 'm', 's'].forEach((part) => {
      slots.push({ kind: 'angle', roundIndex, face, target, part });
    });
    slots.push({ kind: 'dist', roundIndex, face, target });
  });
  return slots;
}

function sameSlot(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'angle') {
    return a.roundIndex === b.roundIndex && a.face === b.face && a.target === b.target && a.part === b.part;
  }
  return a.roundIndex === b.roundIndex && a.face === b.face && a.target === b.target;
}

function firstIncompleteSlot() {
  for (const slot of getSlots()) {
    const item = state.rounds[slot.roundIndex][slot.face][slot.target];
    if (slot.kind === 'angle') {
      if (!item[slot.part]) return slot;
    } else if (!String(item.dist ?? '').trim()) {
      return slot;
    }
  }
  return null;
}

function prevSlot(slot) {
  const slots = getSlots();
  const index = slots.findIndex((item) => sameSlot(item, slot));
  return index > 0 ? slots[index - 1] : null;
}

function nextSlot(slot) {
  const slots = getSlots();
  const index = slots.findIndex((item) => sameSlot(item, slot));
  return index >= 0 ? slots[index + 1] || null : null;
}

function activeElement() {
  if (!active) return null;
  const row = `#face-round .read-row[data-target="${active.target}"]`;
  if (active.kind === 'angle') return $(`${row} .cell[data-part="${active.part}"]`);
  return $(`${row} .dist-cell`);
}

function syncActive() {
  $$('.cell.active, .dist-cell.active').forEach((el) => el.classList.remove('active'));
  const el = activeElement();
  if (el) el.classList.add('active');
}

function scrollActive() {
  requestAnimationFrame(() => {
    const el = activeElement();
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function selectSlot(slot) {
  active = { ...slot };
  syncActive();
  updateCaption();
  scrollActive();
}

function activateSlot(slot) {
  openKeypad();
  selectSlot(slot);
}

function openKeypad() {
  if (keypadVisible) return;
  keypadVisible = true;
  $('#keypad').hidden = false;
  $('#app').classList.add('keypad-open');
  document.body.classList.add('keypad-open');
}

function closeKeypad() {
  if (!keypadVisible) return;
  keypadVisible = false;
  $('#keypad').hidden = true;
  $('#app').classList.remove('keypad-open');
  document.body.classList.remove('keypad-open');
  active = null;
  syncActive();
}

function updateCaption() {
  const caption = $('#keypad-caption');
  if (!active) {
    caption.textContent = '';
    return;
  }
  const face = active.face === 'left' ? '盘左' : '盘右';
  const tail = active.kind === 'angle' ? '读数' : '距离';
  caption.textContent = `${face} · 测回 ${active.roundIndex + 1} · ${active.target.toUpperCase()} ${tail}`;
}

function advance() {
  const next = nextSlot(active);
  if (next) {
    selectSlot(next);
    return;
  }
  const first = firstIncompleteSlot();
  if (first && !sameSlot(first, active)) selectSlot(first);
}

/* ---------------- 角度输入 ---------------- */

function partValid(part, value) {
  if (value === '' || value == null) return true;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return part === 'd' ? number <= 359 : number <= 59;
}

function cellText(part, value) {
  if (value == null || value === '') return '';
  if (part === 'm' || part === 's') return value.padStart(2, '0');
  return value;
}

function updateFaceExtras() {
  const roundEl = $('#face-round .round');
  if (!roundEl) return;
  const round = currentRound();
  const face = currentFace();
  if (!face) return;
  const half = angleFromReadings(round[face].a, round[face].b);
  const angleEl = roundEl.querySelector('.round-angle');
  if (angleEl) angleEl.textContent = half != null ? formatAngle(half) : '';

  const twoEl = roundEl.querySelector('.round-2c');
  if (!twoEl) return;
  if (face === 'right') {
    const cA = twoCSeconds(round.left.a, round.right.a);
    const cB = twoCSeconds(round.left.b, round.right.b);
    const parts = [];
    if (cA != null) parts.push(`A ${formatSignedDelta(cA)}`);
    if (cB != null) parts.push(`B ${formatSignedDelta(cB)}`);
    if (parts.length) {
      twoEl.hidden = false;
      twoEl.textContent = `2C  ${parts.join('   ')}`;
    } else {
      twoEl.hidden = true;
    }
  } else {
    twoEl.hidden = true;
  }
}

function refreshReading(roundIndex, face, target) {
  const roundEl = $('#face-round .round');
  if (!roundEl || roundIndex !== state.roundIndex || face !== currentFace()) return;
  const item = state.rounds[roundIndex][face][target];
  const row = roundEl.querySelector(`.read-row[data-target="${target}"]`);
  if (!row) return;

  ['d', 'm', 's'].forEach((part) => {
    const cell = row.querySelector(`.cell[data-part="${part}"]`);
    if (!cell) return;
    const valueEl = cell.querySelector('.cell-val');
    if (valueEl) valueEl.textContent = cellText(part, item[part]);
    cell.classList.toggle('invalid', item[part] !== '' && !partValid(part, item[part]));
  });
  const distEl = row.querySelector('.dist-val');
  if (distEl) distEl.textContent = item.dist;
  row.querySelector('.dist-cell')?.classList.toggle('invalid', Boolean(item.dist) && parseDistance(item.dist) == null);

  updateFaceExtras();
  updateFaceProgress();
  updateFlow();
  renderSummary();
  save();
}

function handleAngleKey(key) {
  if (!active || active.kind !== 'angle') return;
  const item = state.rounds[active.roundIndex][active.face][active.target];

  if (key === 'clear') {
    item.d = '';
    item.m = '';
    item.s = '';
    active.part = 'd';
    refreshReading(active.roundIndex, active.face, active.target);
    selectSlot(active);
    return;
  }
  if (key === 'next') {
    advance();
    return;
  }
  if (key === 'back') {
    if (item[active.part]) {
      item[active.part] = item[active.part].slice(0, -1);
      refreshReading(active.roundIndex, active.face, active.target);
    } else {
      const prev = prevSlot(active);
      if (prev) selectSlot(prev);
    }
    return;
  }
  if (key === 'dot') return;
  if (!/^\d$/.test(key) && key !== '00') return;

  const max = active.part === 'd' ? 3 : 2;
  const current = item[active.part] || '';
  const addition = key === '00' ? '00' : key;
  const nextValue = (current + addition).slice(0, max);
  if (nextValue === current) return;

  item[active.part] = nextValue;
  refreshReading(active.roundIndex, active.face, active.target);

  if (partValid(active.part, nextValue) && nextValue.length >= max) advance();
}

/* ---------------- 距离输入 ---------------- */

function validDistanceText(value) {
  return /^\d{0,5}(?:\.\d{0,4})?$/.test(value);
}

function handleDistKey(key) {
  if (!active || active.kind !== 'dist') return;
  const item = state.rounds[active.roundIndex][active.face][active.target];
  const value = String(item.dist ?? '');

  if (key === 'clear') {
    item.dist = '';
    refreshReading(active.roundIndex, active.face, active.target);
    return;
  }
  if (key === 'next') {
    advance();
    return;
  }
  if (key === 'back') {
    if (value) {
      item.dist = value.slice(0, -1);
      refreshReading(active.roundIndex, active.face, active.target);
    } else {
      const prev = prevSlot(active);
      if (prev) selectSlot(prev);
    }
    return;
  }
  if (key === 'dot') {
    if (!value.includes('.')) {
      const nextValue = value === '' ? '0.' : `${value}.`;
      if (validDistanceText(nextValue)) {
        item.dist = nextValue;
        refreshReading(active.roundIndex, active.face, active.target);
      }
    }
    return;
  }
  if (!/^\d$/.test(key) && key !== '00') return;
  const nextValue = value + (key === '00' ? '00' : key);
  if (validDistanceText(nextValue)) {
    item.dist = nextValue;
    refreshReading(active.roundIndex, active.face, active.target);
  }
}

function handleKey(key) {
  if (key === 'done') {
    closeKeypad();
    return;
  }
  if (!active) {
    const first = firstIncompleteSlot() || getSlots()[0];
    if (!first) return;
    activateSlot(first);
  }
  if (!active) return;
  if (active.kind === 'angle') handleAngleKey(key);
  else handleDistKey(key);
  syncActive();
  updateCaption();
  save();
}

function bindKeypad() {
  $('.keypad-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    handleKey(button.dataset.key);
  });
  $('#keypad-hide').addEventListener('click', closeKeypad);

  document.addEventListener('keydown', (event) => {
    if (!keypadVisible) return;
    if (event.target.closest('input, textarea, select')) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      handleKey(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      handleKey('back');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      handleKey('next');
    } else if (event.key === '.') {
      event.preventDefault();
      handleKey('dot');
    } else if (event.key === 'Escape') {
      closeKeypad();
    }
  });
}

/* ---------------- 渲染 ---------------- */

const roundTpl = $('#tpl-round');

function buildRound(face, round, index) {
  const node = roundTpl.content.firstElementChild.cloneNode(true);
  node.dataset.index = String(index);
  node.querySelector('.round-no').textContent = `测回 ${index + 1}`;
  const half = angleFromReadings(round[face].a, round[face].b);
  node.querySelector('.round-angle').textContent = half != null ? formatAngle(half) : '';

  ['a', 'b'].forEach((target) => {
    const row = node.querySelector(`.read-row[data-target="${target}"]`);
    const item = round[face][target];
    row.querySelectorAll('.cell').forEach((cell) => {
      const part = cell.dataset.part;
      cell.querySelector('.cell-val').textContent = cellText(part, item[part]);
      cell.classList.toggle('invalid', item[part] !== '' && !partValid(part, item[part]));
      cell.addEventListener('click', () => {
        activateSlot({ kind: 'angle', roundIndex: index, face, target, part });
      });
    });
    const distCell = row.querySelector('.dist-cell');
    distCell.querySelector('.dist-val').textContent = item.dist;
    distCell.classList.toggle('invalid', Boolean(item.dist) && parseDistance(item.dist) == null);
    distCell.addEventListener('click', () => {
      activateSlot({ kind: 'dist', roundIndex: index, face, target });
    });
  });

  const twoEl = node.querySelector('.round-2c');
  if (face === 'right') {
    const cA = twoCSeconds(round.left.a, round.right.a);
    const cB = twoCSeconds(round.left.b, round.right.b);
    const parts = [];
    if (cA != null) parts.push(`A ${formatSignedDelta(cA)}`);
    if (cB != null) parts.push(`B ${formatSignedDelta(cB)}`);
    if (parts.length) {
      twoEl.hidden = false;
      twoEl.textContent = `2C  ${parts.join('   ')}`;
    }
  }
  return node;
}

function updateFaceProgress() {
  const face = currentFace();
  if (!face) return;
  const round = currentRound();
  let done = 0;
  if (readingValid(round[face].a)) done += 1;
  if (readingValid(round[face].b)) done += 1;
  $('#face-progress').textContent = `${done} / 2`;
}

function updateFlow() {
  const total = state.roundCount * 2;
  let done = 0;
  state.rounds.forEach((round) => {
    if (readingValid(round.left.a) && readingValid(round.left.b)) done += 1;
    if (readingValid(round.right.a) && readingValid(round.right.b)) done += 1;
  });

  $('#flow-count').textContent = `${done} / ${total} 面`;
  $('#flow-fill').style.width = `${total ? (done / total) * 100 : 0}%`;

  if (state.phase === 'setup') {
    $('#flow-title').textContent = '设站';
  } else if (state.phase === 'left' || state.phase === 'right') {
    $('#flow-title').textContent = `第 ${state.roundIndex + 1} / ${state.roundCount} 测回 · ${state.phase === 'left' ? '盘左' : '盘右'}`;
  } else if (state.phase === 'circle') {
    $('#flow-title').textContent = `置盘 · 准备第 ${state.roundIndex + 1} 测回`;
  } else {
    $('#flow-title').textContent = '成果';
  }
}

function renderFaceGuide() {
  const face = currentFace();
  if (!face) return;
  const roundIndex = state.roundIndex;
  const isLeft = face === 'left';
  const start = formatStartReading(roundIndex);
  const title = isLeft ? '盘左（正镜）观测' : '盘右（倒镜）观测';
  $('#face-kicker').textContent = `第 ${roundIndex + 1} / ${state.roundCount} 测回 · ${isLeft ? '盘左' : '盘右'}`;
  $('#face-guide-title').textContent = title;

  const list = $('#face-guide-list');
  list.replaceChildren();
  const items = isLeft
    ? [
        roundIndex === 0
          ? `第 1 测回盘左：照准目标 A，把水平度盘配置到约 0°00′00″（略大于 0°）。`
          : `第 ${roundIndex + 1} 测回盘左：本测回已在置盘页配置到约 ${start}。`,
        '照准目标 A，读水平度盘并测距；顺时针照准目标 B，读数、测距。',
        '程序自动算半测回角值；完成后倒镜，测同一测回的盘右。',
      ]
    : [
        '倒镜到盘右，先照准目标 B，再照准目标 A（与盘左顺序相反）。',
        '每个目标读水平度盘并测距；程序自动算半测回和 2C。',
        '2C 或半测回互差超限时，先检查仪器与操作，再重测该测回。',
      ];
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
}

function renderFlowPanels() {
  $('#step-1').hidden = state.phase !== 'setup';
  $('#step-face').hidden = !['left', 'right'].includes(state.phase);
  $('#step-circle').hidden = state.phase !== 'circle';
  $('#step-result').hidden = state.phase !== 'result';
  updateFlow();
}

function renderFacePanel() {
  if (!['left', 'right'].includes(state.phase)) return;
  const face = currentFace();
  $('#face-title').textContent = `测回 ${state.roundIndex + 1} · ${face === 'left' ? '盘左' : '盘右'}`;
  renderFaceGuide();
  const round = currentRound();
  const list = $('#face-round');
  list.replaceChildren(buildRound(face, round, state.roundIndex));
  updateFaceProgress();
}

function renderCircle() {
  if (state.phase !== 'circle') return;
  const roundIndex = state.roundIndex;
  const target = formatStartReading(roundIndex);
  $('#circle-title').textContent = `第 ${roundIndex + 1} 测回前配置水平度盘`;
  $('#circle-label').textContent = `第 ${roundIndex + 1} 测回起始读数`;
  $('#circle-target').textContent = target;
  $('#circle-hint').textContent = `${state.roundCount} 个测回按 180°/n 递增；本测回配置到 ${target}，盘左照准目标 A 后读数应略大于该值。`;
}

function checkBadge(value, limit, neutralLabel) {
  if (value == null) return { text: '待测', cls: 'neutral' };
  if (limit == null) return { text: neutralLabel || '不要求', cls: 'neutral' };
  return value <= limit + 1e-9
    ? { text: `≤${limit}″ 合格`, cls: 'ok' }
    : { text: `＞${limit}″ 超限`, cls: 'bad' };
}

function addCheckRow(name, valueSec, limit, neutralLabel) {
  const row = document.createElement('div');
  row.className = 'check-row';
  const nameEl = document.createElement('span');
  nameEl.className = 'check-name';
  nameEl.textContent = name;
  const valueEl = document.createElement('b');
  valueEl.className = 'check-value';
  valueEl.textContent = valueSec != null ? formatDelta(Math.abs(valueSec)) : '—';
  const badge = checkBadge(valueSec != null ? Math.abs(valueSec) : null, limit, neutralLabel);
  const badgeEl = document.createElement('span');
  badgeEl.className = `check-badge ${badge.cls}`;
  badgeEl.textContent = badge.text;
  row.append(nameEl, valueEl, badgeEl);
  return row;
}

function renderSummary() {
  const summary = computeSummary();
  $('#sum-angle').textContent = summary.angle != null ? formatAngle(summary.angle) : '—';
  $('#instrument-tag').textContent = state.station.instrument;

  const checks = $('#checks');
  checks.replaceChildren(
    addCheckRow('半测回互差', summary.halfDiff, summary.limits.half),
    addCheckRow('各测回互差', summary.setsDiff, summary.limits.sets),
    addCheckRow('2C 互差', summary.twoCSpread, summary.limits.twoC, '不要求'),
  );

  const oneSets = $('#one-sets');
  oneSets.replaceChildren();
  const head = document.createElement('div');
  head.className = 'result-row result-head';
  ['测回', '盘左', '盘右', '一测回'].forEach((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    head.appendChild(span);
  });
  oneSets.appendChild(head);
  summary.calcs.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    [
      `测回 ${index + 1}`,
      item.l != null ? formatAngle(item.l) : '—',
      item.r != null ? formatAngle(item.r) : '—',
      item.one != null ? formatAngle(item.one) : '—',
    ].forEach((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      row.appendChild(span);
    });
    oneSets.appendChild(row);
  });

  const twoC = $('#two-c');
  twoC.replaceChildren();
  const twoHead = document.createElement('div');
  twoHead.className = 'result-row result-head';
  ['测回', 'A', 'B'].forEach((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    twoHead.appendChild(span);
  });
  twoC.appendChild(twoHead);
  summary.calcs.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const label = document.createElement('span');
    label.textContent = `测回 ${index + 1}`;
    row.appendChild(label);
    [item.cA, item.cB].forEach((value) => {
      const span = document.createElement('span');
      span.textContent = value != null ? formatSignedDelta(value) : '—';
      if (value != null && summary.limits.twoC != null && Math.abs(value) > summary.limits.twoC + 1e-9) {
        span.classList.add('bad-text');
      }
      row.appendChild(span);
    });
    twoC.appendChild(row);
  });

  const distances = $('#distances');
  distances.replaceChildren();
  [['A', summary.distA], ['B', summary.distB]].forEach(([name, stats]) => {
    const row = document.createElement('div');
    row.className = 'result-row two-col';
    const label = document.createElement('span');
    label.textContent = `${name} 方向`;
    const value = document.createElement('b');
    value.textContent = stats ? `${formatMeters(stats.mean)} m` : '—';
    row.append(label, value);
    distances.appendChild(row);
  });

  $('#report').textContent = buildReport(summary);
}

function buildReport(summary) {
  const lines = [];
  lines.push('全站仪测回成果');
  lines.push(`测站：${state.station.name}    仪器：${state.station.instrument}    仪器高：${state.station.ih} m    测回数：${state.roundCount}`);
  if (state.station.bs) lines.push(`后视点：${state.station.bs}`);
  lines.push(`各测回平均：${summary.angle != null ? formatAngle(summary.angle) : '—'}`);
  summary.calcs.forEach((item, index) => {
    lines.push(
      `测回 ${index + 1}：盘左 ${item.l != null ? formatAngle(item.l) : '—'}，盘右 ${item.r != null ? formatAngle(item.r) : '—'}，一测回 ${item.one != null ? formatAngle(item.one) : '—'}`,
    );
    lines.push(
      `        2C：A ${item.cA != null ? formatSignedDelta(item.cA) : '—'}，B ${item.cB != null ? formatSignedDelta(item.cB) : '—'}`,
    );
  });
  lines.push(
    `水平距离：A ${summary.distA ? `${formatMeters(summary.distA.mean)} m` : '—'}；B ${summary.distB ? `${formatMeters(summary.distB.mean)} m` : '—'}`,
  );
  lines.push(
    `检核：半测回互差 ${summary.halfDiff != null ? formatDelta(summary.halfDiff) : '—'}；各测回互差 ${summary.setsDiff != null ? formatDelta(summary.setsDiff) : '—'}；2C 互差 ${summary.twoCSpread != null ? formatDelta(summary.twoCSpread) : '—'}`,
  );
  return lines.join('\n');
}

/* ---------------- 导航 ---------------- */

function renderNav() {
  const prev = $('#btn-prev');
  const next = $('#btn-next');
  const bar = $('#wizard-actions');
  bar.hidden = state.phase === 'result';

  prev.hidden = state.phase === 'setup';
  prev.textContent = '上一步';
  next.hidden = state.phase === 'result';

  if (state.phase === 'setup') next.textContent = '开始第 1 测回';
  else if (state.phase === 'left') next.textContent = '盘左完成，倒镜盘右';
  else if (state.phase === 'right') {
    next.textContent = state.roundIndex + 1 < state.roundCount ? '完成本测回，准备置盘' : '查看成果';
  } else if (state.phase === 'circle') {
    next.textContent = `置盘完成，开始第 ${state.roundIndex + 1} 测回`;
  }
}

function renderAll() {
  renderFlowPanels();
  renderFacePanel();
  renderCircle();
  renderSummary();
  renderNav();
}

function goPhase(phase, roundIndex = state.roundIndex) {
  closeKeypad();
  state.phase = phase;
  state.roundIndex = roundIndex;
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  save();
}

function handleNext() {
  if (state.phase === 'setup') {
    if (!setupValid()) {
      toast('请填测站名称和有效仪器高');
      $('#station-name').focus();
      return;
    }
    goPhase('left', 0);
    return;
  }
  if (state.phase === 'left') {
    if (!faceComplete('left')) {
      toast('本测回盘左还有读数没输完');
      return;
    }
    goPhase('right', state.roundIndex);
    return;
  }
  if (state.phase === 'right') {
    if (!faceComplete('right')) {
      toast('本测回盘右还有读数没输完');
      return;
    }
    if (state.roundIndex + 1 < state.roundCount) {
      goPhase('circle', state.roundIndex + 1);
    } else {
      goPhase('result', state.roundIndex);
    }
    return;
  }
  if (state.phase === 'circle') {
    goPhase('left', state.roundIndex);
  }
}

function handlePrev() {
  if (state.phase === 'left') {
    goPhase(state.roundIndex === 0 ? 'setup' : 'circle', state.roundIndex);
  } else if (state.phase === 'right') {
    goPhase('left', state.roundIndex);
  } else if (state.phase === 'circle') {
    goPhase('right', state.roundIndex - 1);
  } else if (state.phase === 'result') {
    goPhase('right', state.roundCount - 1);
  }
}

/* ---------------- 动作 ---------------- */

function demoState() {
  return {
    version: VERSION,
    phase: 'result',
    roundIndex: 1,
    roundCount: 2,
    station: { name: 'GCP2', ih: '1.500', instrument: 'DJ6', bs: 'GCP1' },
    rounds: [
      {
        left: { a: reading(0, 20, 42, '59.230'), b: reading(125, 35, 0, '114.552') },
        right: { a: reading(180, 21, 12, '59.230'), b: reading(305, 35, 36, '114.551') },
      },
      {
        left: { a: reading(90, 11, 36, '59.231'), b: reading(215, 26, 0, '114.553') },
        right: { a: reading(270, 11, 42, '59.231'), b: reading(35, 26, 12, '114.553') },
      },
    ],
  };
}

function hasData() {
  return state.rounds.some((round) =>
    ['left', 'right'].some((face) =>
      ['a', 'b'].some((target) => {
        const item = round[face][target];
        return item.d || item.m || item.s || item.dist;
      }),
    ),
  );
}

function loadDemo() {
  if (hasData() && !confirm('载入示例会覆盖当前数据，继续？')) return;
  state = demoState();
  syncSetupInputs();
  renderAll();
  save();
  toast('已载入示例');
}

function newStation() {
  state = defaultState();
  closeKeypad();
  syncSetupInputs();
  renderAll();
  save();
  toast('已新建测站');
  window.scrollTo({ top: 0 });
}

function copyReport() {
  const text = $('#report').textContent || '';
  const done = () => toast('成果已复制');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    toast('复制失败，请长按选择');
  }
  area.remove();
}

/* ---------------- 表单 ---------------- */

function syncSetupInputs() {
  $('#station-name').value = state.station.name;
  $('#station-ih').value = state.station.ih;
  $('#instrument').value = state.station.instrument;
  $('#round-count').value = String(state.roundCount);
  $('#station-bs').value = state.station.bs;
}

function setRoundCount(count) {
  const next = Math.min(4, Math.max(1, count));
  while (state.rounds.length < next) state.rounds.push(createRound());
  if (state.rounds.length > next) state.rounds = state.rounds.slice(0, next);
  state.roundCount = next;
  state.roundIndex = 0;
  state.phase = 'setup';
  renderAll();
  save();
}

function bindSetup() {
  $('#station-name').addEventListener('input', (event) => {
    state.station.name = event.target.value;
    save();
  });
  $('#station-ih').addEventListener('input', (event) => {
    state.station.ih = event.target.value;
    save();
  });
  $('#instrument').addEventListener('change', (event) => {
    state.station.instrument = event.target.value;
    renderSummary();
    save();
  });
  $('#station-bs').addEventListener('input', (event) => {
    state.station.bs = event.target.value;
    save();
  });
  $('#round-count').addEventListener('change', (event) => {
    const count = Number(event.target.value);
    if (hasData() && !confirm(`改为 ${count} 个测回会调整已有数据，继续？`)) {
      event.target.value = String(state.roundCount);
      return;
    }
    setRoundCount(count);
  });
}

/* ---------------- 静态事件 ---------------- */

function bindStatic() {
  $('#btn-next').addEventListener('click', handleNext);
  $('#btn-prev').addEventListener('click', handlePrev);
  $('#btn-demo').addEventListener('click', loadDemo);
  $('#btn-copy').addEventListener('click', copyReport);
  $('#btn-new-station').addEventListener('click', newStation);
  $('#btn-result-back').addEventListener('click', handlePrev);

  $('#btn-help').addEventListener('click', () => {
    $('#help-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  });
  $('#btn-sheet-close').addEventListener('click', () => {
    $('#help-sheet').hidden = true;
    document.body.style.overflow = '';
  });
  $('#help-sheet').addEventListener('click', (event) => {
    if (event.target === $('#help-sheet')) {
      $('#help-sheet').hidden = true;
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#help-sheet').hidden) {
      $('#help-sheet').hidden = true;
      document.body.style.overflow = '';
    }
  });

  bindSetup();
  bindKeypad();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function init() {
  bindStatic();
  syncSetupInputs();
  // 刷新时如果还没测完却停在成果页，退回最后一个盘右
  if (state.phase === 'result' && !allComplete()) {
    state.roundIndex = state.roundCount - 1;
    state.phase = faceComplete('right', state.roundIndex) ? 'result' : 'right';
  }
  if (state.phase === 'circle' && state.roundIndex < 1) {
    state.phase = 'left';
    state.roundIndex = 0;
  }
  renderAll();
  registerSW();
}

init();
