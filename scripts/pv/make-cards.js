/* PVの文字カード2枚（開き・締め）を焼く。720×1280。
 *
 *   NODE_PATH=../shikifuda-kasane/node_modules node scripts/pv/make-cards.js
 *
 * 締めのカードに並べる4枚は、画面と同じ道（列で選ぶ → 階梯の10段 → canvas）で額装したもの。
 * 原本は置かない。焼いた絵は scripts/pv/src/（追跡しない）にだけ出る。
 */
'use strict';
const puppeteer = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), SRC = path.join(__dirname, 'src');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FOUR = ['mami', 'tobari', 'gokou', 'sasura'];

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500&family=Shippori+Mincho+B1:wght@500;700&display=block" rel="stylesheet">';
const BASE = `html,body{margin:0;width:720px;height:1280px;background:#131320;color:#E8E4D8;overflow:hidden}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Shippori Mincho B1",serif;
background:radial-gradient(ellipse 90% 60% at 50% 42%,#1B1B2E 0%,#131320 70%)}
.gold{color:#D9A94C}.dim{color:#9D93B5;font-family:"M PLUS Rounded 1c",sans-serif}`;

const intro = `<!doctype html><meta charset="utf-8">${FONTS}<style>${BASE}
h1{font-size:104px;font-weight:500;letter-spacing:.14em;margin:0 0 56px;text-indent:.14em}
p{font-size:44px;font-weight:500;letter-spacing:.08em;margin:0;line-height:1.7;text-align:center}
small{display:block;margin-top:64px;font-size:26px;letter-spacing:.06em}</style>
<h1 class="gold">夜じたて</h1><p>新しい御霊が、四柱。</p><small class="dim">33柱 × 顕れの深さ10段</small>`;

const end = imgs => `<!doctype html><meta charset="utf-8">${FONTS}<style>${BASE}
.row{display:flex;gap:14px;margin-bottom:76px}
.row img{width:156px;height:338px;object-fit:cover;border-radius:12px;box-shadow:0 0 0 1px rgba(157,147,181,.28)}
h1{font-size:92px;font-weight:500;letter-spacing:.14em;margin:0 0 30px;text-indent:.14em}
p{font-size:36px;font-weight:500;letter-spacing:.06em;margin:0 0 54px;text-align:center;line-height:1.6}
.url{font-size:34px;letter-spacing:.02em;color:#F0CE7E;font-family:"M PLUS Rounded 1c",sans-serif;font-weight:500;margin-bottom:60px}
small{font-size:24px;letter-spacing:.04em;text-align:center;line-height:1.7}</style>
<div class="row">${imgs.map(u => `<img src="${u}">`).join('')}</div>
<h1 class="gold">夜じたて</h1><p>札絵を、その端末の夜に<br>合わせて額装します。</p>
<div class="url">hirohgxx.github.io/yo-jitate</div>
<small class="dim">『月蝕綺譚 -Luna Occulta-』の二次創作です。<br>公式とは関係ありません。</small>`;

(async () => {
  fs.mkdirSync(SRC, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${srv.address().port}/#size=585x1268`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 60000 });
    const imgs = [];
    for (const id of FOUR) {
      const u = await page.evaluate(async id => {
        document.querySelector('#strip button[data-id="' + id + '"]').click();
        document.querySelectorAll('#depth button')[9].click();
        await new Promise(r => setTimeout(r, 400));
        const t0 = Date.now();
        while (document.getElementById('save').disabled) {
          if (Date.now() - t0 > 60000) throw new Error('焼き上がらない');
          await new Promise(r => setTimeout(r, 100));
        }
        await new Promise(r => setTimeout(r, 900));   // 顕れの入れ替えが終わるまで
        return document.getElementById('cv').toDataURL('image/jpeg', 0.92);
      }, id);
      imgs.push(u);
      console.log('額装した: ' + id);
    }
    const card = await browser.newPage();
    await card.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
    for (const [name, doc] of [['intro', intro], ['end', end(imgs)]]) {
      await card.setContent(doc, { waitUntil: 'load', timeout: 120000 });
      await card.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 600)); });
      await card.screenshot({ path: path.join(SRC, name + '.png') });
      console.log('✓ ' + name + '.png');
    }
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
