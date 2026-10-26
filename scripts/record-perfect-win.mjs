/**
 * Record the perfect-win autoplay page to an MP4 artifact.
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, copyFileSync, renameSync, statSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const outDir = '/opt/cursor/artifacts';
const tmpDir = '/tmp/perfect-win-record';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function contentType(file) {
  return MIME[extname(file)] || 'application/octet-stream';
}

function startStaticServer() {
  const base = '/Couch-of-Power';
  const server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === base || url === `${base}/`) {
      url = `${base}/perfect-win.html`;
    }
    if (!url.startsWith(base)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    let rel = url.slice(base.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    if (!rel) rel = 'perfect-win.html';
    const file = join(dist, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end(`missing ${rel}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(file) });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/Couch-of-Power/perfect-win.html?autoplay=1&speed=1`;
  console.log('serving', url);

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tmpDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.done === '1', null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(800);
  await context.close();
  await browser.close();
  server.close();

  const webm = spawnSync('bash', ['-lc', `ls -1t '${tmpDir}'/*.webm | head -1`], {
    encoding: 'utf8',
  }).stdout.trim();
  if (!webm) throw new Error('No webm recorded');
  console.log('webm', webm, statSync(webm).size);

  const mp4 = join(outDir, 'perfect_info_forced_win_8_moves.mp4');
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      webm,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      mp4,
    ],
    { encoding: 'utf8' },
  );
  if (ff.status !== 0) {
    console.error(ff.stderr);
    // fallback: copy webm
    const fallback = join(outDir, 'perfect_info_forced_win_8_moves.webm');
    copyFileSync(webm, fallback);
    console.log('saved fallback', fallback);
  } else {
    console.log('saved', mp4, statSync(mp4).size);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
