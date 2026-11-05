const { chromium } = require('playwright'); const fs = require('fs'); const d = '/mnt/project-files/patches/2.22.0-anime-comic/anime/';
const u = (n) => `data:image/svg+xml;base64,${fs.readFileSync(d + n).toString('base64')}`;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (html, out, transparent) => { await p.setContent(`<body style="margin:0;background:${transparent ? 'transparent' : '#0a0410'}">${html}</body>`); await p.waitForTimeout(400); await p.screenshot({ path: out, omitBackground: !!transparent }); };
  const L = (n, extra = '') => `<div style="position:fixed;inset:0;background:url(${u(n)}) center bottom/cover no-repeat;${extra}"></div>`;
  // back: sky + far city, darkened like the old shade so it reads behind text
  await shot(L('sky.svg') + L('far.svg') + '<div style="position:fixed;inset:0;background:linear-gradient(180deg,rgba(10,4,16,.3),rgba(10,4,16,.55) 40%,rgba(10,4,16,.78) 75%,rgba(10,4,16,.92))"></div>', '/tmp/claude-0/out/back.png');
  await shot(L('near.svg', 'filter:brightness(.55)'), '/tmp/claude-0/out/near.png', true);
  await b.close(); })();
