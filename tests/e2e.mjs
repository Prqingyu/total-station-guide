/**
 * 全站仪作业引导 · 端到端测试
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
check('四个步骤', (await page.locator('.step').count()) === 4);
check('初始在设站', (await page.getAttribute('.step[data-step="1"]', 'class')).includes('active'));
check('设站不弹键盘', !(await page.isVisible('#keypad')));
check('按钮为开始盘左', (await page.textContent('#btn-next')) === '开始盘左');
check('盘右步骤初始锁定', (await page.getAttribute('.step[data-step="3"]', 'class')).includes('locked'));
check(
  '设站引导可见',
  (await page.textContent('#step-1 .guide')).includes('对中') &&
    (await page.textContent('#step-1 .guide')).includes('仪器高'),
);
await page.screenshot({ path: `${OUT}/${prefix}-01-setup.png` });

await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入盘左', (await page.getAttribute('.step[data-step="2"]', 'class')).includes('active'));
check('盘左默认两个测回', (await page.locator('#step-2 .round').count()) === 2);
check('盘左不自动弹键盘', !(await page.isVisible('#keypad')));
check('盘左引导可见', (await page.textContent('#step-2 .guide')).includes('照准目标 A'));

/* ---------- 键盘输入 ---------- */
async function press(key) {
  await page.click(`#keypad [data-key="${key}"]`);
  await page.waitForTimeout(12);
}

async function typeReading(stepIndex, roundIndex, target, d, m, s, dist) {
  await page.click(
    `#step-${stepIndex} .round[data-index="${roundIndex}"] .read-row[data-target="${target}"] .cell[data-part="d"]`,
  );
  const degree = String(d);
  for (const char of degree) await press(char);
  if (degree.length < 3) await press('next');
  for (const char of String(m).padStart(2, '0')) await press(char);
  for (const char of String(s).padStart(2, '0')) await press(char);
  for (const char of String(dist)) await press(char === '.' ? 'dot' : char);
  await press('next');
}

await page.click('#step-2 .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
await page.waitForTimeout(100);
check('点读数格打开键盘', await page.isVisible('#keypad'));
check(
  '键盘标题为盘左测回1A读数',
  (await page.textContent('#keypad-caption')) === '盘左 · 测回 1 · A 读数',
  await page.textContent('#keypad-caption'),
);

await typeReading(2, 0, 'a', 0, 20, 42, '59.230');
await typeReading(2, 0, 'b', 125, 35, 0, '114.552');
await typeReading(2, 1, 'a', 90, 11, 36, '59.231');
await typeReading(2, 1, 'b', 215, 26, 0, '114.553');
await page.waitForTimeout(180);
const leftAngles = await page.locator('#step-2 .round-angle').allInnerTexts();
check('盘左两个半测回角值', JSON.stringify(leftAngles) === JSON.stringify(['125°14′18″', '125°14′24″']), JSON.stringify(leftAngles));
check('盘左进度 4/4', (await page.textContent('#left-progress')) === '4 / 4');
check('可进入盘右', (await page.textContent('#btn-next')) === '进入盘右');
await page.screenshot({ path: `${OUT}/${prefix}-02-left.png` });

/* ---------- 3 盘右 ---------- */
await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入盘右', (await page.getAttribute('.step[data-step="3"]', 'class')).includes('active'));
check('盘右不自动弹键盘', !(await page.isVisible('#keypad')));
check('盘右引导可见', (await page.textContent('#step-3 .guide')).includes('先照准目标 B'));

await typeReading(3, 0, 'a', 180, 21, 12, '59.230');
await typeReading(3, 0, 'b', 305, 35, 36, '114.551');
await typeReading(3, 1, 'a', 270, 11, 42, '59.231');
await typeReading(3, 1, 'b', 35, 26, 12, '114.553');
await page.waitForTimeout(180);
const rightAngles = await page.locator('#step-3 .round-angle').allInnerTexts();
check('盘右两个半测回角值', JSON.stringify(rightAngles) === JSON.stringify(['125°14′24″', '125°14′30″']), JSON.stringify(rightAngles));
const twoCTexts = await page.locator('#step-3 .round-2c').allInnerTexts();
check('盘右显示 2C', twoCTexts.length === 2 && twoCTexts[0].includes('−30″') && twoCTexts[0].includes('−36″'), JSON.stringify(twoCTexts));
check('盘右进度 4/4', (await page.textContent('#right-progress')) === '4 / 4');
await page.screenshot({ path: `${OUT}/${prefix}-03-right.png` });

/* ---------- 4 成果 ---------- */
await page.click('#btn-next');
await page.waitForTimeout(250);
check('进入成果', (await page.getAttribute('.step[data-step="4"]', 'class')).includes('active'));
check('各测回平均 125°14′24″', (await page.textContent('#sum-angle')) === '125°14′24″', await page.textContent('#sum-angle'));
const checksText = await page.textContent('#checks');
check('半测回互差 6″ 合格', checksText.includes('6″') && checksText.includes('≤40″ 合格'), checksText);
check('各测回互差 6″ 合格', checksText.includes('≤24″ 合格'), checksText);
check('2C 互差 6″', (await page.textContent('#checks .check-row:last-child .check-value')) === '6″', await page.textContent('#checks .check-row:last-child .check-value'));
check('DJ6 2C 互差不要求', checksText.includes('不要求'), checksText);
const oneSets = await page.textContent('#one-sets');
check('一测回角值 21/27', oneSets.includes('125°14′21″') && oneSets.includes('125°14′27″'), oneSets);
const twoC = await page.textContent('#two-c');
check('2C 值为负且 A/B 两列', twoC.includes('−30″') && twoC.includes('−36″') && twoC.includes('−6″') && twoC.includes('−12″'), twoC);
check('水平距离均值', (await page.textContent('#distances')).includes('59.230') && (await page.textContent('#distances')).includes('114.552'));
check('成果记录含测站', (await page.textContent('#report')).includes('测站：测站 1'));
await page.screenshot({ path: `${OUT}/${prefix}-04-summary.png` });

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

/* DJ2 限差超限 */
await page.click('.step[data-step="1"]');
await page.waitForTimeout(150);
await page.selectOption('#instrument', 'DJ2');
await page.click('.step[data-step="4"]');
await page.waitForTimeout(200);
check('DJ2 下 2C 互差按 13″ 判定', (await page.textContent('#checks .check-row:last-child .check-badge')).includes('≤13″'), await page.textContent('#checks .check-row:last-child .check-badge'));
check('仪器标签为 DJ2', (await page.textContent('#instrument-tag')) === 'DJ2');
await page.click('.step[data-step="1"]');
await page.waitForTimeout(150);
await page.selectOption('#instrument', 'DJ6');

/* 示例 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
check('示例进入成果', (await page.getAttribute('.step[data-step="4"]', 'class')).includes('active'));
check('示例平均 125°14′24″', (await page.textContent('#sum-angle')) === '125°14′24″');
check('示例 2C 值', (await page.textContent('#two-c')).includes('−30″'));

/* 新建测站 */
await page.click('#btn-new-station');
await page.waitForTimeout(250);
check('新建测站回到设站', (await page.getAttribute('.step[data-step="1"]', 'class')).includes('active'));
check('新建测站清空键盘', !(await page.isVisible('#keypad')));
await page.click('#btn-next');
await page.waitForTimeout(200);
const cleared = await page.evaluate(() =>
  [...document.querySelectorAll('#step-2 .cell-val')].every((el) => el.textContent.trim() === ''),
);
check('新建测站清空读数', cleared);

/* 刷新持久化：先载入示例 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);
check('刷新后仍在成果页', (await page.getAttribute('.step[data-step="4"]', 'class')).includes('active'));
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
await page.screenshot({ path: `${OUT}/${prefix}-05-desktop.png` });

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
