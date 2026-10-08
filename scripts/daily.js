/* 今日の一枚を焼く。ショートカットが取りにくる固定URL用。
 *
 *   NODE_PATH=../shikifuda-kasane/node_modules node scripts/daily.js [YYYY-MM-DD] [出力先]
 *   （手元では puppeteer-core を既存作から借りる。GitHub Actions では workflow が入れる）
 *
 * 決め方:
 *   日付から一意に決める。乱数を使わない——**同じ日なら誰が焼いても同じ一枚**になる。
 *   n = その日が起点から何日目か（410で回す）
 *   御霊 = 毎朝の巡り（41枠）の n % 41 番目   ／   深さ = 1 + n % 10
 *   巡りは33柱に重みを付けたもの（scripts/build-roster.js の DAILY_SLOTS）。
 *   新しく来た4柱（トバリ・ゴコウ・マミ・サスラ）は3枠ずつ、ほかの29柱は1枠ずつ＝29 + 4×3 = 41枠。
 *   41 と 10 は互いに素なので、**410日で330枚ぜんぶを通り**（重み付きの柱は各段を3度）、毎日どちらも変わる。
 *   （2026-10-08 までは 29柱を等しく290日で回していた。巡りを組み替えた日から先の並びは前と違う）
 *
 * 焼き方:
 *   画面と同じ道を通す。札から御霊を選び、帯の段を押して、canvas から書き出す。
 *   内部の関数を直接叩かない（検証の近道が本番と同じ関門を通っているか・qa の決めごと）。
 *
 * 罠:
 *   - ヘッドレスChromeの `screen.width` はOSの画面を返す。寸法は `#size=` で上書きする。
 *   - 検証用のサーバーはこの中で立てて、この中で閉じる。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DAILY_SLOTS, TABLE } = require('./build-roster.js');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* よくある3寸法。iPhone の実寸（CSS幅 × dpr）。 */
const SIZES = [
  { w: 1179, h: 2556, note: 'iPhone 14 Pro / 15 / 16' },
  { w: 1290, h: 2796, note: 'iPhone 14 Pro Max / 15 Plus・Pro Max / 16 Plus' },
  { w: 1170, h: 2532, note: 'iPhone 12 / 13 / 14' }
];

/* 起点。ここから何日目かで一枚が決まる。 */
const EPOCH = Date.UTC(2026, 7, 31);   // 2026-08-31

const CYCLE = DAILY_SLOTS.length * 10;   // 41枠 × 10段

function pickFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  const n = ((day % CYCLE) + CYCLE) % CYCLE;
  const id = DAILY_SLOTS[n % DAILY_SLOTS.length];
  const depth = 1 + (n % 10);
  const s = TABLE.spirits.find(x => x.id === id);
  return { day, n, id, depth, name: s ? s.name : id, sato: s ? s.sato : '', gogyo: s ? s.gogyo : '' };
}

function todayInJST() {
  const t = new Date(Date.now() + 9 * 3600 * 1000);   // 日付は日本時間で切る
  return t.toISOString().slice(0, 10);
}

async function main() {
  // puppeteer は焼くときだけ要る。お品書きを組むだけの scripts/daily-notes.js は
  // このファイルから寸法と巡りだけを借りるので、上で読み込まない。
  const puppeteer = require('puppeteer-core');
  const dateStr = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
    ? process.argv[2] : todayInJST();
  const outDir = process.argv[3] || path.join(ROOT, '.daily');
  const pick = pickFor(dateStr);

  console.log(`${dateStr}（起点から${pick.day}日目・巡り ${pick.n}/${CYCLE}）`);
  console.log(`  今日の一枚: ${pick.name}（${pick.sato}・${pick.gogyo}）／ 深さ ${String(pick.depth).padStart(2, '0')}`);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const server = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  fs.mkdirSync(outDir, { recursive: true });
  const made = [];
  try {
    for (const size of SIZES) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${base}#size=${size.w}x${size.h}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 60000 });

      const dataUrl = await page.evaluate(async (id, depth) => {
        // 画面と同じ道で選ぶ
        const btn = [...document.querySelectorAll('#pickBody button')]
          .find(b => b.dataset.id === id);
        if (!btn) throw new Error('札に ' + id + ' が無い');
        btn.click();
        document.querySelectorAll('#depth button')[depth - 1].click();
        const t0 = Date.now();
        while (document.getElementById('save').disabled) {
          if (Date.now() - t0 > 60000) throw new Error('焼き上がらない');
          await new Promise(r => setTimeout(r, 100));
        }
        const cv = document.getElementById('cv');
        if (cv.width !== window.__yojitate.W) throw new Error('寸法が合っていない');
        return cv.toDataURL('image/jpeg', 0.92);
      }, pick.id, pick.depth);

      if (errors.length) throw new Error('画面で例外: ' + errors.join(' / '));
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const name = `yo-jitate-${size.w}x${size.h}.jpg`;
      fs.writeFileSync(path.join(outDir, name), buf);
      made.push({ name, kb: Math.round(buf.length / 1024), note: size.note });
      console.log(`  ${name}  ${Math.round(buf.length / 1024)} KB  （${size.note}）`);
      await page.close();
    }

    // ショートカットが「今日は誰か」を読めるように、控えも1枚置く
    fs.writeFileSync(path.join(outDir, 'today.json'), JSON.stringify({
      date: dateStr, spirit: pick.id, name: pick.name,
      sato: pick.sato, gogyo: pick.gogyo, depth: pick.depth,
      files: made.map(m => m.name)
    }, null, 2) + '\n');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
  console.log(`\n置いた先: ${outDir}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { pickFor, SIZES, CYCLE };
