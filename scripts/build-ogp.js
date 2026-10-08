/* OGP画像（2400×1200）を焼く。
 *
 *   NODE_PATH=../shikifuda-kasane/node_modules node scripts/build-ogp.js
 *
 * 中身は**この道具が実際に出す絵**そのもの。宣伝用に別のものを描かない。
 * 額装した端末を3つ並べ、深さの幅（暗い・極彩色・淡い）と、選べることを一目で見せる。
 *
 * 御霊を1柱だけ出すと、それが道具の顔になってしまう（33柱いる意味が消える）。
 * だから3柱。並べたのは深さの幅を見せるためで、推しの序列ではない。
 *
 * 罠:
 *   - ヘッドレスChromeの `screen.width` はOSの画面を返す。寸法は `#size=` で上書きする。
 *   - 明朝体は macOS の Hiragino に依存する。**これはCIで焼かない**（手元で焼いて置くもの）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 2400, H = 1200;
const PHONE = { w: 1179, h: 2556 };

/* 並べる3枚。深さの幅が出る組み合わせを選ぶ */
/* 2026-10-09: 新しく来た4柱から3柱へ入れ替えた（それまでは 紫苑03／孫市10／エマ09）。
   端末3つの幅は題字の右にちょうど収まる寸法で、4つは入らない。サスラが外れたのは幅の都合。 */
const PICKS = [
  { id: 'tobari', depth: 3  },   // モノクロの完成画
  { id: 'mami',   depth: 10 },   // 極彩色の決め絵
  { id: 'gokou',  depth: 6  }    // 青い夜・動きのある絵
];

async function main() {
  const puppeteer = require('puppeteer-core');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const server = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });

  try {
    /* ---- ① 額装した3枚を、道具そのものから取る ---- */
    const shots = [];
    for (const p of PICKS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${base}#size=${PHONE.w}x${PHONE.h}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 60000 });
      const url = await page.evaluate(async (id, depth) => {
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
        return document.getElementById('cv').toDataURL('image/jpeg', 0.95);
      }, p.id, p.depth);
      shots.push(url);
      console.log(`  取った: ${p.id} 深さ${String(p.depth).padStart(2, '0')}`);
      await page.close();
    }

    /* ---- ② 台紙に組む ---- */
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 600, deviceScaleFactor: 1 });
    await page.goto('about:blank');
    const dataUrl = await page.evaluate(async (W, H, PHONE, shots) => {
      await document.fonts.ready;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');

      // 地 — 宵闇藍の二色一組。統合しない。純黒は使わない
      const bg = g.createLinearGradient(0, 0, W * 0.6, H);
      bg.addColorStop(0,    '#131320');
      bg.addColorStop(0.58, '#1B1B2E');
      bg.addColorStop(1,    '#131320');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // 端末を3つ。羽二重＝縁を描かず、影で浮かせる
      const ph = 980;
      const pw = Math.round(ph * PHONE.w / PHONE.h);
      const gap = 46;
      const total = pw * 3 + gap * 2;
      const x0 = W - 132 - total;
      const y0 = Math.round((H - ph) / 2);

      const imgs = await Promise.all(shots.map(u => new Promise(res => {
        const i = new Image(); i.onload = () => res(i); i.src = u;
      })));

      imgs.forEach((img, k) => {
        const x = x0 + k * (pw + gap);
        g.save();
        g.shadowColor = 'rgba(0,0,0,.62)';
        g.shadowBlur = 46;
        g.shadowOffsetY = 16;
        g.beginPath();
        g.roundRect(x, y0, pw, ph, 22);
        g.fill();                       // 影を落とすためだけの塗り
        g.restore();
        g.save();
        g.beginPath();
        g.roundRect(x, y0, pw, ph, 22);
        g.clip();
        g.drawImage(img, x, y0, pw, ph);
        g.restore();
      });

      // 題と一行
      const L = 132;
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#D9A94C';
      g.font = '150px "Hiragino Mincho ProN", "Yu Mincho", serif';
      g.fillText('夜じたて', L, 552);

      g.fillStyle = '#E8E4D8';
      g.font = '46px "Hiragino Mincho ProN", "Yu Mincho", serif';
      g.fillText('札絵を、その端末の夜に', L, 664);
      g.fillText('合わせて額装します。', L, 730);

      g.fillStyle = '#9D93B5';
      g.font = '38px system-ui, sans-serif';
      g.fillText('33柱 × 顕れの深さ10段', L, 828);
      g.font = '32px system-ui, sans-serif';
      g.fillText('月蝕綺譚 -Luna Occulta- 二次創作', L, 890);

      // 写真的な中身なので JPEG のほうが桁で軽い（PNGだと2.6MB・JPEGなら数百KB）
      return cv.toDataURL('image/jpeg', 0.92);
    }, W, H, PHONE, shots);

    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(ROOT, 'ogp.jpg'), buf);
    console.log(`✓ ogp.jpg  ${W}×${H}  ${Math.round(buf.length / 1024)} KB`);
    await page.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
