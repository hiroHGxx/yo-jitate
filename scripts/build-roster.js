/* 名簿（33柱）と札絵の在り処（330枚）を index.html へ焼き込む。
 *
 *   node scripts/build-roster.js          … index.html の ROSTER 区画を書き換える
 *   node scripts/build-roster.js --check  … 書き換えず、今の index.html と一致するかだけ見る
 *
 * なぜ生成にするか:
 *   素材蔵の札絵URLは **組み立てられない**。径路が4系統（/fuda/・/fuda/v2/・/fuda/v3/・/fuda/app/）に
 *   分かれているうえ、ファイル名にも `_v2` `_v3` の変種があり、**同じ御霊の10枚の中で型が混ざる**
 *   （aun・karura・naruka・oen・orochi・rotton の6柱）。
 *   よって台帳（scripts/fuda-ledger.json）の url を一字も変えずに写す。手で編まない。
 *
 * 台帳の作り直し方（素材が増えたとき）:
 *   公式MCP kitan-lore の list_assets(kind=fuda) を cursor で全頁ぶん引き直し、
 *   fuda-ledger.json を差し替えてから、このスクリプトを流す。
 *   柱が増えたら spirits-table.json と下の CANON_ORDER にも足す。顔アイコンが公式にまだ無い柱は
 *   FACE_CROPS に切り出しの場所を書く（2026-10-09・トバリ／ゴコウ／マミ／サスラで初めて要った）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEDGER = JSON.parse(fs.readFileSync(path.join(__dirname, 'fuda-ledger.json'), 'utf8'));
const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'spirits-table.json'), 'utf8'));

/* 公式MCP list_spirits が返す並び（＝正典の並び）から、札絵を持つ33柱だけを抜いたもの。
   五十音順でもローマ字順でもなく、この並びが公式の見せ方。画面もこの順に出す。 */
const CANON_ORDER = [
  'sakuya', 'oto', 'nemu', 'izuna', 'uka', 'anne', 'yui', 'shion', 'xiaolan', 'torika',
  'benten', 'karma', 'nekomata', 'shiba', 'naruka', 'atoza', 'aun', 'hinanojo', 'janome', 'orochi',
  'emma', 'rotton', 'oen', 'dan', 'kohaku', 'karura', 'tart', 'magoichi', 'shinra',
  'tobari', 'gokou', 'mami', 'sasura'
];

/* 顔アイコンが公式にまだ無い柱（canon/<id>_icon.webp が 404）。札絵から顔を切り出して代わりにする。
   [段, 顔の中心x（幅に対する比）, 顔の中心y（高さに対する比）, 切り出す正方形の一辺（幅に対する比）]
   01段は下絵で顔が判らないので、顔がはっきり出る10段から取る。
   **切り出しは開いた人のブラウザの中でやる。**切った絵をこのリポジトリに置かない（原本を持たない芯のまま）。
   公式の顔アイコンが出たら、その柱をここから消すだけで元の道（ICON）に戻る。 */
const FACE_CROPS = {
  tobari: [10, 0.47, 0.205, 0.27],
  gokou:  [10, 0.48, 0.165, 0.24],
  mami:   [10, 0.49, 0.30,  0.38],
  sasura: [10, 0.48, 0.225, 0.22]
};

/* 毎朝の一枚の巡り（scripts/daily.js が使う）。
   新しく来た柱がよく出るように、重みを付ける（2026-10-09 オーナー裁定）。
   FEATURED の柱は巡りの中に FEATURED_WEIGHT 回、ほかの柱は1回ずつ入る。
   重み付きの柱は巡りの中へ等間隔に散らす（隣り合わない＝毎日ちがう御霊になる性質を保つ）。
   **巡りの長さは10と互いに素でなければならない**（深さ10段と噛み合って、全部の段を通るため）。 */
const FEATURED = ['tobari', 'gokou', 'mami', 'sasura'];
const FEATURED_WEIGHT = 3;
const DAILY_SLOTS = (function () {
  const base = CANON_ORDER.filter(id => !FEATURED.includes(id));
  const extra = FEATURED.length * FEATURED_WEIGHT;
  const len = base.length + extra;
  const slots = [];
  let j = 0, k = 0;
  for (let i = 0; i < len; i++) {
    if (Math.floor((i + 1) * extra / len) > Math.floor(i * extra / len)) slots.push(FEATURED[k++ % FEATURED.length]);
    else slots.push(base[j++]);
  }
  return slots;
})();

/* 里の出し方の順。公式の並びの中での初出順と同じ。 */
const SATO_ORDER = ['甲賀', '伊賀', '雑賀', '風魔', '根の国'];

const KURA = 'https://kura.vibe.co.jp/fuda/';
const ICON = 'https://vibe.co.jp/luna-occulta/media/img/canon/';

function die(msg) { console.error('✗ ' + msg); process.exit(1); }

/* このファイルを require したときは、並びと表を渡すだけで何も書き換えない
   （scripts/daily.js が「今日の一枚」を決めるのに使う）。 */
module.exports = { CANON_ORDER, SATO_ORDER, TABLE, LEDGER, FACE_CROPS, FEATURED, FEATURED_WEIGHT, DAILY_SLOTS };
if (require.main !== module) return;

/* ---- 突き合わせ（生成の前に、台帳と表が食い違っていないかを見る） ---- */
const byId = new Map(TABLE.spirits.map(s => [s.id, s]));
const N = CANON_ORDER.length;
if (byId.size !== N) die(`spirits-table.json が${N}柱ではない（${byId.size}柱）`);

const orderSet = new Set(CANON_ORDER);
if (orderSet.size !== CANON_ORDER.length) die('CANON_ORDER に重複がある');
for (const id of CANON_ORDER) if (!byId.has(id)) die(`CANON_ORDER の ${id} が表に無い`);
for (const id of byId.keys()) if (!orderSet.has(id)) die(`表の ${id} が CANON_ORDER に無い`);

const fuda = new Map();
for (const a of LEDGER.assets) {
  if (!a.url.startsWith(KURA)) die(`台帳に素材蔵の外のURLがある: ${a.url}`);
  if (!byId.has(a.char)) die(`台帳の ${a.char} が表に無い`);
  if (!(a.rank >= 1 && a.rank <= 10)) die(`段が範囲外: ${a.id}`);
  if (!fuda.has(a.char)) fuda.set(a.char, new Array(10).fill(null));
  const slot = fuda.get(a.char);
  if (slot[a.rank - 1]) die(`段が重複: ${a.id}`);
  slot[a.rank - 1] = a.url.slice(KURA.length);   // 径路つきの残り。組み立てない
}
if (fuda.size !== N) die(`台帳の御霊が${N}柱ではない（${fuda.size}柱）`);
for (const [id, slot] of fuda) {
  const missing = slot.map((v, i) => v ? null : i + 1).filter(Boolean);
  if (missing.length) die(`${id} の段が欠けている: ${missing.join(',')}`);
}

for (const id of Object.keys(FACE_CROPS)) {
  if (!byId.has(id)) die(`FACE_CROPS の ${id} が表に無い`);
  const [rank, cx, cy, side] = FACE_CROPS[id];
  if (!(rank >= 1 && rank <= 10)) die(`FACE_CROPS の段が範囲外: ${id}`);
  // 札絵は 2:3。正方形が絵の外へはみ出すと、顔の脇に透明な帯が出る
  if (cx - side / 2 < 0 || cx + side / 2 > 1 || cy - side / 3 < 0 || cy + side / 3 > 1) die(`FACE_CROPS が絵の外にはみ出す: ${id}`);
}
for (const id of FEATURED) if (!byId.has(id)) die(`FEATURED の ${id} が表に無い`);
if (new Set(DAILY_SLOTS).size !== N) die('毎朝の巡りに出てこない柱がいる');
{
  const g = (a, b) => b ? g(b, a % b) : a;
  if (g(DAILY_SLOTS.length, 10) !== 1) die(`毎朝の巡りの長さ ${DAILY_SLOTS.length} が10と互いに素でない（通らない段が出る）`);
  DAILY_SLOTS.forEach((id, i) => {
    if (id === DAILY_SLOTS[(i + 1) % DAILY_SLOTS.length]) die(`毎朝の巡りで ${id} が二日つづく`);
  });
}

/* ---- 焼き込む文字列を組む ---- */
const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const spiritLines = CANON_ORDER.map(id => {
  const s = byId.get(id);
  if (!SATO_ORDER.includes(s.sato)) die(`知らない里: ${s.sato}（${id}）`);
  return `    {id:${q(id)},name:${q(s.name)},kana:${q(s.kana)},sato:${q(s.sato)},gogyo:${q(s.gogyo)}}`;
}).join(',\n');

const fudaLines = CANON_ORDER.map(id =>
  `    ${id}:[${fuda.get(id).map(q).join(',')}]`
).join(',\n');

const faceLines = Object.keys(FACE_CROPS).map(id =>
  `    ${id}:[${FACE_CROPS[id].join(',')}]`
).join(',\n');

const block = `  /* ここから ROSTER 区画。scripts/build-roster.js が生成する。手で書き換えない。
     並びは公式MCP list_spirits の順（＝正典の並び）。里は ${SATO_ORDER.join('→')} の順に出す。 */
  var KURA = ${q(KURA)};
  var ICON = ${q(ICON)};
  var SATO_ORDER = [${SATO_ORDER.map(q).join(',')}];
  var SPIRITS = [
${spiritLines}
  ];
  /* 札絵の在り処。素材蔵の台帳（scripts/fuda-ledger.json）の url をそのまま写したもの。
     径路が4系統に分かれ、ファイル名にも変種があり、同じ御霊の10枚で型が混ざる柱もある。
     **パスを組み立てないこと。** ここの文字列に KURA を前置するだけで使う。 */
  var FUDA = {
${fudaLines}
  };
  /* 顔アイコンが公式にまだ無い柱。札絵から顔を切り出して代わりにする。
     [段, 中心x, 中心y, 一辺]（x と一辺は絵の幅、y は絵の高さに対する比）。 */
  var FACE = {
${faceLines}
  };`;

/* ---- index.html へ差し込む ---- */
const HTML = path.join(ROOT, 'index.html');
const BEGIN = '  /* ROSTER:BEGIN */';
const END = '  /* ROSTER:END */';
let html = fs.readFileSync(HTML, 'utf8');
const i = html.indexOf(BEGIN), j = html.indexOf(END);
if (i < 0 || j < 0 || j < i) die('index.html に ROSTER:BEGIN / ROSTER:END の目印が無い');

const next = html.slice(0, i + BEGIN.length) + '\n' + block + '\n' + html.slice(j);

if (process.argv.includes('--check')) {
  if (next === html) { console.log(`✓ ROSTER 区画は台帳と一致している（${N}柱・${LEDGER.assets.length}枚）`); process.exit(0); }
  die('ROSTER 区画が台帳と食い違っている。node scripts/build-roster.js で焼き直すこと');
}

fs.writeFileSync(HTML, next);
const totals = {};
for (const [, slot] of fuda) for (const p of slot) {
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '(直下)';
  totals[dir] = (totals[dir] || 0) + 1;
}
console.log(`✓ ${N}柱 / ${LEDGER.assets.length}枚 を index.html に焼いた`);
console.log('  径路の内訳: ' + Object.entries(totals).map(([k, v]) => `${k} ${v}枚`).join(' / '));
