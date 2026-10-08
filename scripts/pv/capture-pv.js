/* PVの素材を録る（画だけ。この道具は音を鳴らさない）。
 *
 *   NODE_PATH=../shikifuda-kasane/node_modules node scripts/pv/capture-pv.js
 *
 * 端末の見た目で撮る: 360×640 @2x（＝720×1280）。コマの間隔は揃わないので、
 * 実時刻つきの list.txt を書き、assemble.sh が fps=30 に均す（kitan-works/docs/MEDIA.md）。
 *
 * 振り付け（2026-10-09・4柱が来た回）:
 *   開幕の顕れ → 深さを01へ → 列を送ってマミ → 01から10へ満ちる → 列を送ってトバリ → ゴコウ → サスラ
 * 押し所は実クリック（座標）で押す。内部の関数は叩かない。
 * 押した所に小さな印を出す（録画のときだけ差し込む。本体は無改変）。
 */
'use strict';
const puppeteer = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'src', 'cap');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'],
    defaultViewport: { width: 360, height: 640, deviceScaleFactor: 2 } });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('mousedown', e => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;' +
        'border-radius:50%;background:rgba(232,228,216,.34);box-shadow:0 0 0 1px rgba(232,228,216,.5);' +
        'left:' + e.clientX + 'px;top:' + e.clientY + 'px;transition:opacity .45s ease-out,transform .45s ease-out;';
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => { d.style.opacity = '0'; d.style.transform = 'scale(1.5)'; });
      setTimeout(() => d.remove(), 520);
    }, true);
  });

  const frames = [];
  const cdp = await page.createCDPSession();
  // **screencast は deviceScaleFactor を無視して 360×640 で返す**（maxWidth を渡しても拡大はしない）。
  // 2倍の絵が要るので、captureScreenshot を回して実時刻つきで集める（1枚30〜50ms＝毎秒20コマ前後）。
  let rec = false, loop = null;
  const startRec = () => { rec = true; loop = (async () => {
    while (rec) {
      const ts = Date.now() / 1000;
      try {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 360, height: 640, scale: 2 } });
        frames.push({ ts, data: r.data });
      } catch (e) {}
    }
  })(); };
  const stopRec = async () => { rec = false; await loop; };
  const marks = [];
  const mark = name => marks.push({ name, t: Date.now() / 1000 });

  // 先に一度開いて、使う札絵を全部あたためる（録画中に回線待ちで絵が遅れないように）
  await page.goto(`http://127.0.0.1:${srv.address().port}/#size=1179x2556`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 60000 });
  const { LEDGER } = require('../build-roster.js');
  const warm = LEDGER.assets.filter(a => a.char === 'mami'
    || (['tobari', 'gokou', 'sasura'].includes(a.char) && a.rank === 10)
    || (a.char === 'sakuya' && a.rank === 1)).map(a => a.url);
  await page.evaluate(async urls => {
    await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = i.onerror = r; i.src = u; })));
  }, warm);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  const tap = async sel => {
    const b = await page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(b.x, b.y);
  };
  const bring = async id => {   // 列を送って、その柱を列の中ほどへ
    await page.$eval(`#strip button[data-id="${id}"]`, e => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await sleep(750);
  };
  const depthSel = n => `#depth button:nth-child(${n})`;
  const depthOrder = await page.$$eval('#depth button', bs => bs.map(b => b.textContent.trim()));

  await page.reload({ waitUntil: 'domcontentloaded' });
  startRec();
  mark('open');
  await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 60000 });
  await sleep(2300);                       // 開幕の顕れを見せきる
  // 階梯の釦は DOM の並びと段の番号が一致するとは限らない。段ごとに data か文字で引く
  const tapDepth = async n => {
    const b = await page.$$eval('#depth button', (bs, n) => {
      const i = bs.findIndex(x => parseInt(x.getAttribute('data-depth') || x.getAttribute('aria-label').replace(/\D/g, ''), 10) === n);
      const r = bs[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, n);
    await page.mouse.click(b.x, b.y);
  };
  mark('depth01'); await tapDepth(1); await sleep(900);
  await bring('mami');
  mark('mami'); await tap('#strip button[data-id="mami"]'); await sleep(1100);
  for (let d = 2; d <= 10; d++) { await tapDepth(d); await sleep(d === 10 ? 1700 : 330); }
  mark('tobari'); await bring('tobari'); await tap('#strip button[data-id="tobari"]'); await sleep(1500);
  mark('gokou'); await tap('#strip button[data-id="gokou"]'); await sleep(1500);
  mark('sasura'); await tap('#strip button[data-id="sasura"]'); await sleep(1800);
  mark('end');
  await stopRec();

  // コマを書き出す。ts は秒（実時刻）
  const t0 = frames[0].ts;
  let list = '';
  frames.forEach((f, i) => {
    const name = 'f' + String(i).padStart(4, '0') + '.jpg';
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, 'base64'));
    const dur = i + 1 < frames.length ? frames[i + 1].ts - f.ts : 0.5;
    list += `file '${name}'\nduration ${dur.toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, 'list.txt'), list);
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ t0, marks: marks.map(m => ({ name: m.name, at: +(m.t - t0).toFixed(3) })), depthOrder }, null, 1));
  console.log(`コマ ${frames.length}枚・${(frames[frames.length - 1].ts - t0).toFixed(2)}秒`);
  console.log(marks.map(m => `${m.name} ${(m.t - t0).toFixed(2)}`).join(' / '));
  if (errors.length) console.log('✗ 画面で例外: ' + errors.join(' / '));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
