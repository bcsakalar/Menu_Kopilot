// Renders every test menu (menus.mjs) to a JPEG "photo" with headless Chrome — no Python/Pillow needed, only the
// Chrome that is already installed and the fonts Windows ships (Ink Free / Segoe Print for handwriting).
//
// Five looks, assigned per menu in menus.mjs:
//   baski    clean printed menu
//   defter   handwritten on lined notebook paper, slightly rotated
//   tahta    chalk on a blackboard
//   bulanik  printed menu, out-of-focus phone photo (blur + low contrast + vignette)
//   egik     printed menu shot at an angle, low resolution, heavy JPEG compression
//
// usage (repo root): node tests/ai_eval/render-images.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MENUS } from './menus.mjs';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = resolve('tests/ai_eval/images');
const PORT = 9333;

/** width, height and JPEG quality per look — "egik" is rendered small on purpose: that IS the low resolution. */
const LOOK = {
  baski: { width: 1080, height: 1440, quality: 82 },
  defter: { width: 1080, height: 1440, quality: 78 },
  tahta: { width: 1080, height: 1440, quality: 78 },
  bulanik: { width: 1080, height: 1440, quality: 60 },
  egik: { width: 600, height: 800, quality: 38 },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function rows(menu, cls = 'row') {
  return menu.sections
    .map(
      (s) =>
        `<div class="sec">${esc(s.title)}</div>` +
        s.items.map(([n, p]) => `<div class="${cls}"><span>${esc(n)}</span><span class="dots"></span><span class="p">${esc(p)}</span></div>`).join(''),
    )
    .join('');
}

function html(menu) {
  const base = `html,body{margin:0;overflow:hidden}`;
  switch (menu.style) {
    case 'baski':
      return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1080px;height:1440px;background:#e9e4d8;font-family:'Segoe UI',Calibri,sans-serif}
.card{position:absolute;inset:60px 70px;background:#fffdf7;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:70px 80px}
h1{margin:0 0 8px;font:700 64px Georgia,serif;color:#2b1d12;text-align:center}
.sub{text-align:center;color:#7a5a3a;font-size:26px;margin-bottom:30px;letter-spacing:3px}
.sec{font-weight:700;font-size:34px;color:#8a2d12;margin:34px 0 10px;border-bottom:2px solid #d8c9b0;padding-bottom:6px;letter-spacing:2px}
.row{display:flex;align-items:baseline;font-size:36px;color:#222;margin:10px 0}.dots{flex:1;border-bottom:3px dotted #bbb;margin:0 12px}.p{font-weight:600}
</style><div class="card"><h1>${esc(menu.restaurant)}</h1><div class="sub">— MENÜ —</div>${rows(menu)}</div>`;
    case 'defter':
      return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1080px;height:1440px;background:repeating-linear-gradient(92deg,#6b4428 0 14px,#5f3b22 14px 22px,#714a2c 22px 40px)}
.paper{position:absolute;left:70px;top:60px;width:930px;height:1320px;transform:rotate(-1.8deg);
background:linear-gradient(90deg,transparent 118px,rgba(220,70,70,.55) 118px 121px,transparent 121px),repeating-linear-gradient(180deg,transparent 0 45px,rgba(80,130,200,.35) 45px 46px),#fbf8ee;box-shadow:0 18px 40px rgba(0,0,0,.45);padding:40px 60px 0 150px;box-sizing:border-box;font-family:'Ink Free','Segoe Print',cursive;color:#1c2f6b}
h1{margin:0 0 20px;font-size:62px;color:#111;font-family:'Segoe Print','Ink Free',cursive}
.sec{font-size:40px;color:#111;text-decoration:underline;margin:26px 0 6px}
.row{display:flex;align-items:baseline;font-size:40px;line-height:46px;margin:2px 0}.dots{flex:1}.p{margin-left:20px}
.row:nth-child(odd){transform:rotate(-.6deg)}.row:nth-child(even){transform:rotate(.5deg) translateX(4px)}
</style><div class="paper"><h1>${esc(menu.restaurant)}</h1>${rows(menu)}</div>`;
    case 'tahta':
      return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1080px;height:1440px;background:linear-gradient(180deg,#e6dfd2,#cfc6b6)}
.frame{position:absolute;left:55px;top:50px;width:970px;height:1340px;padding:30px;box-sizing:border-box;transform:rotate(.8deg);background:repeating-linear-gradient(90deg,#7a5230 0 9px,#6c4628 9px 15px,#83593a 15px 26px);box-shadow:0 22px 44px rgba(0,0,0,.4)}
.board{width:100%;height:100%;background:radial-gradient(ellipse at 25% 30%,rgba(255,255,255,.07),transparent 45%),#243029;padding:50px 70px;box-sizing:border-box;color:#f3efe4;font-family:'Segoe Print','Ink Free',cursive;text-shadow:0 0 2px rgba(243,239,228,.55)}
h1{margin:0 0 20px;text-align:center;font-size:72px;color:#f7e8a8}
.sec{font-size:44px;color:#f7b8b0;margin:30px 0 6px}
.row{display:flex;align-items:baseline;font-size:42px;line-height:1.3}.dots{flex:1;border-bottom:3px dotted rgba(243,239,228,.45);margin:0 14px;transform:translateY(-10px)}.p{font-weight:700}
</style><div class="frame"><div class="board"><h1>${esc(menu.restaurant)}</h1>${rows(menu)}</div></div>`;
    case 'bulanik':
      return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1080px;height:1440px;background:#4a4036}
.shot{position:absolute;inset:0;filter:blur(1.9px) contrast(.82) brightness(1.08);transform:perspective(1400px) rotateX(6deg) rotate(1.5deg) scale(.97)}
.card{position:absolute;inset:70px 80px;background:#fffdf5;padding:60px 70px;font-family:Calibri,'Segoe UI',sans-serif}
h1{margin:0 0 24px;font:700 58px Georgia,serif;color:#333;text-align:center}
.sec{font-weight:700;font-size:34px;color:#6a3b1c;margin:30px 0 8px}
.row{display:flex;align-items:baseline;font-size:36px;color:#333;margin:9px 0}.dots{flex:1;border-bottom:2px dotted #aaa;margin:0 10px}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 50%,rgba(0,0,0,.45) 100%)}
</style><div class="shot"><div class="card"><h1>${esc(menu.restaurant)}</h1>${rows(menu)}</div></div><div class="vig"></div>`;
    case 'egik':
      return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:600px;height:800px;background:#3b3a36}
.card{position:absolute;left:40px;top:60px;width:500px;height:650px;background:#f6f1e3;padding:28px 30px;box-sizing:border-box;font-family:Calibri,'Segoe UI',sans-serif;transform:perspective(900px) rotateY(-16deg) rotateZ(-7deg) skewX(3deg);box-shadow:0 12px 26px rgba(0,0,0,.5)}
h1{margin:0 0 10px;font:700 30px Georgia,serif;color:#2a2a2a;text-align:center}
.sec{font-weight:700;font-size:18px;color:#7b2d13;margin:14px 0 4px}
.row{display:flex;align-items:baseline;font-size:18px;color:#2a2a2a;margin:4px 0}.dots{flex:1;border-bottom:1px dotted #999;margin:0 6px}
.glare{position:absolute;left:250px;top:120px;width:260px;height:180px;background:radial-gradient(ellipse,rgba(255,255,255,.35),transparent 70%);transform:rotate(-20deg)}
</style><div class="card"><h1>${esc(menu.restaurant)}</h1>${rows(menu)}</div><div class="glare"></div>`;
    default:
      throw new Error(`unknown style ${menu.style}`);
  }
}

// ---- a minimal DevTools-protocol client (Node's built-in WebSocket) ---------------------------------------------
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      events.push(msg.method);
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const n = ++id;
      pending.set(n, { ok, fail });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, events, close: () => ws.close() };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ai-eval-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--disable-gpu', '--hide-scrollbars', 'about:blank'], {
    stdio: 'ignore',
  });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {
        /* chrome still starting */
      }
    }
    if (!target) throw new Error('Chrome DevTools did not come up');
    const page = await cdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable');

    for (const menu of MENUS) {
      const look = LOOK[menu.style];
      const file = join(OUT, `${menu.slug}.html`);
      writeFileSync(file, html(menu), 'utf8');
      await page.send('Emulation.setDeviceMetricsOverride', { width: look.width, height: look.height, deviceScaleFactor: 1, mobile: false });
      await page.send('Page.navigate', { url: `file:///${file.replace(/\\/g, '/')}` });
      await new Promise((r) => setTimeout(r, 900)); // layout + local fonts
      const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: look.quality });
      writeFileSync(join(OUT, `${menu.slug}.jpg`), Buffer.from(shot.data, 'base64'));
      rmSync(file);
      console.log(`${menu.slug}.jpg  (${menu.style}, ${look.width}x${look.height}, q${look.quality})`);
    }
    page.close();
  } finally {
    chrome.kill();
    await new Promise((r) => setTimeout(r, 500));
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
