/**
 * Crop and magnify, for looking at sprites.
 *
 * A soldier is thirteen pixels wide. Judging one inside a 1280px screenshot is
 * guesswork, and judging the original's against ours means getting both to the
 * same scale — so this cuts a region out and blows it up with nearest-neighbour,
 * which is the only filter that tells the truth about pixel art.
 *
 *   node tools/crop.mjs in.png out.png 740 120 90 60 --scale 8
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : Number(args[i + 1]);
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [inFile, outFile, cx, cy, cw, ch] = positional;
const scale = flag('scale', 8);

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(async ({ data, cx, cy, cw, ch, scale }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${data}`;
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  c.width = cw * scale; c.height = ch * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);
  return c.toDataURL('image/png').split(',')[1];
}, {
  data: (await readFile(inFile)).toString('base64'),
  cx: Number(cx), cy: Number(cy), cw: Number(cw), ch: Number(ch), scale,
});

await writeFile(outFile, Buffer.from(b64, 'base64'));
await browser.close();
console.log(`${outFile}  ${cw}x${ch} at ${scale}x`);
