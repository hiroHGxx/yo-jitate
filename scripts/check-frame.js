/* 額装そのものを測る。画面ではなく、書き出される一枚の中身を見る。
 *
 *   NODE_PATH=../shikifuda-kasane/node_modules node scripts/check-frame.js [比較したいHTMLのパス]
 *   （puppeteer-core は既存作から借りる。この作品には入れない）
 *
 * 見るもの:
 *   1 上端の継ぎ目   絵と地の境で、行から行への明るさが跳ねていないか（第2便の主題）
 *   2 下端の溶かし   同じく足元の境
 *   3 蝕環の置き所   円の下端が釦の帯（下12%）に触れていないか
 *   4 書き出しの重さ PNG と JPEG を並べる
 *
 * 継ぎ目を目で判定しない。**行ごとの平均輝度の差**で見る。
 * 境目が線に見えるのは、そこで差が1行だけ跳ねているから。跳ねが地のゆらぎに埋もれれば消えている。
 *
 * 罠:
 *   - ヘッドレスChromeの `screen.width` はOSの画面を返す。額装の寸法は `#size=` で上書きして測る。
 *   - 検証用のサーバーはこの中で立てて、この中で閉じる。
 */
'use strict';
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '..', '.frame-check');
const SIZE = { w: 1179, h: 2556 };            // iPhone 15/16 の実寸
const SPIRIT = process.env.SPIRIT || 'sakuya';
const DEPTH = Number(process.env.DEPTH || 5);   // SPIRIT=orochi DEPTH=9 で切り替えて測れる

let failures = 0;
const ok = (l, n) => console.log(`  ✓ ${l}${n ? '  ' + n : ''}`);
const ng = (l, n) => { failures++; console.log(`  ✗ ${l}${n ? '  ' + n : ''}`); };
const judge = (c, l, n) => (c ? ok : ng)(l, n);

/* 1行ぶんの平均輝度を、絵の幅の中央80%で取る。端は溶かしの影響を受けにくいので中央だけ見る */
const PROBE = `(() => {
  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // 絵の置き所（実装と同じ式。__yojitate があればそれを使う）
  const d = window.__yojitate;
  const drawH = d ? d.drawH : W * 1.5;
  const bottom = d ? d.bottom : H * 0.94;
  const top = d ? d.top : bottom - drawH;
  const x0 = Math.round(W * 0.10), x1 = Math.round(W * 0.90);
  const band = g.getImageData(x0, 0, x1 - x0, H).data;
  const wpx = x1 - x0;
  const lum = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < wpx; x++) {
      const i = (y * wpx + x) * 4;
      s += 0.2126 * band[i] + 0.7152 * band[i+1] + 0.0722 * band[i+2];
    }
    lum[y] = s / wpx;
  }
  const diff = y => Math.abs(lum[y] - lum[y-1]);
  const windowMax = (a, b) => { let m = 0, at = a; for (let y = Math.max(1,a); y <= b; y++) { const v = diff(y); if (v > m) { m = v; at = y; } } return {max:m, at}; };
  const pct = (a, b, p) => {
    const arr = []; for (let y = Math.max(1,a); y <= b; y++) arr.push(diff(y));
    arr.sort((x, z) => x - z); return arr[Math.floor(arr.length * p)] || 0;
  };
  const T = Math.round(top), B = Math.round(bottom);
  return {
    top: T, bottom: B, H, W,
    seamTop: windowMax(T - 6, T + 6),                 // 境目のすぐ際
    groundNoise: pct(Math.max(1, T - 260), T - 30, 0.99),  // 地だけの区間のゆらぎ（99%点）
    artNoise: pct(T + 40, T + 300, 0.99),             // 絵の中のゆらぎ（99%点）
    seamFoot: windowMax(B - 6, B + 6),
    footNoise: pct(B + 20, Math.min(H - 2, B + 120), 0.99),
    ring: d ? d.ring : null,
    buttonBand: d ? d.buttonBand : H * 0.88
  };
})()`;

async function measure(html, label) {
  const server = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${base}#size=${SIZE.w}x${SIZE.h}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('save').disabled, { timeout: 40000 });
    // 御霊と深さを固定して、前後で同じ一枚を比べる
    await page.evaluate(async (id, depth) => {
      const btn = [...document.querySelectorAll('#pickBody button')]
        .find(b => b.dataset.id === id);
      if (btn) btn.click();
      document.querySelectorAll('#depth button')[depth - 1].click();
      const t0 = Date.now();
      while (document.getElementById('save').disabled) {
        if (Date.now() - t0 > 40000) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }, SPIRIT, DEPTH);

    const m = await page.evaluate(PROBE);

    // 蝕環だけを透明な板に引いて、釦の帯に絵の具が乗っていないかを測る
    m.ringPaint = await page.evaluate(() => {
      const d = window.__yojitate;
      if (!d || !d.paintRing) return null;
      const c = document.createElement('canvas');
      c.width = d.W; c.height = d.H;
      const g = c.getContext('2d');
      d.paintRing(g);
      const band = Math.round(d.buttonBand);
      const read = (y0, y1) => {
        const px = g.getImageData(0, y0, d.W, y1 - y0).data;
        let mx = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > mx) mx = px[i];
        return mx;
      };
      return { maxAlphaInBand: read(band, d.H), maxAlphaAbove: read(band - 120, band) };
    });

    // 書き出しの重さ
    m.bytes = await page.evaluate(async () => {
      const cv = document.getElementById('cv');
      const size = t => new Promise(r => cv.toBlob(b => r(b ? b.size : -1), t.type, t.q));
      return {
        png:  await size({ type: 'image/png' }),
        j92:  await size({ type: 'image/jpeg', q: 0.92 }),
        j85:  await size({ type: 'image/jpeg', q: 0.85 })
      };
    });

    // 目でも見られるように、境目まわりと足元を切り出す
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, y, h] of [['head', m.top - 120, 360], ['foot', m.bottom - 420, 560]]) {
      const buf = await page.evaluate((y, h) => {
        const cv = document.getElementById('cv');
        const c = document.createElement('canvas');
        c.width = cv.width; c.height = h;
        c.getContext('2d').drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
        return c.toDataURL('image/png');
      }, Math.max(0, Math.round(y)), Math.round(h));
      fs.writeFileSync(path.join(OUT, `${label}-${name}.png`),
        Buffer.from(buf.split(',')[1], 'base64'));
    }
    return m;
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

(async () => {
  const nowHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const beforePath = process.argv[2];
  const before = beforePath ? await measure(fs.readFileSync(beforePath, 'utf8'), 'before') : null;
  const after = await measure(nowHtml, 'after');

  const line = (m, tag) => {
    console.log(`\n【${tag}】`);
    console.log(`  上端の境目 y=${m.top}  1行の跳ね ${m.seamTop.max.toFixed(2)}（y=${m.seamTop.at}）`);
    console.log(`     地のゆらぎ(99%点) ${m.groundNoise.toFixed(2)} / 絵の中のゆらぎ(99%点) ${m.artNoise.toFixed(2)}`);
    console.log(`  下端の境目 y=${m.bottom}  1行の跳ね ${m.seamFoot.max.toFixed(2)}  地のゆらぎ ${m.footNoise.toFixed(2)}`);
    console.log(`  書き出し  PNG ${(m.bytes.png/1048576).toFixed(2)}MB / JPEG92 ${(m.bytes.j92/1048576).toFixed(2)}MB / JPEG85 ${(m.bytes.j85/1048576).toFixed(2)}MB`);
    if (m.ring) console.log(`  蝕環  中心y=${m.ring.cy.toFixed(0)} 半径=${m.ring.r.toFixed(0)} 下端=${m.ring.bottom.toFixed(0)} / 釦の帯の上端=${m.buttonBand.toFixed(0)}`);
  };

  if (before) line(before, '第1便まで（比較用）');
  line(after, 'いま');

  console.log('\n【判定】');
  // 継ぎ目: 境目の跳ねが「地のゆらぎ」に埋もれていれば、線としては見えない
  judge(after.seamTop.max <= Math.max(1.0, after.groundNoise * 1.5),
    '上端の境目に跳ねが無い',
    `跳ね ${after.seamTop.max.toFixed(2)} ≦ 地のゆらぎ×1.5 = ${(after.groundNoise*1.5).toFixed(2)}`);
  judge(after.seamFoot.max <= Math.max(1.0, after.footNoise * 1.5),
    '下端の境目に跳ねが無い',
    `跳ね ${after.seamFoot.max.toFixed(2)} ≦ ${(after.footNoise*1.5).toFixed(2)}`);
  if (before) {
    const r = before.seamTop.max / Math.max(0.01, after.seamTop.max);
    judge(after.seamTop.max < before.seamTop.max,
      '上端の跳ねが第1便より小さい',
      `${before.seamTop.max.toFixed(2)} → ${after.seamTop.max.toFixed(2)}（${r.toFixed(1)}分の1）`);
  }
  // 蝕環は帯より下まで円としては伸びている。切って消すのではなく溶かして消すので、
  // 幾何ではなく**実際に乗った絵の具**で見る（帯の中の最大不透明度が 0 か）。
  judge(after.ringPaint && after.ringPaint.maxAlphaInBand === 0,
    '釦の帯に蝕環の絵の具が乗っていない',
    after.ringPaint
      ? `帯の中の最大不透明度 ${after.ringPaint.maxAlphaInBand} / 帯のすぐ上では ${after.ringPaint.maxAlphaAbove}`
      : '__yojitate.paintRing が無い');
  judge(after.ring && after.ring.fadeEnd <= after.buttonBand,
    '蝕環の溶かし終わりが帯の上端以内',
    after.ring ? `溶かし終わり ${after.ring.fadeEnd.toFixed(0)} ≦ 帯の上端 ${after.buttonBand.toFixed(0)}` : '-');

  console.log(`\n切り出した画像: ${OUT}`);
  console.log(failures === 0 ? '通った。' : `落ちた項目が ${failures} 件ある。`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
