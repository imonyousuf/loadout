// Deterministic recorder: fake clock, one screenshot per frame, piped into ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const W = 1600, H = 900, DSF = +(process.env.DSF || 2), FPS = 30;
const URL = process.env.URL || 'http://localhost:8804/?capture';
const OUT = process.argv[2];
const SCRIPT = process.argv[3]; // which take to record
const LIMIT = +(process.env.LIMIT || 1e9); // stop after N frames (speed test)

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), // cubic in-out
  out: (t) => 1 - Math.pow(1 - t, 4),
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the payoff take starts with the product the main take added; every other take starts clean
  const tea = { id: 'custom-iced-tea-12-pack-tour', name: 'Iced tea 12-pack', detail: '13 × 9 × 7.5 in', category: 'Tea',
    length: 13, width: 9, height: 7.5, weight: 21, fragile: false, color: '#ff8a5b' };
  await page.addInitScript(([withTea, product]) => {
    try {
      localStorage.setItem('loadout.tourSeen', '1');
      if (withTea) localStorage.setItem('loadout.customProducts', JSON.stringify([product]));
      else localStorage.removeItem('loadout.customProducts');
    } catch {}
  }, [SCRIPT === 'payoff', tea]);
  await page.clock.install();
  await page.goto(URL);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  // the fake clock flows with real time until paused; from here on only the recorder moves it
  const pageNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(pageNow + 50);
  await page.clock.runFor(400);
  await page.evaluate(() => window.__advance(performance.now() / 1000));

  await page.addStyleTag({
    content: `#cap-cursor{position:fixed;left:0;top:0;width:28px;height:28px;pointer-events:none;z-index:99999;transform-origin:3px 2px;will-change:transform}
              #cap-cursor svg{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}`,
  });
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'cap-cursor';
    d.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2.5 L4 22 L9.3 17.2 L12.9 25.2 L16.6 23.6 L13.1 15.8 L20.2 15.8 Z" fill="#fff" stroke="#0b0b0c" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(d);
    window.__cursor = (x, y, s) => {
      d.style.transform = `translate(${x - 3}px, ${y - 2}px) scale(${s})`;
    };
    window.__cursor(-100, -100, 1);
    // CSS transitions and animations follow the fake clock, frame by frame
    window.__tick = (now) => {
      for (const a of document.getAnimations()) {
        if (a.__t0 === undefined) {
          a.__t0 = now;
          a.pause();
        }
        const t = now - a.__t0;
        const end = a.effect?.getComputedTiming?.().endTime ?? 0;
        if (typeof end === 'number' && t >= end) a.finish();
        else a.currentTime = t;
      }
    };
  });

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  ff.stderr.on('data', (d) => process.stderr.write(d));

  // Playwright's screenshot waits on a page frame, which the fake clock never schedules: ask Chrome directly
  const cdp = await ctx.newCDPSession(page);
  let frame = 0;
  const marks = { fps: FPS, width: W, height: H, dsf: DSF, events: [], boxes: {} };
  const mark = (name, extra) => marks.events.push({ name, frame, t: +(frame / FPS).toFixed(3), ...extra });
  const t0 = Date.now();
  const shoot = async () => {
    if (frame >= LIMIT) throw new Error('LIMIT');
    const a = Date.now();
    await page.clock.runFor(1000 / FPS);
    const b = Date.now();
    // one exact 3D frame at the fake time, then CSS animations to the same time
    await page.evaluate(() => {
      window.__advance(performance.now() / 1000);
      window.__tick(performance.now());
    });
    const c = Date.now();
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true, clip: { x: 0, y: 0, width: W, height: H, scale: DSF } });
    const buf = Buffer.from(data, 'base64');
    if (process.env.TIMING) console.log(`frame ${frame}: runFor ${b - a} ms, tick ${c - b} ms, capture ${Date.now() - c} ms`);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    frame++;
    if (frame % 30 === 0) process.stdout.write(`\r${frame} frames, ${((Date.now() - t0) / frame).toFixed(0)} ms/frame   `);
  };
  const hold = async (sec) => {
    for (let i = 0; i < Math.round(sec * FPS); i++) await shoot();
  };
  let cur = { x: W + 60, y: H * 0.55, s: 1 };
  const setCur = async (x, y, s = cur.s) => {
    cur = { x, y, s };
    await page.evaluate(([a, b, c]) => window.__cursor(a, b, c), [x, y, s]);
  };
  /**
   * Glide the drawn cursor to (x, y) over `sec`. Travel moves park the real mouse on the header
   * so nothing it passes over reacts, then land it on the target; `hover` moves it all the way.
   */
  const glide = async (x, y, sec, e = ease.inOut, hover = false) => {
    const n = Math.max(1, Math.round(sec * FPS));
    const sx = cur.x, sy = cur.y;
    // a slight arc reads as a hand, not a robot
    const dx = x - sx, dy = y - sy, len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(40, len * 0.08);
    for (let i = 1; i <= n; i++) {
      const k = e(i / n);
      const arc = Math.sin(Math.PI * k) * bow;
      const nx = sx + dx * k + (-dy / len) * arc;
      const ny = sy + dy * k + (dx / len) * arc;
      if (hover || i === n) await page.mouse.move(nx, ny);
      else if (i === 1) await page.mouse.move(W / 2, 28);
      await setCur(nx, ny);
      await shoot();
    }
  };
  const center = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error('no box for ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
  };
  const box = async (name, sel) => {
    const b = await page.locator(sel).first().boundingBox({ timeout: 2000 }).catch(() => null);
    marks.boxes[name] = b && { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), frame };
  };
  /** press: the cursor dips for two frames, the click lands, it springs back */
  const click = async (name) => {
    await setCur(cur.x, cur.y, 0.86);
    await shoot();
    await page.mouse.down();
    mark(name, { x: +cur.x.toFixed(1), y: +cur.y.toFixed(1) });
    await page.mouse.up();
    await shoot();
    await setCur(cur.x, cur.y, 1);
    await shoot();
  };
  const goTo = async (sel, sec, name, dx = 0, dy = 0) => {
    const c = await center(sel);
    await glide(c.x + dx, c.y + dy, sec);
    if (name) await click(name);
    return c;
  };
  const typeText = async (text, cps = 12) => {
    const per = FPS / cps;
    let acc = 0;
    for (const ch of text) {
      await page.keyboard.type(ch);
      acc += per;
      while (acc >= 1) {
        await shoot();
        acc -= 1;
      }
    }
    await shoot();
  };
  const wheel = async (sel, dy, sec) => {
    const n = Math.round(sec * FPS);
    let done = 0;
    for (let i = 1; i <= n; i++) {
      const target = Math.round(dy * ease.inOut(i / n));
      await page.evaluate(([s, d]) => document.querySelector(s).scrollBy(0, d), [sel, target - done]);
      done = target;
      await shoot();
    }
  };

  // set an input the way typing does, so React sees it
  const setInput = (id, v) => page.evaluate(([i, val]) => {
    const el = document.getElementById(i);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [id, v]);
  const settle = async (frames = 12) => {
    for (let i = 0; i < frames; i++) {
      await page.clock.runFor(1000 / FPS);
      await page.evaluate(() => window.__advance(performance.now() / 1000));
    }
  };

  const takes = {
    // the ending: the same order with the iced tea added; click the pallet it went to and watch it build
    async payoff() {
      await page.evaluate(() => [...document.querySelectorAll('.presets button')][1].click());
      await settle(6);
      await setInput('qty-cans24', 93);
      await settle(4);
      const teaId = await page.evaluate(() => JSON.parse(localStorage.getItem('loadout.customProducts'))[0].id);
      await setInput('qty-' + teaId, 10);
      await settle(6);
      // which pallet carries the tea: hover its row and read the marked tab
      const row = await page.locator('#line-' + teaId).boundingBox();
      await page.evaluate(() => document.querySelector('.order').scrollTo(0, 99999));
      await settle(2);
      const row2 = await page.locator('#line-' + teaId).boundingBox();
      await page.mouse.move(row2.x + 60, row2.y + row2.height / 2);
      await settle(2);
      const tabIdx = await page.evaluate(() => [...document.querySelectorAll('.tabs button')].findIndex((b) => b.classList.contains('has')));
      marks.teaTab = tabIdx;
      await page.mouse.move(W / 2, 28);
      // the main take ended on pallet 2
      await page.evaluate(() => [...document.querySelectorAll('.tabs button')][1].click());
      await settle(150); // let pallet 2 finish building before the first frame
      await setCur(1050, 560, 1);
      await page.mouse.move(1050, 560);
      mark('start');
      await hold(0.4);
      await goTo(`.tabs button:nth-child(${tabIdx + 1})`, 1.0, 'click-tea-pallet');
      mark('tea-build');
      await glide(1040, 600, 1.0, ease.out);
      await hold(3.4);
      mark('end');
    },
    // a clean loop for the portfolio card: Grocery Friday building, no cursor
    async hero() {
      await page.evaluate(() => document.querySelector('.clear').click());
      for (let i = 0; i < 20; i++) {
        await page.clock.runFor(1000 / FPS);
        await page.evaluate(() => window.__advance(performance.now() / 1000));
      }
      await page.evaluate(() => [...document.querySelectorAll('.presets button')][1].click());
      mark('build');
      await hold(6.5);
      mark('end');
    },
    // the whole tour in one continuous take
    async main() {
      // start from an empty order so the build happens on camera
      await page.evaluate(() => document.querySelector('.clear').click());
      await page.mouse.move(W - 5, H - 5);
      for (let i = 0; i < 36; i++) {
        await page.clock.runFor(1000 / FPS);
        await page.evaluate(() => window.__advance(performance.now() / 1000));
      }
      await box('stage', '.stage');
      await box('order', '.order');
      await box('presets', '.presets');
      await box('stats', '.stats');
      mark('start');
      await hold(1.0);
      await goTo('.presets button:has-text("Grocery Friday")', 1.1, 'click-preset');
      mark('build-start');
      await glide(1020, 610, 1.4, ease.out); // out of the way, over the stage edge, not on a case
      await hold(2.6);
      await box('tabs', '.tabs');
      await box('layers', '.layers');
      mark('built');
      // read the numbers
      await goTo('.stat:nth-child(2)', 1.0);
      mark('at-stats');
      await hold(0.8);
      await glide((await center('.stat:nth-child(3)')).x, (await center('.stat:nth-child(3)')).y, 0.7);
      await hold(0.6);
      // another pallet
      await goTo('.tabs button:nth-child(2)', 1.2, 'click-p2');
      mark('p2-build');
      await glide(900, 640, 1.0, ease.out);
      await hold(2.4);
      // layers: x-ray one at a time
      mark('layers-start');
      const rows = await page.locator('.layers li button').count();
      await goTo('.layers li:nth-child(1) button', 1.0);
      for (let i = 2; i <= Math.min(rows, 5); i++) {
        await hold(0.45);
        const c = await center(`.layers li:nth-child(${i}) button`);
        await glide(c.x, c.y, 0.35, ease.inOut, true);
      }
      await hold(0.6);
      mark('layers-end');
      // chips ride on top: the Chips row sits on the bottom edge, so bring it up first, then hover it
      await glide(1100, 560, 0.7);
      await wheel('.order', 170, 0.6);
      await goTo('.lines li:has-text("Chips")', 1.0);
      mark('chips-hover');
      await hold(2.2);
      // change the order: three more cases of cans
      await goTo('button[aria-label="One more Cans 24-pack"]', 1.2, 'cans-plus-1');
      await hold(0.25);
      await click('cans-plus-2');
      await hold(0.25);
      await click('cans-plus-3');
      await hold(1.6);
      // add your own product
      await glide(1400, 640, 0.6);
      await wheel('.order', 900, 1.0);
      await box('addbtn', '.addbtn');
      await goTo('.addbtn', 0.9, 'click-add');
      await hold(0.4);
      // the form opens below the fold: scroll the panel down so all of it shows, as a person would
      await glide(1420, 560, 0.4);
      await wheel('.order', 700, 0.8);
      await box('form', '.addform');
      mark('form-open');
      await goTo('#np-name', 0.7, 'focus-name');
      await page.keyboard.press('Control+A');
      await typeText('Iced tea 12-pack', 13);
      await goTo('#np-cat', 0.6, 'focus-cat');
      await page.keyboard.press('Control+A');
      await typeText('Tea', 10);
      await goTo('#np-l', 0.6, 'focus-l');
      await typeText('13', 9);
      await goTo('#np-w', 0.4, 'focus-w');
      await typeText('9', 9);
      await goTo('#np-h', 0.4, 'focus-h');
      await typeText('7.5', 9);
      await goTo('#np-wt', 0.6, 'focus-wt');
      await typeText('21', 9);
      await box('form', '.addform');
      mark('preview-ready');
      await hold(0.9);
      await goTo('.addform button.primary', 0.8, 'click-add-to-order');
      mark('added');
      await hold(0.4);
      await box('newline', '.lines li.new');
      await glide(1050, 560, 1.2, ease.out);
      await hold(3.0);
      mark('end');
    },
  };

  try {
    await takes[SCRIPT]();
  } catch (e) {
    if (e.message !== 'LIMIT') throw e;
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  marks.frames = frame;
  fs.writeFileSync(OUT.replace(/\.mp4$/, '.json'), JSON.stringify(marks, null, 2));
  console.log(`\ndone: ${frame} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, errors: ${JSON.stringify(errors)}`);
  await browser.close();
})();
