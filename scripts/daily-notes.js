/* Release の説明文（今日の一枚のお品書き）を組む。
 *
 *   node scripts/daily-notes.js .daily/today.json > .daily/notes.md
 *
 * 文面をワークフローの YAML に埋め込まない。引用符と改行がシェルを通るたびに壊れるので、
 * 文章はこちら側に置く。
 */
'use strict';
const fs = require('fs');
const { SIZES } = require('./daily.js');

const t = JSON.parse(fs.readFileSync(process.argv[2] || '.daily/today.json', 'utf8'));
const depth = String(t.depth).padStart(2, '0');
const REPO = 'https://github.com/hiroHGxx/yo-jitate';

const rows = SIZES.map(s =>
  `| ${s.note} | \`yo-jitate-${s.w}x${s.h}.jpg\` |`).join('\n');

process.stdout.write(`**${t.date} の一枚 — ${t.name}（${t.sato}・${t.gogyo}）／ 顕れの深さ ${depth}**

夜じたてが毎朝ひとつだけ焼く、額装済みの一枚です。
**日付から一意に決まります**（乱数は使いません。33柱 × 10段を410日で一巡し、御霊も深さも毎日変わります。新しく来た4柱は多めに巡ってきます）。

| 端末 | ファイル |
|---|---|
${rows}

固定URLなので、ショートカットから毎朝そのまま取りにこられます。

\`\`\`
${REPO}/releases/download/daily/yo-jitate-1179x2556.jpg
\`\`\`

手順は [docs/SHORTCUT.md](${REPO}/blob/main/docs/SHORTCUT.md) に。

---

これは『月蝕綺譚 -Luna Occulta-』の**二次創作物**であり、公式とは関係ありません。
配っているのは**額装した一枚**であって、公式の札絵の原本ではありません。
原本は素材蔵（\`kura.vibe.co.jp\`）にあり、このリポジトリには1枚も置いていません。
`);
