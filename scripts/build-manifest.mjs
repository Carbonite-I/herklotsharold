#!/usr/bin/env node
/*
 * Memindai folder pdfs/ dan memperbarui flipbooks.json.
 * - PDF baru otomatis ditambahkan (judul dari nama file).
 * - Judul/deskripsi/sampul yang sudah Anda ubah manual di flipbooks.json tetap dipertahankan.
 * - Entri yang file PDF-nya sudah dihapus akan dibuang.
 *
 * Jalankan: node scripts/build-manifest.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfDir = join(root, 'pdfs');
const manifestPath = join(root, 'flipbooks.json');

const slug = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flipbook';
const titleOf = (name) =>
  name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.pdf$/i.test(f) ? [p] : [];
  });

let manifest = { site: { title: 'Perpustakaan Flipbook', description: 'Klik salah satu buku untuk membacanya sebagai flipbook interaktif.' }, flipbooks: [] };
if (existsSync(manifestPath)) {
  try { manifest = { ...manifest, ...JSON.parse(readFileSync(manifestPath, 'utf8')) }; } catch (e) {
    console.error('flipbooks.json tidak valid, dibuat ulang:', e.message);
  }
}

const existing = new Map((manifest.flipbooks || []).map((b) => [b.file, b]));
const files = existsSync(pdfDir) ? walk(pdfDir) : [];
const used = new Set();

const books = files
  .map((abs) => {
    const file = abs.slice(root.length + 1).split('\\').join('/');
    const old = existing.get(file);
    const name = file.split('/').pop();
    let id = old?.id || slug(name.replace(/\.pdf$/i, ''));
    while (used.has(id)) id += '-2';
    used.add(id);
    return {
      id,
      title: old?.title || titleOf(name),
      description: old?.description || '',
      file,
      ...(old?.cover ? { cover: old.cover } : {}),
      ...(old?.hidden ? { hidden: true } : {}),
      added: old?.added || new Date().toISOString().slice(0, 10),
    };
  })
  // urutkan: yang terbaru di atas, lalu judul
  .sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.title.localeCompare(b.title));

manifest.flipbooks = books;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`flipbooks.json: ${books.length} flipbook`);
books.forEach((b) => console.log(`  - ${b.title}  ->  viewer.html?id=${b.id}`));
