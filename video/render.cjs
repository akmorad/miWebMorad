/**
 * Renderiza scene.html a MP4 vertical (1080x1920) fotograma a fotograma.
 * Uso: NODE_PATH=/opt/node22/lib/node_modules node render.cjs [fps] [duracion]
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS      = Number(process.argv[2] || 30);
const DURATION = Number(process.argv[3] || 39.5);
const W = 1080, H = 1920;

const OUT_DIR   = process.env.OUT_DIR   || path.join(__dirname, 'out');
const FRAME_DIR = process.env.FRAME_DIR || path.join(OUT_DIR, 'frames');
const FFMPEG    = require('ffmpeg-static');

(async () => {
  fs.rmSync(FRAME_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none',
           '--hide-scrollbars', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });

  const url = 'file://' + path.join(__dirname, 'scene.html') + '?render=1';
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // Pausa TODAS las animaciones: el tiempo lo controlamos nosotros.
  await page.evaluate(() => {
    window.__anims = document.getAnimations();
    window.__anims.forEach(a => { try { a.pause(); } catch (e) {} });
  });
  const total = Math.round(DURATION * FPS);
  console.log(`Renderizando ${total} fotogramas a ${FPS} fps (${DURATION}s)…`);

  for (let i = 0; i < total; i++) {
    const t = (i / FPS) * 1000; // ms del timeline global
    await page.evaluate(async (ms) => {
      window.__anims.forEach(a => { try { a.currentTime = ms; } catch (e) {} });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    await page.screenshot({
      path: path.join(FRAME_DIR, String(i).padStart(5, '0') + '.jpg'),
      type: 'jpeg', quality: 95, animations: 'allow', caret: 'hide',
    });
    if (i % 60 === 0) process.stdout.write(`  ${i}/${total}\r`);
  }
  console.log(`\n${total} fotogramas listos. Codificando…`);
  await browser.close();

  const mp4 = path.join(OUT_DIR, 'morad-web-crm-whatsapp-9x16.mp4');
  execFileSync(FFMPEG, [
    '-y', '-framerate', String(FPS), '-i', path.join(FRAME_DIR, '%05d.jpg'),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2',
    '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow',
    '-x264-params', 'keyint=60:min-keyint=30:scenecut=0',
    '-r', String(FPS), '-movflags', '+faststart',
    '-vf', 'scale=1080:1920:flags=lanczos',
    mp4,
  ], { stdio: 'inherit' });

  // Portada para el feed
  const cover = path.join(OUT_DIR, 'portada.jpg');
  execFileSync(FFMPEG, ['-y', '-i', path.join(FRAME_DIR, String(Math.round(2.6 * FPS)).padStart(5, '0') + '.jpg'),
    '-q:v', '2', cover], { stdio: 'inherit' });

  console.log('\nOK →', mp4);
})().catch(e => { console.error(e); process.exit(1); });
