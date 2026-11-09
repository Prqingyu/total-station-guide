/**
 * 生成展示截图（本地服务器需已启动）
 *   node tools/screenshots.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788/';
const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = path.resolve('shots');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function freshPage({ width = 390, height = 844, dark = false, mobile = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? 'dark' : 'light',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  return { context, page };
}

async function loadDemo(page) {
  await page.click('#btn-demo');
  await page.waitForTimeout(2100);
}

/** 用示例数据裁剪出某个阶段的真实状态 */
async function showStage(page, mode) {
  await loadDemo(page);
  await page.evaluate((stage) => {
    const key = 'tsguide.v2';
    const state = JSON.parse(localStorage.getItem(key));
    const empty = () => ({ d: '', m: '', s: '', dist: '' });
    const emptyRound = () => ({
      left: { a: empty(), b: empty() },
      right: { a: empty(), b: empty() },
    });
    if (stage === 'left') {
      state.rounds[0].right = { a: empty(), b: empty() };
      state.rounds[1] = emptyRound();
      state.phase = 'left';
      state.roundIndex = 0;
    } else if (stage === 'right') {
      state.rounds[1] = emptyRound();
      state.phase = 'right';
      state.roundIndex = 0;
    } else if (stage === 'circle') {
      state.rounds[1] = emptyRound();
      state.phase = 'circle';
      state.roundIndex = 1;
    } else {
      state.phase = 'result';
      state.roundIndex = 1;
    }
    localStorage.setItem(key, JSON.stringify(state));
  }, mode);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

/* ---------- 手机亮色 ---------- */
{
  const { context, page } = await freshPage();
  await page.screenshot({ path: `${OUT}/guide-00-setup.png` });

  await showStage(page, 'left');
  await page.screenshot({ path: `${OUT}/guide-01-left.png` });
  await page.click('#face-round .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/guide-02-left-keypad.png` });

  await showStage(page, 'right');
  await page.screenshot({ path: `${OUT}/guide-03-right.png` });

  await showStage(page, 'circle');
  await page.screenshot({ path: `${OUT}/guide-04-circle.png` });

  await showStage(page, 'result');
  await page.screenshot({ path: `${OUT}/guide-05-summary.png` });
  await page.close();
  await context.close();
}

/* ---------- 手机深色 ---------- */
{
  const { context, page } = await freshPage({ dark: true });
  await showStage(page, 'result');
  await page.screenshot({ path: `${OUT}/guide-06-dark-summary.png` });
  await page.close();
  await context.close();
}

/* ---------- 桌面 ---------- */
{
  const { context, page } = await freshPage({ width: 1280, height: 900, mobile: false });
  await page.screenshot({ path: `${OUT}/guide-07-desktop-setup.png` });
  await showStage(page, 'result');
  await page.screenshot({ path: `${OUT}/guide-08-desktop-summary.png` });
  await page.close();
  await context.close();
}

await browser.close();
console.log('screenshots written to', OUT);
