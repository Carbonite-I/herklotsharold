/*
 * Flipbook viewer — PDF.js (Apache-2.0) + StPageFlip (MIT)
 *
 * URL parameter:
 *   viewer.html?id=<id>          -> ambil data dari flipbooks.json
 *   viewer.html?file=<nama>      -> buka pdfs/<nama>.pdf
 *   viewer.html?pdf=<url>        -> buka PDF dari URL mana pun (harus mengizinkan CORS)
 *   &title=<judul>  &page=<n>    -> opsional
 *   tanpa parameter              -> tampil layar "tarik & lepas PDF"
 */
(function () {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const zoomLayer = $('zoomLayer');
  const bookEl = $('book');
  const params = new URLSearchParams(location.search);

  const KEEP_RANGE = 6;        // halaman di sekitar halaman aktif yang tetap disimpan di memori
  const PRERENDER = 3;         // halaman di depan/belakang yang dirender lebih dulu
  const MAX_CANVAS_SIDE = 4096;
  const ZOOMS = [1, 1.5, 2, 3];

  let pdf = null;
  let pageFlip = null;
  let ratio = 0.707;            // lebar / tinggi halaman
  let pages = [];               // { el, canvas, links, renderedWidth, task }
  let zoomIdx = 0;
  let pan = { x: 0, y: 0 };
  let soundOn = localStorage.getItem('fb-sound') !== 'off';
  let pdfUrl = null;
  let pdfTitle = '';

  // ------------------------------------------------------------------ start
  init().catch((err) => fail(err));

  async function init() {
    updateSoundIcon();
    let src = params.get('pdf');
    pdfTitle = params.get('title') || '';

    if (params.get('id')) {
      const entry = await findInManifest(params.get('id'));
      if (!entry) throw new Error('Flipbook "' + params.get('id') + '" tidak ditemukan di flipbooks.json');
      src = entry.file;
      pdfTitle = pdfTitle || entry.title;
    } else if (params.get('file')) {
      let f = params.get('file');
      if (!/\.pdf$/i.test(f)) f += '.pdf';
      src = 'pdfs/' + f;
    }

    if (!src) return showDropScreen();
    pdfUrl = src;
    await openPdf({ url: src }, pdfTitle || fileNameToTitle(src));
    const dl = $('btnDownload');
    dl.href = src;
    dl.hidden = false;
  }

  async function findInManifest(id) {
    try {
      const res = await fetch('flipbooks.json', { cache: 'no-cache' });
      const list = await res.json();
      return (list.flipbooks || list).find((b) => b.id === id);
    } catch (e) {
      return null;
    }
  }

  // ------------------------------------------------------------- open pdf
  async function openPdf(source, title) {
    $('dropScreen').hidden = true;
    $('loader').hidden = false;
    setTitle(title);

    const task = pdfjsLib.getDocument(Object.assign({
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    }, source));
    task.onProgress = ({ loaded, total }) => {
      if (total) {
        const p = Math.round((loaded / total) * 100);
        $('loaderBar').style.width = p + '%';
        $('loaderText').textContent = 'Memuat PDF… ' + p + '%';
      }
    };
    pdf = await task.promise;

    if (!params.get('title')) {
      try {
        const meta = await pdf.getMetadata();
        const t = meta && meta.info && meta.info.Title;
        if (t && !pdfTitle) setTitle(t);
      } catch (e) { /* abaikan */ }
    }

    const first = await pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    ratio = vp.width / vp.height;

    buildPages(pdf.numPages);
    buildFlipbook();
    buildThumbs();
    $('pageTotal').textContent = pdf.numPages;
    $('loader').hidden = true;
  }

  function setTitle(t) {
    pdfTitle = t;
    $('docTitle').textContent = t;
    document.title = t + ' — Flipbook';
  }

  // --------------------------------------------------------------- pages
  function buildPages(n) {
    bookEl.innerHTML = '';
    pages = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'page';
      if (i === 0 || i === n - 1) el.dataset.density = 'hard';
      const inner = document.createElement('div');
      inner.className = 'page-inner';
      const canvas = document.createElement('canvas');
      const links = document.createElement('div');
      links.className = 'links';
      const num = document.createElement('span');
      num.className = 'page-num';
      num.textContent = i + 1;
      inner.append(num, canvas, links);
      el.appendChild(inner);
      bookEl.appendChild(el);
      pages.push({ el, canvas, links, renderedWidth: 0, task: null, linksDone: false });
    }
  }

  function buildFlipbook() {
    // Ukuran buku dihitung sendiri agar selalu muat di layar (lebar & tinggi)
    window.addEventListener('resize', layout);
    const startPage = Math.max(0, Math.min(pdf.numPages - 1, (parseInt(params.get('page') || readHashPage(), 10) || 1) - 1));

    layout(true);
    pageFlip = new St.PageFlip(bookEl, {
      width: 1000,
      height: Math.round(1000 / ratio),
      size: 'stretch',
      minWidth: 1,
      maxWidth: 4000,
      minHeight: 1,
      maxHeight: 6000,
      showCover: true,
      usePortrait: true,
      autoSize: true,
      maxShadowOpacity: 0.5,
      mobileScrollSupport: false,
      flippingTime: 800,
      startPage,
    });
    pageFlip.loadFromHTML(document.querySelectorAll('#book .page'));
    applyOrientationHint();
    pageFlip.update();

    pageFlip.on('flip', (e) => {
      onPageChange(e.data);
      playFlip();
    });
    pageFlip.on('changeOrientation', () => onPageChange(pageFlip.getCurrentPageIndex()));
    onPageChange(pageFlip.getCurrentPageIndex());
  }

  /** Tentukan lebar elemen buku supaya tinggi yang dihasilkan pas dengan area. */
  function layout(skipUpdate) {
    const pad = window.innerWidth < 600 ? 8 : 40;
    const w = stage.clientWidth - pad * 2;
    const h = stage.clientHeight - pad * 2;
    const landscape = isLandscape(w, h);
    const bookW = landscape ? Math.min(w, h * ratio * 2) : Math.min(w, h * ratio);
    bookEl.parentElement.style.width = Math.floor(bookW) + 'px';
    stage.classList.toggle('single', !landscape);
    if (pageFlip && pageFlip.getUI() && skipUpdate !== true) {
      applyOrientationHint();
      pageFlip.update();
      renderAround(pageFlip.getCurrentPageIndex());
    }
  }

  function isLandscape(w, h) {
    // Dua halaman berdampingan jika lebar layar cukup (lebih dari ~1.25x lebar satu halaman penuh)
    return w > h * ratio * 1.25 && w > 560;
  }

  // StPageFlip memilih portrait jika lebar < minWidth*2 — kita atur sesuai keputusan layout()
  function applyOrientationHint() {
    const s = pageFlip.getSettings();
    s.minWidth = stage.classList.contains('single') ? 1e6 : 1;
  }

  // --------------------------------------------------------------- render
  let queue = Promise.resolve();

  function visibleIndexes(idx) {
    const out = [idx];
    if (pageFlip && pageFlip.getOrientation() === 'landscape') {
      // dengan showCover: halaman 0 sendiri, lalu pasangan (1,2), (3,4), ...
      if (idx > 0) out.push(idx % 2 === 1 ? idx + 1 : idx - 1);
    }
    return out.filter((i) => i >= 0 && i < pages.length);
  }

  function targetWidth() {
    const rect = pageFlip ? pageFlip.getBoundsRect() : null;
    const cssW = rect ? rect.pageWidth : 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    return Math.min(MAX_CANVAS_SIDE, Math.ceil(cssW * dpr * ZOOMS[zoomIdx]));
  }

  function renderAround(idx) {
    const tw = targetWidth();
    const vis = visibleIndexes(idx);
    const order = [...vis];
    for (let d = 1; d <= PRERENDER + 1; d++) order.push(idx + d, idx - d);
    order.filter((i, k, a) => i >= 0 && i < pages.length && a.indexOf(i) === k).forEach((i) => {
      // Halaman di luar layar cukup resolusi normal (tanpa zoom)
      const w = vis.includes(i) ? tw : Math.min(tw, Math.ceil(tw / ZOOMS[zoomIdx]));
      queueRender(i, w);
    });
    // Bebaskan memori halaman yang jauh
    pages.forEach((p, i) => {
      if (Math.abs(i - idx) > KEEP_RANGE && p.renderedWidth) {
        p.canvas.width = p.canvas.height = 0;
        p.renderedWidth = 0;
      }
    });
  }

  function queueRender(i, width) {
    const p = pages[i];
    if (p.renderedWidth >= width * 0.95) return;
    queue = queue.then(() => renderPage(i, width)).catch((e) => console.warn(e));
  }

  async function renderPage(i, width) {
    const p = pages[i];
    if (p.renderedWidth >= width * 0.95) return;
    const page = await pdf.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    // Render ke canvas sementara lalu salin, supaya tidak berkedip
    const tmp = document.createElement('canvas');
    tmp.width = Math.floor(viewport.width);
    tmp.height = Math.floor(viewport.height);
    await page.render({ canvasContext: tmp.getContext('2d', { alpha: false }), viewport }).promise;
    p.canvas.width = tmp.width;
    p.canvas.height = tmp.height;
    p.canvas.getContext('2d').drawImage(tmp, 0, 0);
    p.renderedWidth = width;
    p.el.classList.add('ready');
    if (!p.linksDone) addLinks(i, page, base);
  }

  /** Link di dalam PDF (URL & antar-halaman) tetap bisa diklik. */
  async function addLinks(i, page, base) {
    const p = pages[i];
    p.linksDone = true;
    const annots = await page.getAnnotations();
    for (const a of annots) {
      if (a.subtype !== 'Link' || !a.rect) continue;
      const [x1, y1, x2, y2] = pdfjsLib.Util.normalizeRect(a.rect);
      const link = document.createElement('a');
      link.style.left = (x1 / base.width) * 100 + '%';
      link.style.top = (1 - y2 / base.height) * 100 + '%';
      link.style.width = ((x2 - x1) / base.width) * 100 + '%';
      link.style.height = ((y2 - y1) / base.height) * 100 + '%';
      if (a.url || a.unsafeUrl) {
        link.href = a.url || a.unsafeUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = link.href;
      } else if (a.dest) {
        link.href = '#';
        link.addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            const dest = typeof a.dest === 'string' ? await pdf.getDestination(a.dest) : a.dest;
            const target = await pdf.getPageIndex(dest[0]);
            goTo(target);
          } catch (e) { /* abaikan */ }
        });
      } else continue;
      p.links.appendChild(link);
    }
  }

  // ----------------------------------------------------------- navigation
  function onPageChange(idx) {
    const vis = visibleIndexes(idx).sort((a, b) => a - b);
    $('pageInput').value = vis.length > 1 ? (vis[0] + 1) + '-' + (vis[1] + 1) : idx + 1;
    history.replaceState(null, '', '#p=' + (idx + 1));
    renderAround(idx);
    document.querySelectorAll('#thumbs .thumb').forEach((t, i) => t.classList.toggle('active', vis.includes(i)));
    const active = document.querySelector('#thumbs .thumb.active');
    if (active && !$('thumbs').hidden) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function goTo(i) {
    if (!pageFlip) return;
    i = Math.max(0, Math.min(pages.length - 1, i));
    pageFlip.flip(i);
  }

  function readHashPage() {
    const m = location.hash.match(/p=(\d+)/);
    return m ? m[1] : '1';
  }

  $('btnPrev').onclick = $('navPrev').onclick = () => pageFlip && pageFlip.flipPrev();
  $('btnNext').onclick = $('navNext').onclick = () => pageFlip && pageFlip.flipNext();
  $('btnFirst').onclick = () => goTo(0);
  $('btnLast').onclick = () => goTo(pages.length - 1);
  $('pageInput').addEventListener('focus', (e) => e.target.select());
  $('pageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(e.target.value, 10);
      if (n) goTo(n - 1);
      e.target.blur();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') pageFlip && pageFlip.flipNext();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') pageFlip && pageFlip.flipPrev();
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(pages.length - 1);
    else if (e.key === '+' || e.key === '=') setZoom(zoomIdx + 1);
    else if (e.key === '-') setZoom(zoomIdx - 1);
    else if (e.key === 'Escape') setZoom(0);
    else if (e.key === 'f') toggleFullscreen();
  });

  // ---------------------------------------------------------------- zoom
  function setZoom(idx, origin) {
    idx = Math.max(0, Math.min(ZOOMS.length - 1, idx));
    const prev = ZOOMS[zoomIdx];
    const next = ZOOMS[idx];
    if (origin) {
      // pertahankan titik di bawah kursor
      const r = stage.getBoundingClientRect();
      const dx = origin.x - (r.left + r.width / 2) - pan.x;
      const dy = origin.y - (r.top + r.height / 2) - pan.y;
      pan.x -= dx * (next / prev - 1);
      pan.y -= dy * (next / prev - 1);
    }
    zoomIdx = idx;
    if (idx === 0) pan = { x: 0, y: 0 };
    applyTransform();
    stage.classList.toggle('zoomed', idx > 0);
    if (pageFlip) renderAround(pageFlip.getCurrentPageIndex());
  }

  function applyTransform() {
    const z = ZOOMS[zoomIdx];
    const maxX = (stage.clientWidth * (z - 1)) / 2;
    const maxY = (stage.clientHeight * (z - 1)) / 2;
    pan.x = Math.max(-maxX, Math.min(maxX, pan.x));
    pan.y = Math.max(-maxY, Math.min(maxY, pan.y));
    zoomLayer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${z})`;
  }

  $('btnZoomIn').onclick = () => setZoom(zoomIdx + 1);
  $('btnZoomOut').onclick = () => setZoom(zoomIdx - 1);
  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.nav')) return;
    setZoom(zoomIdx > 0 ? 0 : 2, { x: e.clientX, y: e.clientY });
  });
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && zoomIdx === 0) return;
    e.preventDefault();
    if (e.ctrlKey) setZoom(zoomIdx + (e.deltaY < 0 ? 1 : -1), { x: e.clientX, y: e.clientY });
    else { pan.x -= e.deltaX; pan.y -= e.deltaY; applyTransform(); }
  }, { passive: false });

  // geser saat diperbesar (mouse & sentuh)
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (zoomIdx === 0 || e.target.closest('.nav')) return;
    drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pan.x = drag.px + (e.clientX - drag.x);
    pan.y = drag.py + (e.clientY - drag.y);
    applyTransform();
  });
  ['pointerup', 'pointercancel'].forEach((t) => stage.addEventListener(t, () => { drag = null; }));

  // ---------------------------------------------------------- thumbnails
  function buildThumbs() {
    const box = $('thumbs');
    box.innerHTML = '';
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const i = +en.target.dataset.i;
        pdf.getPage(i + 1).then((page) => {
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 240 / base.width });
          const c = en.target.querySelector('canvas');
          c.width = vp.width; c.height = vp.height;
          return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        }).catch(() => {});
      });
    }, { root: box, rootMargin: '200px' });

    for (let i = 0; i < pdf.numPages; i++) {
      const t = document.createElement('button');
      t.className = 'thumb';
      t.dataset.i = i;
      t.style.aspectRatio = ratio;
      t.innerHTML = '<canvas></canvas><span>' + (i + 1) + '</span>';
      t.onclick = () => goTo(i);
      box.appendChild(t);
      io.observe(t);
    }
  }
  $('btnThumbs').onclick = () => {
    $('thumbs').hidden = !$('thumbs').hidden;
    document.body.classList.toggle('thumbs-open', !$('thumbs').hidden);
    setTimeout(() => layout(), 50);
    if (pageFlip) onPageChange(pageFlip.getCurrentPageIndex());
  };

  // ---------------------------------------------------------- fullscreen
  function toggleFullscreen() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    }
  }
  $('btnFull').onclick = toggleFullscreen;

  // ---------------------------------------------------------------- share
  $('btnShare').onclick = () => {
    const url = new URL(location.href);
    url.hash = pageFlip ? 'p=' + (pageFlip.getCurrentPageIndex() + 1) : '';
    const link = pdfUrl ? url.toString() : location.href.split('#')[0];
    $('shareLink').value = link;
    $('shareEmbed').value = '<iframe src="' + link.split('#')[0] + '" width="100%" height="600" style="border:0" allowfullscreen></iframe>';
    if (!pdfUrl) $('shareLink').value = 'PDF lokal tidak bisa dibagikan — unggah ke folder pdfs/ terlebih dahulu.';
    $('shareDialog').showModal();
  };
  const copy = (id, btn) => {
    const el = $(id);
    el.select();
    (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).catch(() => document.execCommand('copy'));
    const old = btn.textContent; btn.textContent = 'Tersalin ✓'; setTimeout(() => (btn.textContent = old), 1500);
  };
  $('copyLink').onclick = (e) => copy('shareLink', e.target);
  $('copyEmbed').onclick = (e) => copy('shareEmbed', e.target);

  // ---------------------------------------------------------------- sound
  let audioCtx = null;
  function playFlip() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const len = audioCtx.sampleRate * 0.35;
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2) * Math.sin(Math.PI * Math.min(1, t * 6));
      }
      const src = audioCtx.createBufferSource();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 2200; filter.Q.value = 0.6;
      const gain = audioCtx.createGain(); gain.gain.value = 0.25;
      src.buffer = buf;
      src.connect(filter).connect(gain).connect(audioCtx.destination);
      src.start();
    } catch (e) { /* audio tidak didukung */ }
  }
  function updateSoundIcon() {
    $('btnSound').innerHTML = soundOn ? '&#128264;' : '&#128263;';
    $('btnSound').title = soundOn ? 'Matikan suara' : 'Nyalakan suara';
  }
  $('btnSound').onclick = () => {
    soundOn = !soundOn;
    localStorage.setItem('fb-sound', soundOn ? 'on' : 'off');
    updateSoundIcon();
  };

  // ------------------------------------------------------ local pdf (drop)
  function showDropScreen() {
    $('loader').hidden = true;
    $('dropScreen').hidden = false;
    setTitle('Buka PDF');
  }
  function openLocal(file) {
    if (!file || !/pdf$/i.test(file.type || file.name)) return alert('Pilih file PDF.');
    if (pageFlip) return location.reload();
    file.arrayBuffer().then((buf) => openPdf({ data: new Uint8Array(buf) }, fileNameToTitle(file.name))).catch(fail);
  }
  $('fileInput').addEventListener('change', (e) => openLocal(e.target.files[0]));
  ['dragover', 'dragenter'].forEach((t) => document.addEventListener(t, (e) => {
    e.preventDefault();
    $('dropBox').classList.add('over');
  }));
  document.addEventListener('dragleave', () => $('dropBox').classList.remove('over'));
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    $('dropBox').classList.remove('over');
    if (!pageFlip) openLocal(e.dataTransfer.files[0]);
  });

  // --------------------------------------------------------------- utils
  function fileNameToTitle(path) {
    const name = decodeURIComponent(String(path).split('/').pop().split('?')[0]).replace(/\.pdf$/i, '');
    return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function fail(err) {
    console.error(err);
    $('loader').hidden = false;
    $('loader').querySelector('.spinner').hidden = true;
    $('loaderBar').parentElement.hidden = true;
    $('loaderText').innerHTML = 'Gagal membuka PDF.<br><small>' + escapeHtml(err && err.message || String(err)) + '</small>';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
