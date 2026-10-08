#!/bin/bash
# 夜じたて PV を組む。縦720×1280・30fps・約21秒・BGM入り（声と効果音は無い。この道具は音を鳴らさない）。
#   bash scripts/pv/assemble.sh
#
# 先に流すもの:
#   NODE_PATH=../shikifuda-kasane/node_modules node scripts/pv/capture-pv.js   … 画面の録り（src/cap/）
#   NODE_PATH=../shikifuda-kasane/node_modules node scripts/pv/make-cards.js   … 開きと締めのカード（src/*.png）
#   src/bgm.mp3 … 公式の楽曲『まつげの距離』（サスラのテーマソング B面）を手元に置く（リポジトリには入れない）
#     https://vibe.co.jp/luna-occulta/media/music/matsuge_no_kyori.mp3
#     （『かえりみちの唄 (Instrumental)』→ A面『Punto di fuga』→ B面。2026-10-09 オーナー裁定）
#
# 構成: 開きのカード 1.9秒 → 画面の録り（開幕 → マミが01から10へ顕れる → トバリ・ゴコウ・サスラ）→ 締めのカード 3.4秒
# つなぎは 0.4秒の溶かし。曲は頭の無音を飛ばして最初の音から敷き、終わりへ 1.8秒で沈める。
set -e
cd "$(dirname "$0")"
SRC=src; OUT=out; mkdir -p "$OUT"
for f in cap/list.txt intro.png end.png bgm.mp3; do [ -f "$SRC/$f" ] || { echo "✗ $SRC/$f が無い"; exit 1; }; done

INTRO=1.9; END=3.4; X=0.4
ffmpeg -y -v error -f concat -safe 0 -i "$SRC/cap/list.txt" -vf "fps=30,scale=720:1280:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 16 -an "$SRC/cap.mp4"
CAP=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC/cap.mp4")
TOTAL=$(python3 -c "print(round($INTRO+$CAP+$END-2*$X,3))")
O1=$(python3 -c "print($INTRO-$X)")
O2=$(python3 -c "print(round($INTRO+$CAP-2*$X,3))")
# 曲の最初の音（-45dB を越える所）の少し手前から
HEAD=$(ffmpeg -hide_banner -i "$SRC/bgm.mp3" -af silencedetect=noise=-45dB:d=0.2 -t 20 -f null - 2>&1 | sed -n 's/.*silence_end: \([0-9.]*\).*/\1/p' | head -1)
HEAD=$(python3 -c "print(max(0, float('${HEAD:-0}')-0.05))")
FO=$(python3 -c "print(round($TOTAL-1.8,3))")

ffmpeg -y -v error \
  -loop 1 -t $INTRO -r 30 -i "$SRC/intro.png" \
  -i "$SRC/cap.mp4" \
  -loop 1 -t $END -r 30 -i "$SRC/end.png" \
  -ss $HEAD -t $TOTAL -i "$SRC/bgm.mp3" \
  -filter_complex "
    [0:v]format=yuv420p,fps=30,settb=1/30,fade=t=in:st=0:d=0.5,setsar=1[a];
    [1:v]format=yuv420p,fps=30,settb=1/30,setsar=1[b];
    [2:v]format=yuv420p,fps=30,settb=1/30,setsar=1[c];
    [a][b]xfade=transition=fade:duration=$X:offset=$O1[ab];
    [ab][c]xfade=transition=fade:duration=$X:offset=$O2,fade=t=out:st=$(python3 -c "print($TOTAL-0.5)"):d=0.5[v];
    [3:a]afade=t=in:st=0:d=0.15,afade=t=out:st=$FO:d=1.8,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo[au]" \
  -map "[v]" -map "[au]" -t $TOTAL -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -movflags +faststart "$OUT/yo-jitate-pv.mp4"

echo "✓ $OUT/yo-jitate-pv.mp4"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$OUT/yo-jitate-pv.mp4" | tr '\n' ' '; echo
echo "  曲の頭: ${HEAD}秒から／尺 ${TOTAL}秒"
