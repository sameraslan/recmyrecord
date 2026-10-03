/* Chrome that follows the app: the album panel, the Explore card, the similarity card, the hint,
 * zoom buttons, toast. The app's markup and class names, filled from RMR.D. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, COPY = RMR.COPY, T = RMR.TEXT;
  const UI = (RMR.UI = {});
  const $ = (id) => document.getElementById(id);
  let renderedSeed = -1, renderedKey = '';

  const spotify = (i) => { const s = RMR.D.album(i).s; return s ? `https://open.spotify.com/album/${s}` : null; };
  const wash = (w) => { const a = U.hex(w[0]), b = U.hex(w[1]); return `radial-gradient(60% 70% at 16% 20%, rgba(${a},.85), transparent 72%), radial-gradient(55% 60% at 88% 6%, rgba(${b},.8), transparent 70%)`; };

  /** Album panel for the current route. Re-rendered when the seed, the stop or the list length changes. */
  UI.panel = function () {
    const S = RMR.S, D = RMR.D, el = $('album'), open = S.route.name === 'album' && S.focus;
    el.classList.toggle('is-closed', !open); el.classList.toggle('album--hidden', !!S.mapMode); el.setAttribute('aria-hidden', String(!open || !!S.mapMode)); if (!open) { el.inert = true; return; }
    el.inert = !!S.mapMode;
    const seed = S.focus.seed, key = [seed, S.stop, S.route.more ? 1 : 0, S.trail.join(), S.narrow].join('|');
    if (key === renderedKey) return;
    const a = D.album(seed), tags = D.tags(seed), all = D.recs(S.stop, seed), recs = S.focus.recs, fresh = seed !== renderedSeed;
    renderedKey = key; renderedSeed = seed;
    document.documentElement.style.setProperty('--acc', a.w[2]);
    el.setAttribute('aria-label', COPY.panelLabel(a.t));
    const len = a.t.length > 22 ? 'len-l' : a.t.length > 12 ? 'len-m' : '';
    const sp = spotify(seed), trail = S.trail.slice(-4);
    const trailHTML = trail.length >= 2
      ? `<nav class="trail" aria-label="${COPY.trailNav}"><span class="cap">${COPY.trailLabel}</span><ol>${trail.map((i) => (i === seed ? `<li aria-current="page">${U.esc(D.album(i).t)}</li>` : `<li><a href="${RMR.href({ name: 'album', slug: D.album(i).slug })}">${U.esc(D.album(i).t)}</a></li>`)).join('')}</ol></nav>`
      : '<div class="trail"></div>';
    el.innerHTML = `<div class="amb" aria-hidden="true" style="background:${wash(a.w)}"></div>
      <button type="button" class="album-close" aria-label="${COPY.close}">${U.icon('x', 1.6)}</button>
      <div class="album-scroll"><div class="${fresh ? 'fade-in' : ''}">
        ${trailHTML}
        <div class="seed">
          ${U.cover(seed, 116)}
          <p class="seed-artist">${U.esc(a.a)}</p>
          <h1 class="seed-title ${len}" id="seed-title" tabindex="-1">${U.esc(a.t)}</h1>
          <div class="seed-actions">
            ${sp ? `<a class="btn btn-lamp" href="${sp}" target="_blank" rel="noopener noreferrer">${COPY.openInSpotify}${U.icon('ext')}<span class="sr-only">${COPY.newTab}</span></a>` : ''}
            <button type="button" class="icon-quiet" data-copy aria-label="${COPY.copyLinkLabel}">${U.icon('link')}</button>
          </div>
          ${tags.length ? `<ul class="tags" aria-label="${COPY.tagsLabel}">${tags.map((t) => `<li data-tag="${U.esc(t)}">${U.esc(t)}</li>`).join('')}</ul>` : ''}
        </div>
        <section class="recs"><h2 class="recs-h">${COPY.listHeading}</h2><ol>
          ${recs.map((id, n) => { const r = D.album(id), sh = D.shared(seed, id), rs = spotify(id); return `<li class="rec" data-id="${id}">
            <a class="rec-main" href="${RMR.href({ name: 'album', slug: r.slug })}" aria-label="${U.esc(COPY.rowLabel(r.t, r.a, sh))}">
              <span class="rec-n" aria-hidden="true">${n + 1}</span>${U.cover(id, 60)}
              <span class="rec-text" aria-hidden="true"><span class="rec-title">${U.esc(r.t)}</span><span class="rec-artist">${U.esc(r.a)}</span>${sh.length ? `<span class="rec-shared">${COPY.shares} <span>${U.esc(sh.join(', '))}</span></span>` : ''}</span>
            </a>${rs ? `<a class="rec-sp" href="${rs}" target="_blank" rel="noopener noreferrer" aria-label="${U.esc(COPY.rowSpotify(r.t))}" title="${COPY.openInSpotify}">${U.icon('ext')}</a>` : ''}</li>`; }).join('')}
        </ol>
        ${all.length > C.REC_DEFAULT ? `<button type="button" class="textbtn u show-more" data-more aria-expanded="${!!S.route.more}"><span>${S.route.more ? COPY.showFewer : COPY.showMore}</span></button>` : ''}
        </section>
      </div>${S.narrow ? RMR.Pages.stripHTML() : ''}</div>`;
    el.querySelectorAll('.rec').forEach((li) => {
      const id = Number(li.dataset.id), main = li.querySelector('.rec-main');
      main.addEventListener('mouseenter', () => RMR.setHot(id)); main.addEventListener('focus', () => RMR.setHot(id)); main.addEventListener('blur', () => RMR.setHot(null, id));
    });
    el.querySelector('.recs ol').addEventListener('mouseleave', () => RMR.setHot(null));
    UI.hot();
    if (S.started && fresh) { const t = $('seed-title'); if (t) t.focus({ preventScroll: true }); }   // the title takes focus on every album change
  };
  /** Hot row, lit tags: the album's shared words light up only for the hovered closest album. */
  UI.hot = function () {
    const S = RMR.S, el = $('album'), hot = S.hot != null ? S.hot : (S.focus && S.focus.recs.includes(S.hover) ? S.hover : null);
    el.querySelectorAll('.rec').forEach((li) => li.classList.toggle('hot', Number(li.dataset.id) === hot));
    const lit = hot != null && S.focus ? RMR.D.shared(S.focus.seed, hot) : [];
    el.querySelectorAll('.tags li').forEach((li) => li.classList.toggle('lit', lit.includes(li.dataset.tag)));
  };

  /** Bottom-left slot: the Explore card of a picked album, or nothing. */
  UI.card = function () {
    const S = RMR.S, D = RMR.D, slot = $('card-slot');
    const pick = S.route.name === 'map' && S.pick != null ? S.pick : null, key = pick != null ? 'p:' + S.stop + pick : '';
    if (slot._key === key) return; const was = slot._key; slot._key = key;
    const full = S.force.sheet === 'full' && !S.started;
    if (pick != null) {
      const a = D.album(pick), sp = spotify(pick);
      // on a phone the card is a sheet: the grabber (a real button, hidden on desktop) switches between the peek and the full height
      slot.innerHTML = `<div class="card card--pick panel is-peek" role="region" aria-label="${U.esc(COPY.albumLabel(a.t, a.a))}" tabindex="-1">
        <button type="button" class="sheet-grab" data-grab aria-expanded="false" aria-label="${T.sheetMore}"><i aria-hidden="true"></i></button>${U.cover(pick, 88)}
        <div class="card-text"><p class="t">${U.esc(a.t)}</p><p class="a">${U.esc(a.a)}</p>
        <div class="row"><a class="btn btn-lamp" href="${RMR.href({ name: 'album', slug: a.slug })}">${COPY.cardPrimary}</a>
        ${sp ? `<a class="btn btn-line sheet-full" href="${sp}" target="_blank" rel="noopener noreferrer">${COPY.cardSpotify}${U.icon('ext')}<span class="sr-only">${COPY.newTab}</span></a>` : ''}</div></div>
        <button type="button" class="x" aria-label="${COPY.cardClose}" data-close>${U.icon('x')}</button></div>`;
      if (S.started && S.kbd) slot.firstElementChild.focus({ preventScroll: true });   // opened from the keyboard: focus follows
    } else slot.innerHTML = '';
    const card = slot.firstElementChild;
    if (card) { if (was && S.started) card.style.animation = 'none'; UI.sheet(full, true); }   // one card replacing another does not rise again
  };
  /** The phone's Explore sheet has a peek and a full height; the grabber switches. */
  UI.sheet = function (full, quiet) {
    const card = $('card-slot').firstElementChild; if (!card) return;
    card.classList.toggle('is-peek', !full); const g = card.querySelector('.sheet-grab');
    if (g) { g.setAttribute('aria-expanded', String(!!full)); g.setAttribute('aria-label', full ? T.sheetLess : T.sheetMore); }
    if (!quiet) RMR.relayout();
  };

  /** Phone name plate: the album a first tap landed on, with an Open button; a second tap or the button opens it. */
  UI.plate = function () {
    const S = RMR.S, el = $('plate'), i = S.mapMode ? S.plate : null;
    if (el._i === i) return; el._i = i; el.hidden = i == null; if (i == null) { el.innerHTML = ''; return; }
    const a = RMR.D.album(i);
    el.setAttribute('aria-label', COPY.albumLabel(a.t, a.a));
    el.innerHTML = `${U.cover(i, 48)}<div class="plate-text"><p class="t">${U.esc(a.t)}</p><p class="a">${U.esc(a.a)}</p></div>
      <a class="btn btn-lamp plate-open" href="${RMR.href({ name: 'album', slug: a.slug, view: 'map' })}">${T.plateOpen}</a>
      <button type="button" class="x" aria-label="${T.plateClose}" data-plate-close>${U.icon('x')}</button>`;
  };

  /** Similarity card: the stop, its note, and the range value. */
  UI.slider = function () {
    const S = RMR.S, stop = S.stop, locked = RMR.D.synth;
    $('mode-range').value = String(C.STOPS.indexOf(stop)); $('mode-range').setAttribute('aria-valuetext', COPY.stops[stop]); $('mode-range').disabled = locked;
    // desktop: the range is the control and the three words are pointer shortcuts; phone: the three words are a real radio group
    const group = $('mode-stops'), radio = !!S.narrow;
    if (radio) { group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', COPY.sliderLabel); } else { group.removeAttribute('role'); group.removeAttribute('aria-label'); }
    group.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.stop === stop; b.disabled = locked && !on && b.dataset.stop !== 'balanced';
      if (radio) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on)); b.removeAttribute('aria-pressed'); b.tabIndex = on ? 0 : -1; }
      else { b.removeAttribute('role'); b.removeAttribute('aria-checked'); b.setAttribute('aria-pressed', String(on)); b.tabIndex = -1; }
    });
    $('mode-note').textContent = locked ? T.sliderLocked : T.sliderNotes[stop];
  };

  /** The hint (the app's lines): hidden once covers show or the Explore card takes the corner. */
  UI.hint = function (coverFade, page) {
    const S = RMR.S, el = $('hint'), hide = coverFade > 0 || !!$('card-slot')._key || !!page;
    el.classList.toggle('is-hidden', hide); el.setAttribute('aria-hidden', String(hide));
    const album = S.route.name === 'album';
    if (el._album !== album) { el._album = album; el.textContent = album ? COPY.hintAlbum : COPY.hint; }
  };
  let toastTimer = 0;
  UI.toast = function (msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); };

  /** Hover card: the app's opaque plate with cover, title and artist, beside the pointer's album. */
  UI.tip = function (i, x, y, choose) {
    const tip = $('tip');
    if (i == null) { tip.classList.remove('show'); tip._i = null; return; }
    if (tip._i !== i) { const a = RMR.D.album(i); tip._i = i; tip.innerHTML = `${U.cover(i, 40)}<div class="map-tip-text"><div class="t">${U.esc(a.t)}</div><div class="a">${U.esc(a.a)}</div></div>`; tip._w = tip.offsetWidth; tip._h = tip.offsetHeight; }
    const view = RMR.view, w = tip._w || 200, h = tip._h || 58;
    let tx = x + 16, ty = y - h / 2; if (tx + w > view.W - 8) tx = x - 16 - w; ty = U.clamp(ty, view.hdr + 8, view.H - h - 8);
    if (choose) [tx, ty] = choose(w, h);
    tip.style.transform = `translate(${Math.round(tx)}px,${Math.round(ty)}px)`; tip.classList.add('show');
  };

  UI.init = function () {
    $('album').addEventListener('click', (e) => {
      if (e.target.closest('.album-close')) return RMR.closeAlbum();
      if (e.target.closest('[data-mapmode], .strip-canvas')) return RMR.setMapMode(true);
      if (e.target.closest('[data-more]')) return RMR.go(Object.assign({}, RMR.S.route, { more: !RMR.S.route.more }), true);
      if (e.target.closest('[data-copy]')) {
        const url = location.href;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => UI.toast(COPY.linkCopied), () => UI.toast(COPY.copyFailed(url)));
      }
    });
    $('card-slot').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return RMR.go({ name: 'map' });
      if (e.target.closest('[data-grab]')) { if (grabbed) { grabbed = false; return; } return UI.sheet($('card-slot').firstElementChild.classList.contains('is-peek')); }
    });
    // the grabber also takes a swipe: up for the full height, down for the peek, down again to close
    let grab = null, grabbed = false;
    $('card-slot').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-grab]')) grab = { y: e.clientY }; });
    $('card-slot').addEventListener('pointerup', (e) => {
      if (!grab) return; const dy = e.clientY - grab.y, card = $('card-slot').firstElementChild; grab = null; if (!card || Math.abs(dy) < 24) return;
      grabbed = true; setTimeout(() => (grabbed = false), 400);
      if (dy < 0) UI.sheet(true); else if (!card.classList.contains('is-peek')) UI.sheet(false); else card.querySelector('[data-close]').click();
    });
    $('plate').addEventListener('click', (e) => { if (e.target.closest('[data-plate-close]')) { RMR.setPlate(null); $('ov').focus({ preventScroll: true }); } });
    // the phone's radio group: arrows move and choose, as a native radio group does
    $('mode-stops').addEventListener('keydown', (e) => {
      if ($('mode-stops').getAttribute('role') !== 'radiogroup') return; const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
      e.preventDefault(); const to = C.STOPS[(C.STOPS.indexOf(RMR.S.stop) + d + 3) % 3]; RMR.setStop(to); const b = $('mode-stops').querySelector(`[data-stop="${to}"]`); if (b) b.focus();
    });
    $('mode-range').addEventListener('input', (e) => RMR.setStop(C.STOPS[Number(e.target.value)]));
    document.querySelectorAll('.mode-stops button').forEach((b) => b.addEventListener('click', () => { RMR.setStop(b.dataset.stop); if (!RMR.S.narrow) $('mode-range').focus({ preventScroll: true }); }));
    $('zoom-in').addEventListener('click', () => { RMR.S.focusFramed = false; RMR.Cam.zoomBy(C.ZOOM_STEP, null, null, true); });
    $('zoom-out').addEventListener('click', () => { RMR.S.focusFramed = false; RMR.Cam.zoomBy(1 / C.ZOOM_STEP, null, null, true); });
    $('zoom-fit').addEventListener('click', () => RMR.fit());
    $('explore-here').addEventListener('click', () => { RMR.S.mapCam = null; RMR.closeAlbum(); });   // "Explore this area" stays where the album is; Close returns to where the map was left
  };
})();
