// Generates PNG PWA icons from the source SVGs in public/.
// Run with: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const standard = readFileSync(join(pub, 'pwa-icon.svg'));
const maskable = readFileSync(join(pub, 'pwa-icon-maskable.svg'));

const jobs = [
    { src: standard, size: 192, out: 'pwa-192x192.png' },
    { src: standard, size: 512, out: 'pwa-512x512.png' },
    // Maskable + apple-touch use the full-bleed (square) source so iOS/Android
    // can apply their own masks without clipping the star or showing corners.
    { src: maskable, size: 512, out: 'pwa-maskable-512x512.png' },
    { src: maskable, size: 180, out: 'apple-touch-icon.png' },
];

await Promise.all(
    jobs.map(({ src, size, out }) =>
        sharp(src, { density: 384 })
            .resize(size, size)
            .png()
            .toFile(join(pub, out))
            .then(() => console.log(`✓ ${out} (${size}x${size})`))
    )
);
