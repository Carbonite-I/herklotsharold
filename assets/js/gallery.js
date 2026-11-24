/* Halaman perpustakaan: baca flipbooks.json, tampilkan sampul tiap PDF. */
(function () {
  'use strict';
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  const grid = document.getElementById('grid');

  fetch('flipbooks.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      if (data.site) {
        if (data.site.title) {
          document.getElementById('siteTitle').textContent = data.site.title;
          document.title = data.site.title;
        }
        if (data.site.description) document.getElementById('siteDesc').textContent = data.site.description;
      }
      const books = (data.flipbooks || []).filter((b) => !b.hidden);
      grid.innerHTML = '';
      if (!books.length) {
        grid.innerHTML = '<p class="empty">Belum ada PDF. Taruh file PDF di folder <code>pdfs/</code> lalu push.</p>';
        return;
      }
      books.forEach((b) => grid.appendChild(card(b)));
    })
    .catch(() => {
      grid.innerHTML = '<p class="empty">flipbooks.json tidak bisa dibaca. Jika membuka file langsung (file://), jalankan lewat server lokal: <code>npx serve .</code></p>';
    });

  function card(b) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = 'viewer.html?id=' + encodeURIComponent(b.id);
    a.innerHTML = '<div class="cover"></div><h3></h3><p></p>';
    a.querySelector('h3').textContent = b.title;
    a.querySelector('p').textContent = b.description || '';
    const cover = a.querySelector('.cover');
    if (b.cover) {
      const img = new Image();
      img.src = b.cover; img.alt = b.title; img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      cover.appendChild(img);
    } else {
      // render halaman pertama sebagai sampul hanya saat terlihat
      const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        renderCover(b.file, cover);
      });
      io.observe(cover);
    }
    return a;
  }

  async function renderCover(file, box) {
    try {
      const pdf = await pdfjsLib.getDocument({ url: file, disableAutoFetch: true, disableStream: false }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 400 / base.width });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      box.style.aspectRatio = base.width / base.height;
      box.appendChild(c);
      pdf.destroy();
    } catch (e) {
      box.textContent = 'PDF';
    }
  }
})();
