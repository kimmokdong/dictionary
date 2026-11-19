// 조판 결과를 브라우저에서 눈으로 확인하는 미리보기 HTML을 만든다.
// 사용: node scripts/data/preview.mjs normal 1 2 301  → data/build/preview.html
import fs from 'node:fs';
const [size = 'normal', ...nums] = process.argv.slice(2);
const index = JSON.parse(fs.readFileSync(`data/build/${size}/index.json`, 'utf8'));
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const page = (n) => {
  const chunk = String(Math.floor((n - 1) / index.pagesPerChunk)).padStart(4, '0');
  return JSON.parse(fs.readFileSync(`data/build/${size}/pages-${chunk}.json`, 'utf8')).find((p) => p.n === n);
};
const css = Object.entries(index.kinds).map(([k, v]) =>
  `.k-${k}{font-weight:${v.font === 'bold' ? 700 : 400};font-size:${v.scale}em}`).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>조판 미리보기</title><style>
@font-face{font-family:P;font-weight:400;src:url(../../assets/fonts/Pretendard-Regular.woff2)}
@font-face{font-family:P;font-weight:700;src:url(../../assets/fonts/Pretendard-Bold.woff2)}
body{background:#888;display:flex;flex-wrap:wrap;gap:16px;margin:16px}
.page{background:#fbf7ea;padding:36px 30px 28px;font:${index.fontSize}px/${index.lineHeight}px P;font-kerning:none;color:#222}
.guide{display:flex;justify-content:space-between;font-weight:700;border-bottom:1px solid #999;margin:-24px 0 8px;font-size:14px;line-height:20px}
.body{width:${index.textWidth}px;height:${index.textHeight}px;outline:1px dashed #c88}
.line{white-space:pre;height:${index.lineHeight}px;width:max-content}
.line.i{margin-left:${index.indent}px}.line.g{margin-top:${index.entryGap}px}
.k-s{vertical-align:super}.k-p,.k-l{color:#666}.k-x,.k-r{color:#555}.k-l{border:1px solid #999;border-radius:3px;padding:0 2px}
${css}</style>
${nums.map(Number).map(page).map((p) => `<div class="page"><div class="guide"><span>${esc(p.g[0])}</span><span>${p.n}</span><span>${esc(p.g[1])}</span></div><div class="body">${
  p.l.map((l) => `<div class="line${l.i ? ' i' : ''}${l.g ? ' g' : ''}">${l.r.map(([k, t]) => `<span class="k-${k}">${esc(t)}</span>`).join('')}</div>`).join('')
}</div></div>`).join('\n')}
<script>
document.fonts.ready.then(() => {
  let over = 0, max = 0;
  for (const el of document.querySelectorAll('.line')) {
    const w = el.getBoundingClientRect().width + (el.classList.contains('i') ? ${index.indent} : 0);
    max = Math.max(max, w); if (w > ${index.textWidth}) { over++; el.style.background = '#f99'; }
  }
  document.title = 'over=' + over + ' max=' + max.toFixed(1);
});
</script>`;
fs.writeFileSync('data/build/preview.html', html);
