/**
 * 全站仪作业引导 · 端到端测试（每测回：盘左→盘右→置盘）
 *   node tests/e2e.mjs
 *   BASE_URL=https://... node tests/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788/';
const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = path.resolve('shots');
const LIVE = Boolean(process.env.BASE_URL);

await mkdir(OUT, { recursive: true });

const results = [];
const errors = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) errors.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  isMobile: true,
  hasTouch: true,
  serviceWorkers: LIVE ? 'allow' : 'block',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('dialog', (dialog) => dialog.accept());

const prefix = LIVE ? 'live' : 'local';

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);

/* ---------- 1 设站 ---------- */
check('设站流程标题', (await page.textContent('#flow-title')) === '设站');
check('默认 2 测回', (await page.inputValue('#round-count')) === '2');
check('设站不弹键盘', !(await page.isVisible('#keypad')));
check('按钮为开始第 1 测回', (await page.textContent('#btn-next')) === '开始第 1 测回');
check(
  '设站引导含置盘规则',
  (await page.textContent('#step-1 .guide')).includes('180°/n'),
);
await page.screenshot({ path: `${OUT}/${prefix}-01-setup.png` });

await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入第 1 测回盘左', (await page.textContent('#flow-title')) === '第 1 / 2 测回 · 盘左');
check('盘左面板标题', (await page.textContent('#face-title')) === '测回 1 · 盘左');
check('盘左不自动弹键盘', !(await page.isVisible('#keypad')));
check(
  '第 1 测回提示配置 0°',
  (await page.textContent('#face-guide-list')).includes('0°00′00″'),
);

/* ---------- 键盘输入 ---------- */
async function press(key) {
  await page.click(`#keypad [data-key="${key}"]`);
  await page.waitForTimeout(12);
}

async function typeReading(roundIndex, target, d, m, s, dist) {
  await page.click(
    `#face-round .round[data-index="${roundIndex}"] .read-row[data-target="${target}"] .cell[data-part="d"]`,
  );
  const degree = String(d);
  for (const char of degree) await press(char);
  if (degree.length < 3) await press('next');
  for (const char of String(m).padStart(2, '0')) await press(char);
  for (const char of String(s).padStart(2, '0')) await press(char);
  for (const char of String(dist)) await press(char === '.' ? 'dot' : char);
  await press('next');
}

await page.click('#face-round .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
await page.waitForTimeout(80);
check('点读数格打开键盘', await page.isVisible('#keypad'));
check(
  '键盘标题为盘左测回1A读数',
  (await page.textContent('#keypad-caption')) === '盘左 · 测回 1 · A 读数',
  await page.textContent('#keypad-caption'),
);

await typeReading(0, 'a', 0, 20, 42, '59.230');
await typeReading(0, 'b', 125, 35, 0, '114.552');
await page.waitForTimeout(150);
check('盘左进度 2/2', (await page.textContent('#face-progress')) === '2 / 2');
check(
  '盘左半测回 125°14′18″',
  (await page.textContent('#face-round .round-angle')) === '125°14′18″',
  await page.textContent('#face-round .round-angle'),
);
check('下一步为倒镜盘右', (await page.textContent('#btn-next')) === '盘左完成，倒镜盘右');
await page.screenshot({ path: `${OUT}/${prefix}-02-left.png` });

/* ---------- 同测回盘右 ---------- */
await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入同测回盘右', (await page.textContent('#flow-title')) === '第 1 / 2 测回 · 盘右');
check('盘右面板标题', (await page.textContent('#face-title')) === '测回 1 · 盘右');
check('盘右不自动弹键盘', !(await page.isVisible('#keypad')));
check(
  '盘右提示先 B 后 A',
  (await page.textContent('#face-guide-list')).includes('先照准前视点'),
);
await typeReading(0, 'a', 180, 21, 12, '59.230');
await typeReading(0, 'b', 305, 35, 36, '114.551');
await page.waitForTimeout(150);
check(
  '盘右半测回 125°14′24″',
  (await page.textContent('#face-round .round-angle')) === '125°14′24″',
  await page.textContent('#face-round .round-angle'),
);
check(
  '盘右 2C',
  (await page.textContent('#face-round .round-2c')).includes('−30″') &&
    (await page.textContent('#face-round .round-2c')).includes('−36″'),
);
check('下一步为准备置盘', (await page.textContent('#btn-next')) === '完成本测回，准备置盘');
await page.screenshot({ path: `${OUT}/${prefix}-03-right.png` });

/* ---------- 置盘 ---------- */
await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入置盘页', (await page.textContent('#flow-title')) === '置盘 · 准备第 2 测回');
check('置盘目标 90°', (await page.textContent('#circle-target')) === '90°00′00″');
check('置盘提示 180°/n', (await page.textContent('#circle-hint')).includes('180°/n'));
check('下一步为开始第 2 测回', (await page.textContent('#btn-next')) === '置盘完成，开始第 2 测回');
await page.screenshot({ path: `${OUT}/${prefix}-04-circle.png` });

await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入第 2 测回盘左', (await page.textContent('#flow-title')) === '第 2 / 2 测回 · 盘左');
check(
  '第 2 测回提示已置盘 90°',
  (await page.textContent('#face-guide-list')).includes('90°00′00″'),
);
await typeReading(1, 'a', 90, 11, 36, '59.231');
await typeReading(1, 'b', 215, 26, 0, '114.553');
await page.click('#btn-next');
await page.waitForTimeout(200);
check('第 2 测回盘右', (await page.textContent('#flow-title')) === '第 2 / 2 测回 · 盘右');
await typeReading(1, 'a', 270, 11, 42, '59.231');
await typeReading(1, 'b', 35, 26, 12, '114.553');
await page.waitForTimeout(150);
check('最后一步为查看成果', (await page.textContent('#btn-next')) === '查看成果');

/* ---------- 成果 ---------- */
await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入成果', (await page.textContent('#flow-title')) === '成果');
check('各测回平均 125°14′24″', (await page.textContent('#sum-angle')) === '125°14′24″', await page.textContent('#sum-angle'));
const checksText = await page.textContent('#checks');
check('半测回互差 6″ 合格', checksText.includes('6″') && checksText.includes('≤40″ 合格'), checksText);
check('各测回互差 6″ 合格', checksText.includes('≤24″ 合格'), checksText);
check(
  '2C 互差 6″',
  (await page.textContent('#checks .check-row:last-child .check-value')) === '6″',
  await page.textContent('#checks .check-row:last-child .check-value'),
);
check('DJ6 2C 互差不要求', checksText.includes('不要求'), checksText);
const oneSets = await page.textContent('#one-sets');
check('一测回角值 21/27', oneSets.includes('125°14′21″') && oneSets.includes('125°14′27″'), oneSets);
const twoC = await page.textContent('#two-c');
check('2C 值为负且 A/B 两列', twoC.includes('−30″') && twoC.includes('−36″') && twoC.includes('−6″') && twoC.includes('−12″'), twoC);
check('水平距离均值', (await page.textContent('#distances')).includes('59.230') && (await page.textContent('#distances')).includes('114.552'));
check('成果记录含测站', (await page.textContent('#report')).includes('测站：测站 1'));
await page.screenshot({ path: `${OUT}/${prefix}-05-summary.png` });

/* 记录表（PPT 格式） */
await page.click('#btn-table');
await page.waitForTimeout(250);
check('记录表页标题', (await page.textContent('#flow-title')) === '测回记录表');
check('记录表标题', (await page.textContent('#record-table .record-title')) === '测回法水平角观测记录');
check('记录表 8 行读数', (await page.locator('#record-table .record-table tbody tr').count()) === 8);
check(
  '记录表列头',
  (await page.textContent('#record-table thead')).includes('测回数') &&
    (await page.textContent('#record-table thead')).includes('水平度盘读数') &&
    (await page.textContent('#record-table thead')).includes('半测回角值') &&
    (await page.textContent('#record-table thead')).includes('一测回角值') &&
    (await page.textContent('#record-table thead')).includes('各测回平均值') &&
    (await page.textContent('#record-table thead')).includes('水平距离') &&
    (await page.textContent('#record-table thead')).includes('方向'),
);
check('记录表测站写成测站', (await page.textContent('#record-table .rec-station')) === '测站');
const dirText = await page.textContent('#record-table');
check(
  '方向列含两条方向',
  (await page.locator('#record-table .rec-dir').count()) === 2 &&
    dirText.includes('测站 1') &&
    dirText.includes('后视点') &&
    dirText.includes('前视点'),
);
check(
  '水平距离均值进入表内',
  (await page.locator('#record-table .rec-distmean').count()) === 2 &&
    dirText.includes('59.230') &&
    dirText.includes('114.552'),
);
const tableText = await page.textContent('#record-table');
check(
  '记录表含角度',
  tableText.includes('125') && tableText.includes('14') && tableText.includes('18'),
  tableText.slice(0, 100),
);
await page.screenshot({ path: `${OUT}/${prefix}-06-table.png` });
await page.click('#btn-table-back');
await page.waitForTimeout(200);
check('记录表可返回成果', (await page.textContent('#flow-title')) === '成果');

/* 历史测站 */
await page.click('#btn-history');
await page.waitForTimeout(250);
check('历史有 1 条测站', (await page.locator('.history-item').count()) === 1);
check('历史条目含测站名', (await page.textContent('#history-list')).includes('测站 1'));
await page.fill('#history-search', '测站');
await page.waitForTimeout(100);
check('历史搜索命中', (await page.locator('.history-item').count()) === 1);
await page.locator('.history-item').first().click();
await page.waitForTimeout(200);
check('历史详情有记录表', (await page.locator('#history-detail .record-table').count()) === 1);
await page.click('#btn-history-close');
await page.waitForTimeout(150);

/* 复制 */
await page.click('#btn-copy');
await page.waitForTimeout(350);
const clip = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    return `ERROR:${error}`;
  }
});
check('复制成果含平均与检核', clip.includes('各测回平均') && clip.includes('125°14′24″') && clip.includes('半测回互差'), clip.slice(0, 120));

/* 返回盘右 */
await page.click('#btn-result-back');
await page.waitForTimeout(200);
check('成果页可返回盘右', (await page.textContent('#flow-title')) === '第 2 / 2 测回 · 盘右');

/* DJ2 限差：改本地状态后刷新（保留数据） */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('tsguide.v2'));
  s.station.instrument = 'DJ2';
  s.phase = 'result';
  s.roundIndex = 1;
  localStorage.setItem('tsguide.v2', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('DJ2 仪器标签', (await page.textContent('#instrument-tag')) === 'DJ2');
check(
  'DJ2 下 2C 互差按 13″ 判定',
  (await page.textContent('#checks .check-row:last-child .check-badge')).includes('≤13″'),
  await page.textContent('#checks .check-row:last-child .check-badge'),
);

/* 示例 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
check('示例进入成果', (await page.textContent('#flow-title')) === '成果');
check('示例平均 125°14′24″', (await page.textContent('#sum-angle')) === '125°14′24″');
check('示例 2C 值', (await page.textContent('#two-c')).includes('−30″'));

/* 新建测站 */
await page.click('#btn-new-station');
await page.waitForTimeout(250);
check('新建测站回到设站', (await page.textContent('#flow-title')) === '设站');
check('新建测站清空键盘', !(await page.isVisible('#keypad')));
check('新建测站默认 2 测回', (await page.inputValue('#round-count')) === '2');
check('上一站前视变新测站', (await page.inputValue('#station-name')) === 'GCP3');
check('上一站测站变新后视', (await page.inputValue('#station-bs')) === 'GCP2');
check('新前视留空待填', (await page.inputValue('#station-fs')) === '');
await page.click('#btn-next');
await page.waitForTimeout(200);
const cleared = await page.evaluate(() =>
  [...document.querySelectorAll('#face-round .cell-val')].every((el) => el.textContent.trim() === ''),
);
check('新建测站清空读数', cleared);

/* 刷新持久化：先载入示例 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);
check('刷新后仍在成果页', (await page.textContent('#flow-title')) === '成果');
check('刷新后平均保留', (await page.textContent('#sum-angle')) === '125°14′24″');

/* 布局 */
for (const [width, height] of [
  [360, 800],
  [390, 844],
  [430, 932],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(120);
  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(`${width}px 无横向溢出`, layout.scrollWidth <= layout.innerWidth + 1, JSON.stringify(layout));
}

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(150);
const desktop = await page.evaluate(() => ({
  appWidth: document.querySelector('#app').getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
}));
check('桌面不破版', desktop.overflow && desktop.appWidth <= 600, JSON.stringify(desktop));
await page.screenshot({ path: `${OUT}/${prefix}-06-desktop.png` });

await browser.close();
const summary = {
  base: BASE,
  time: new Date().toISOString(),
  checks: results.length,
  failed: results.filter((item) => !item.ok).length,
  errors,
  results,
};
await writeFile(`${OUT}/${prefix}-e2e-result.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
