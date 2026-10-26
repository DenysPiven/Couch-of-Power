import { readFileSync, writeFileSync } from 'fs';

const frames = readFileSync('public/perfect-win-frames.json', 'utf8');
let html = readFileSync('perfect-win.html', 'utf8');
const replaced = html.replace(
  /const frames = await fetch\([\s\S]*?\.json\(\),\s*\);/,
  `const frames = ${frames};`,
);
if (replaced === html) {
  console.error('pattern not found');
  process.exit(1);
}
writeFileSync('perfect-win.html', replaced);
console.log('embedded frames ok');
