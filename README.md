# Flipbook PDF Interaktif

Ubah PDF jadi flipbook interaktif (seperti Heyzine), 100% open source dan statis. Bisa di-hosting gratis di
GitHub Pages / Netlify / Cloudflare Pages / Vercel, dan memakai **custom domain** sendiri.

- **PDF.js** (Mozilla, Apache-2.0) merender halaman PDF
- **StPageFlip** (MIT) membuat efek balik halaman yang realistis

Tidak perlu server, database, atau proses konversi: PDF langsung dibaca di browser.

## Fitur

- Efek balik halaman realistis (tarik sudut halaman, klik, swipe di HP)
- Dua halaman berdampingan di desktop, satu halaman di HP (otomatis)
- Thumbnail semua halaman, lompat ke halaman tertentu
- Zoom (tombol +/−, klik ganda, Ctrl + scroll), geser saat diperbesar
- Layar penuh, unduh PDF, suara balik halaman
- Link di dalam PDF (URL & daftar isi) tetap bisa diklik
- Bagikan link langsung ke halaman tertentu (`#p=5`) + kode embed `<iframe>`
- Halaman perpustakaan otomatis dengan sampul dari halaman pertama
- Buka PDF dari komputer (tarik & lepas) tanpa upload
- Halaman dirender bertahap, jadi PDF ratusan halaman tetap ringan

## Cara menambah PDF (paling gampang)

1. Buka repo ini di GitHub → masuk folder **`pdfs/`** → **Add file → Upload files**.
2. Upload PDF Anda (misal `katalog-2026.pdf`) → **Commit changes**.
3. Tunggu ±1 menit. GitHub Actions otomatis memperbarui `flipbooks.json` dan menerbitkan situs.
4. Flipbook langsung tersedia di:
   - `https://domain-anda.com/` (perpustakaan)
   - `https://domain-anda.com/viewer.html?id=katalog-2026` (flipbook langsung)

Tips: nama file jadi ID dan judul (`katalog-2026.pdf` → judul "Katalog 2026"). Hapus PDF dari folder untuk
menghapus flipbook-nya.

### Mengubah judul, deskripsi, sampul

Edit `flipbooks.json` (perubahan Anda dipertahankan saat diperbarui otomatis):

```json
{
  "site": { "title": "Katalog Toko Saya", "description": "Lihat katalog terbaru kami." },
  "flipbooks": [
    {
      "id": "katalog-2026",
      "title": "Katalog Produk 2026",
      "description": "Edisi Januari",
      "file": "pdfs/katalog-2026.pdf",
      "cover": "pdfs/katalog-2026-cover.jpg",
      "hidden": false
    }
  ]
}
```

`cover` opsional (default: halaman pertama PDF). `hidden: true` menyembunyikan dari perpustakaan tetapi
link-nya tetap bisa dibuka.

### Cara lain membuka PDF

| URL | Keterangan |
| --- | --- |
| `viewer.html?id=katalog-2026` | dari daftar `flipbooks.json` |
| `viewer.html?file=katalog-2026` | langsung dari `pdfs/katalog-2026.pdf` |
| `viewer.html?pdf=https://situs-lain.com/file.pdf&title=Judul` | PDF dari URL lain (server harus mengizinkan CORS) |
| `viewer.html` | tarik & lepas PDF dari komputer (tidak diunggah) |

Tambahkan `&page=5` atau `#p=5` untuk membuka langsung di halaman 5.

### Embed di website / blog / WordPress

Klik tombol 🔗 di flipbook lalu **Salin embed**, atau:

```html
<iframe src="https://domain-anda.com/viewer.html?id=katalog-2026"
        width="100%" height="600" style="border:0" allowfullscreen></iframe>
```

## Publikasi + custom domain

### A. GitHub Pages (sudah disiapkan)

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push ke branch `main` (atau jalankan workflow **Deploy flipbook ke GitHub Pages** secara manual di tab Actions).
3. Custom domain: **Settings → Pages → Custom domain** → isi misal `flipbook.domainanda.com` → Save →
   centang **Enforce HTTPS**.
4. Di pengelola DNS domain Anda:
   - Subdomain (`flipbook.domainanda.com`): record **CNAME** → `<username>.github.io`
   - Domain utama (`domainanda.com`): record **A** ke `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`

Catatan: repo privat butuh GitHub berbayar untuk Pages. Batas file GitHub 100 MB per PDF (kompres PDF besar
dulu, misal dengan `ghostscript` atau ilovepdf).

### B. Netlify / Cloudflare Pages / Vercel

Hubungkan repo ini, lalu atur:
- **Build command:** `node scripts/build-manifest.mjs`
- **Output / publish directory:** `.` (root)

Custom domain ditambahkan dari dashboard masing-masing (Domain settings), ikuti instruksi DNS yang ditampilkan.

### C. Hosting biasa (cPanel / VPS)

Jalankan `node scripts/build-manifest.mjs`, lalu upload seluruh isi folder ke `public_html`. Untuk menambah PDF,
upload ke `pdfs/` dan jalankan lagi skripnya (atau edit `flipbooks.json` manual).

## Menjalankan di komputer

```bash
npm start          # memperbarui flipbooks.json lalu membuka http://localhost:8080
```

(Harus lewat server lokal; membuka `index.html` dengan klik ganda/`file://` tidak bisa membaca PDF.)

## Kustomisasi tampilan

- Warna & latar: variabel CSS di bagian atas `assets/css/style.css` (`--accent`, `--stage-bg`, dll.)
- Logo/judul: `index.html` dan `viewer.html`
- Kecepatan balik halaman, bayangan, dll.: opsi `new St.PageFlip(...)` di `assets/js/viewer.js`

## Struktur

```
index.html              perpustakaan flipbook
viewer.html             tampilan flipbook
flipbooks.json          daftar flipbook (otomatis dari folder pdfs/)
pdfs/                   taruh PDF di sini
assets/                 CSS & JS
vendor/                 PDF.js 3.11.174 & StPageFlip 2.0.7 (disertakan, tidak tergantung CDN)
scripts/build-manifest.mjs
.github/workflows/deploy.yml
```

## Lisensi

Kode proyek ini: MIT. PDF.js: Apache-2.0 (`vendor/pdfjs/LICENSE`). StPageFlip: MIT (`vendor/page-flip/LICENSE`).
