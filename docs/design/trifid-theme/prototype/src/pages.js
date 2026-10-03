/* Screens over the map: Home (two variants), About, 404. And the phone pieces: the search sheet, the
 * Map / List button and the map strip under the album list. Markup and copy follow the app. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, COPY = RMR.COPY, T = RMR.TEXT;
  const Pages = (RMR.Pages = {});
  const $ = (id) => document.getElementById(id);
  let homeKey = '', stripKey = '';

  const startRegions = (n) => RMR.Regions.named().filter((r) => r.strong && r.name).sort((a, b) => b.priority - a.priority).slice(0, n);
  const regionLink = (r) => `<a class="start-r" href="${RMR.href({ name: 'map', region: r.id })}" style="--lc:${r.ink}"><b>${U.esc(r.display)}</b><span>${U.esc(RMR.Regions.plain(r))}</span></a>`;
  /** Four starting points: the best region of each of four different families, left to right as they sit on the map. */
  const fourFamilies = () => { const seen = new Set(), out = []; for (const r of startRegions(99)) { if (r.lead < 0 || seen.has(r.lead)) continue; seen.add(r.lead); out.push(r); if (out.length === 4) break; } return out.sort((a, b) => a.wx - b.wx); };

  /** Home: the app's hero and cover shelf; one quiet line of regions as starting points (variant a),
   * or the regions in place of the shelf (variant b, home=b). */
  function home() {
    const S = RMR.S, D = RMR.D, el = $('home'), b = S.proto.home === 'b', key = RMR.href({ name: 'map' }) + (b ? 'b' : 'a');   // links carry the stop and the prototype switches, so they are rebuilt when those change
    if (key === homeKey) return; homeKey = key;
    const shelf = []; for (let i = 0; i < D.n && shelf.length < 24; i++) shelf.push(i);
    el.innerHTML = `<div class="hero">
        <h1 id="home-h" tabindex="-1">${COPY.hero}</h1>
        <p class="lede">${COPY.heroSub}</p>
        ${RMR.Search.html('hero')}
        <div class="hero-row"><a class="textbtn u" data-to="map" href="${RMR.href({ name: 'map' })}"><span>${COPY.homeExplore}</span></a><span class="dot" aria-hidden="true"></span><button type="button" class="textbtn" id="surprise"><span>${COPY.surprise}</span></button></div>
        ${b ? '' : `<p class="starts"><span class="cap">${T.homeRegions}</span>${fourFamilies().map(regionLink).join('')}</p>`}
      </div>
      ${b ? `<div class="shelf shelf--regions"><p class="shelf-now"><span class="cap">${T.homeRegions}</span></p><ul class="places">${startRegions(8).map((r) => `<li><a href="${RMR.href({ name: 'map', region: r.id })}">${RMR.Regions.dot(r)}<span class="pl-n" style="color:${r.ink}">${U.esc(r.display)}</span><span class="pl-p">${U.esc(RMR.Regions.tagLine(r))}</span></a></li>`).join('')}</ul></div>`
        : `<div class="shelf"><p class="shelf-now" aria-hidden="true" id="shelf-now"><span class="cap">${COPY.shelfLabel}</span></p>
        <ul class="mosaic" aria-label="${COPY.shelfListLabel}">${shelf.map((i) => `<li><a href="${RMR.href({ name: 'album', slug: D.album(i).slug })}" data-i="${i}" aria-label="${U.esc(COPY.albumLabel(D.album(i).t, D.album(i).a))}">${U.cover(i, 110, 'fluid')}</a></li>`).join('')}</ul></div>`}`;
    RMR.Search.attach(el.querySelector('.combo'));
    $('surprise').addEventListener('click', () => RMR.go({ name: 'album', slug: D.album(Math.floor(Math.random() * window.RMR_DATA.n)).slug }));
    const now = $('shelf-now'), idle = now && now.innerHTML;
    if (now) {
      const show = (e) => { const a = e.target.closest('a[data-i]'); if (a) { const x = D.album(Number(a.dataset.i)); now.innerHTML = `<span class="t">${U.esc(x.t)}</span><span class="a">${U.esc(x.a)}</span>`; } };
      const ul = el.querySelector('.mosaic'); ul.addEventListener('mouseover', show); ul.addEventListener('focusin', show);
      ul.addEventListener('mouseleave', () => (now.innerHTML = idle)); ul.addEventListener('focusout', (e) => { if (!ul.contains(e.relatedTarget)) now.innerHTML = idle; });
    }
  }

  function about() {
    const el = $('about'); if (el.firstChild) return;
    const legend = T.legend.map(([colour, word, j], n) => T.legendPart(`<b style="color:${U.rgb(U.lighten(C.FAM[j], 0.3))}">${colour}</b>`, word, n === 0)).join(', ') + '.';
    const sec = (h, ps) => `<section><h2 class="cap about-h2">${h}</h2>${ps.map((p) => `<p>${p}</p>`).join('')}</section>`;
    el.innerHTML = `<article class="about" aria-labelledby="about-h">
      <a class="x" data-to="map" href="${RMR.href({ name: 'map' })}" id="about-x" aria-label="${COPY.aboutClose}">${U.icon('x', 1.6)}</a>
      <h1 id="about-h" tabindex="-1">${COPY.aboutTitle}</h1><p>${COPY.aboutIntro}</p>
      ${COPY.aboutSections.map((s) => sec(s.heading, s.body)).join('')}
      ${sec(T.aboutReading.heading, [legend].concat(T.aboutReading.body, [T.aboutStars]))}
      <p class="about-signoff">${COPY.aboutSignoff}</p><p class="about-credits">${COPY.aboutCredits}</p></article>`;
    // About closes back to where the visitor was
    $('about-x').addEventListener('click', (e) => { e.preventDefault(); Pages.aboutClose(); });
  }
  /** About closes back to where it was opened from (the close button and Escape); the map when it was loaded directly. */
  Pages.aboutClose = function () { if (RMR.S.prevHash) location.hash = RMR.S.prevHash; else RMR.go({ name: 'map' }); };
  function notFound() {
    const el = $('notfound'); if (el.firstChild) return;
    el.innerHTML = `<div class="notfound-msg"><h1 id="nf-h" tabindex="-1">${COPY.nfHeading}</h1><p class="notfound-sub">${COPY.nfSub}</p></div>
      ${RMR.Search.html('page')}<a class="textbtn u" data-to="map" href="${RMR.href({ name: 'map' })}"><span>${COPY.nfMapLink}</span></a>`;
    RMR.Search.attach(el.querySelector('.combo'));
  }

  /** Show the screen for the current route; the map behind becomes a still backdrop. */
  Pages.show = function () {
    const name = RMR.S.route.name, page = name === 'home' || name === 'about' || name === 'notfound';
    if (name === 'home') home(); if (name === 'about') about(); if (name === 'notfound') notFound();
    $('home').hidden = name !== 'home'; $('about').hidden = name !== 'about'; $('notfound').hidden = name !== 'notfound';
    $('map').dataset.view = name; $('veil').classList.toggle('veil--off', name !== 'home');
    const list = RMR.S.narrow && name === 'album' && !RMR.S.mapMode;   // nothing on the map is reachable behind a page or behind the phone's album list
    for (const id of ['labels', 'pointers', 'ui', 'ov']) $(id).inert = page || list;
    // every static link keeps the current stop and the prototype switches
    document.querySelectorAll('a[data-to]').forEach((a) => a.setAttribute('href', RMR.href({ name: a.dataset.to })));
    $('labels').setAttribute('aria-hidden', String(page));
    document.querySelector('.top').classList.toggle('top--home', name === 'home');
    document.querySelectorAll('.navbtn').forEach((a) => { if (a.dataset.nav === (name === 'about' ? 'about' : name === 'map' || name === 'album' ? 'map' : '')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (RMR.S.started && page) { const h = document.querySelector(name === 'home' ? '#home-h' : name === 'about' ? '#about-h' : '#nf-h'); if (h && name !== 'home') h.focus({ preventScroll: true }); }
  };
  Pages.title = (name) => (name === 'about' ? COPY.aboutNav + ' · recmyrecord' : name === 'notfound' ? COPY.nfTitle + ' · recmyrecord' : 'recmyrecord');

  // ---------- phone ----------
  Pages.sheet = function (open) {
    const el = $('sheet'); if (!el.firstChild) {
      el.innerHTML = `<div class="search-sheet-top">${RMR.Search.html('sheet')}<button type="button" class="icon-btn" aria-label="${COPY.searchClose}" id="sheet-x">${U.icon('x', 1.6)}</button></div>`;
      el._box = RMR.Search.attach(el.querySelector('.combo'), { always: true, onChosen: () => Pages.sheet(false), onEscape: () => Pages.sheet(false) });
      $('sheet-x').addEventListener('click', () => Pages.sheet(false));
    }
    el.hidden = !open; for (const q of ['a.skip', 'header.top', '#main']) document.querySelector(q).inert = open;
    if (open) { el._box.input.value = ''; el._box.input.focus(); el._box.render(); } else $('search-toggle').focus();
  };

  /** The Map / List button (phone, beside an album). */
  Pages.fab = function () {
    const S = RMR.S, fab = $('fab'), on = !!S.mapMode;
    fab.hidden = !(S.narrow && S.route.name === 'album'); if (fab.hidden) return;
    fab.className = 'fab-map' + (on ? ' fab-map--on' : ''); fab.setAttribute('aria-label', on ? COPY.phoneListLabel : COPY.phoneMapLabel);
    fab.innerHTML = `${on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="7" r="2"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="16" r="2"/><path d="M8 7.5l7-1M7 9l3 5.5M16 8l-4 6.5"/></svg>'}<span aria-hidden="true">${on ? COPY.phoneList : COPY.phoneMap}</span>`;
  };

  /** The 220 px map strip under the phone's album list: the same nebula (from the baked gas), stars, white cased
   * lines, covers and badges, with the seed's region named at the top left. Canvas 2D. */
  Pages.stripHTML = () => `<div class="strip"><canvas class="strip-canvas" id="strip" role="img" aria-label="${COPY.preview}"></canvas>
    <button type="button" class="strip-open" data-mapmode><span>${COPY.openMap}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>`;
  /** The phone's album list starts without WebGL: the gas is baked only when the strip scrolls into view (or Map is tapped). */
  let seen = null;
  Pages.watchStrip = function () {
    const el = document.querySelector('.strip'); if (!el || RMR.Gas.ok) return;
    if (!('IntersectionObserver' in window)) return RMR.glStart();
    if (seen) seen.disconnect();
    seen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { seen.disconnect(); seen = null; RMR.glStart(); } }, { rootMargin: '120px' });
    seen.observe(el);
  };
  Pages.strip = function () {
    const S = RMR.S, D = RMR.D, cv = $('strip'); if (!cv || !S.focus || !S.narrow || S.mapMode) return;
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    const key = [S.focus.key, w, h, RMR.Ov.loaded(), RMR.Gas.ok ? 1 : 0].join('|'); if (key === stripKey && cv._drawn) return; stripKey = key; cv._drawn = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = D.pos[S.stop], ids = [S.focus.seed].concat(S.focus.recs);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const i of ids) { x0 = Math.min(x0, P[2 * i]); x1 = Math.max(x1, P[2 * i]); y0 = Math.min(y0, P[2 * i + 1]); y1 = Math.max(y1, P[2 * i + 1]); }
    const pad = 36, k = Math.min(Math.max(Math.min((w - 2 * pad) / Math.max(x1 - x0, 0.12), (h - 2 * pad) / Math.max(y1 - y0, 0.12)), Math.min(w, h) / 8), 5000);   // at least 0.12 world units: the neighbourhood, not just the covers
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = (x) => w / 2 + (x - cx) * k, sy = (y) => h / 2 + 10 - (y - cy) * k;   // the group sits a little low, clear of the region name
    // the nebula: the stop's baked gas, drawn from its canvas copy and stepped back as beside an album
    ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, w, h);
    const bk = RMR.Gas.bakedCanvas(S.stop), tx = D.tx;
    if (bk) {
      const n = bk.canvas.width, toPx = (wx, wy) => [((wx / tx.s + tx.cx + bk.half) / (2 * bk.half)) * n, (1 - (wy / tx.s + tx.cy + bk.half) / (2 * bk.half)) * n];
      const a = toPx(cx - w / 2 / k, cy + h / 2 / k), b = toPx(cx + w / 2 / k, cy - h / 2 / k);
      ctx.globalAlpha = 0.62; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bk.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1], 0, 0, w, h); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,250,244,.38)'; ctx.beginPath();
    for (let i = 0; i < D.n; i++) { const x = sx(P[2 * i]), y = sy(P[2 * i + 1]); if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue; ctx.moveTo(x + 0.8, y); ctx.arc(x, y, 0.8, 0, 7); }
    ctx.fill();
    const items = RMR.Focus.layout(ids.map((id) => ({ id, x: sx(P[2 * id]), y: sy(P[2 * id + 1]) })), 8, { seed: 38, rec: 28, minLine: 10, bounds: [8, 26, w - 8, h - 4] });   // covers stay under the region name at the top
    RMR.Ov.focusInto(ctx, items, null, { badge: 16, font: 11 });
    const r = D.regionOf(S.stop, S.focus.seed), two = r ? null : RMR.Regions.between(S.focus.seed);
    if (r || (two && two.length === 2)) {
      ctx.font = '600 13px "Cormorant Garamond", serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const text = (r ? r.display : T.between(two[0].display, two[1].display)).toUpperCase(), ink = r ? r.ink : '#f1ece4'; try { ctx.letterSpacing = '1.9px'; } catch (e) { /* older Safari */ }
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,4,8,.9)'; ctx.strokeText(text, 12, 9, w - 24); ctx.fillStyle = ink; ctx.fillText(text, 12, 9, w - 24);
      try { ctx.letterSpacing = '0px'; } catch (e) { /* older Safari */ }
    }
  };

  Pages.init = function () {
    $('top-combo').innerHTML = RMR.Search.html('page'); RMR.Search.attach($('top-combo').querySelector('.combo'));
    $('search-toggle').addEventListener('click', () => Pages.sheet(true));
    $('fab').addEventListener('click', () => RMR.setMapMode(!RMR.S.mapMode));
  };
})();
