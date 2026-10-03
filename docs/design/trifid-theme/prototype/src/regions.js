/* Regions as data and as navigation: evidence sentences, neighbours, "In ..." lines, the region card. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const Regions = (RMR.Regions = {});
  const T = RMR.TEXT;

  Regions.current = () => RMR.D.regions[RMR.S.stop].list;
  Regions.get = (id, stop) => RMR.D.regions[stop || RMR.S.stop].byId.get(id) || null;
  Regions.named = (stop) => RMR.D.regions[stop || RMR.S.stop].list.filter((r) => r.level !== 0);

  Regions.evidence = function (r) {
    const e = r.evidence || {};
    if (e.word) return T.evidenceWord(Math.round(e.coverage * 100), U.esc(e.word), Math.round(e.overall * 100));
    if (e.feature === 'liveness' && e.z > 0) return T.evidenceLive;
    if (e.feature === 'loudness' && e.z < 0) return T.evidenceQuiet;
    return T.evidenceAudio(e.z > 0 ? 'higher' : 'lower', U.esc(e.feature || ''));
  };
  Regions.evidenceText = (r) => Regions.evidence(r).replace(/<[^>]+>/g, '');
  /** Hover line under a name: the evidence, then the family tag, so colour and name read as one system. */
  Regions.evidenceTagged = (r) => `${Regions.evidence(r)} <i class="ev-tag">${U.esc(Regions.famTag(r))}</i>`;

  /** Up to k nearest other regions by centre distance. */
  Regions.neighbours = function (r, k) {
    return Regions.named(r.stop).filter((o) => o !== r).map((o) => [Math.hypot(o.wx - r.wx, o.wy - r.wy), o]).sort((a, b) => a[0] - b[0]).slice(0, k || 3).map((q) => q[1]);
  };
  /** The two regions an unnamed album sits between: nearest by distance to the region's edge. */
  Regions.between = function (i) {
    const P = RMR.D.pos[RMR.S.stop], x = P[2 * i], y = P[2 * i + 1];
    return Regions.named().map((o) => [hullDist(o, x, y), o]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((q) => q[1]);
  };
  /** Distance from a world point to a region's hull (0 inside); centre distance less radius when there is no hull. */
  function hullDist(o, x, y) {
    const h = o.hullW; if (!h || h.length < 3) return Math.max(0, Math.hypot(o.wx - x, o.wy - y) - o.wr);
    if (inHull(h, x, y)) return 0; let best = Infinity;
    for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
      const ax = h[j][0], ay = h[j][1], dx = h[i][0] - ax, dy = h[i][1] - ay, t = U.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return best;
  }
  /** A region's plain words, cleaned: no raw feature names ("high danceability" reads "danceable"), and never a word
   * that is already shown beside them (the family word when the tag is written first; the name itself when the region
   * has no place name and its label is that same word). Returns an array. */
  Regions.plainWords = function (r, withTag) {
    const seen = new Set(); if (withTag && r.lead >= 0) seen.add(T.famWords[r.lead]); if (!r.name) seen.add(String(r.display).toLowerCase());
    const out = [];
    for (let w of String(r.plain || '').split(' · ')) {
      const m = /^(high|low) (\w+)$/.exec(w); if (m) { const a = T.audioWords[m[2] + (m[1] === 'high' ? '+' : '-')]; if (a) w = a.toLowerCase(); }
      const k = w.toLowerCase(); if (!w || seen.has(k)) continue; seen.add(k); out.push(w);
    }
    return out;
  };
  Regions.plain = (r) => Regions.plainWords(r, false).join(' · ');
  /** Family tag and plain words in one line, no word twice: "Gold · warm · rhythmic". */
  Regions.tagLine = (r) => [Regions.famTag(r)].concat(Regions.plainWords(r, true)).join(' · ');
  function inHull(h, x, y) { let c = false; for (let i = 0, j = h.length - 1; i < h.length; j = i++) if ((h[i][1] > y) !== (h[j][1] > y) && x < ((h[j][0] - h[i][0]) * (y - h[i][1])) / (h[j][1] - h[i][1]) + h[i][0]) c = !c; return c; }
  /** The named region whose hull holds a world point (the smallest when hulls overlap), or null. */
  Regions.at = function (x, y) {
    let best = null;
    for (const r of Regions.named()) if (r.hullW.length > 2 && inHull(r.hullW, x, y) && (!best || r.wr < best.wr)) best = r;
    return best;
  };

  // the dot is one of the five family hues (the leading family), or absent when no family leads; the family is always written too
  const dot = (r) => (r.lead >= 0 ? `<i class="fam-dot" style="background:${U.rgb(C.FAM[r.lead])}"></i>` : '<i class="fam-dot fam-dot--none"></i>');
  Regions.famTag = (r) => (r.lead >= 0 ? `${T.famNames[r.lead]} · ${T.famWords[r.lead]}` : T.mixed);
  /** Every named region of a stop in one loop (by angle about the map's centre), so Left then Right returns. */
  Regions.ring = function (stop) { const l = Regions.named(stop); let cx = 0, cy = 0; for (const r of l) { cx += r.wx / l.length; cy += r.wy / l.length; } return l.slice().sort((a, b) => Math.atan2(a.wy - cy, a.wx - cx) - Math.atan2(b.wy - cy, b.wx - cx)); };
  Regions.members = function (r, n) { const of = RMR.D.regions[r.stop].of, out = []; for (let i = 0; i < of.length && out.length < n; i++) if (of[i] === r.k) out.push(i); return out; };
  Regions.dot = dot;
  /** The album panel / Explore card line: "IN PLAYFUL WAY", or "Between A and B" for albums in no region. */
  Regions.lineHTML = function (i) {
    const r = RMR.D.regionOf(RMR.S.stop, i);
    // the region card opens on the map while the album stays open
    const here = (id) => RMR.href(RMR.S.route.name === 'album' ? Object.assign({}, RMR.S.route, { region: id }) : { name: 'map', region: id });
    if (r) return `<a class="in-region" href="${here(r.id)}">${dot(r)}<span>${T.inRegion} ${U.esc(r.display)}</span></a>`;
    const two = Regions.between(i); if (two.length < 2) return '';
    const link = (o) => `<a href="${here(o.id)}">${U.esc(o.display)}</a>`;
    return `<span class="in-region in-region--between">${T.between(link(two[0]), link(two[1]))}</span>`;
  };

  /** Camera that shows a region whole. Capped just under the zoom where covers start, so the region still
   * reads as a named place among its neighbours (judgement call; UX.md says "fit its hull with padding"). */
  Regions.camera = function (r, inset) {
    let b = [1e9, 1e9, -1e9, -1e9];
    for (const p of r.hullW) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
    if (!r.hullW.length) b = [r.wx - r.wr, r.wy - r.wr, r.wx + r.wr, r.wy + r.wr];
    // on a phone the region sheet covers the lower half, so the region is framed in what is left above it
    const f = RMR.Cam.free;   // the phone's free rectangle is measured (top row, sheet at its current height, slider)
    return RMR.Cam.fitBox(b, inset, f ? { top: f.top + 26, right: 30, bottom: f.bottom + 26, left: 30 } : { top: 130, right: 110, bottom: 120, left: 110 }, 12.5 / RMR.D.coverWorld);   // lands just inside the band where names still show
  };

  /** Region card: same slot as the Explore card. */
  Regions.cardHTML = function (r) {
    const near = Regions.neighbours(r, 3), best = (r.best_known || []).slice(0, 6), D = RMR.D, all = Regions.members(r, 24);
    const stay = (id) => RMR.href(RMR.S.route.name === 'album' ? Object.assign({}, RMR.S.route, { region: id }) : { name: 'map', region: id });
    const alb = (i) => RMR.href({ name: 'album', slug: D.album(i).slug });
    const plain = Regions.plainWords(r, true).join(' · ');
    return `<div class="card card--region panel is-peek" role="region" aria-labelledby="rc-name" tabindex="-1" data-region="${U.esc(r.id)}">
      ${Regions.grabHTML()}
      <h2 class="rc-name${r.strong ? '' : ' fair'}" id="rc-name" style="color:${r.ink}"><span class="sr-only">${T.regionLabel('')}</span>${U.esc(r.display)}</h2>
      <p class="rc-tag">${dot(r)}${U.esc(Regions.famTag(r))}</p>
      ${plain ? `<p class="rc-plain">${U.esc(plain)}</p>` : ''}
      <p class="rc-ev">${Regions.evidence(r)}</p>
      <div class="rc-full">
      ${best.length ? `<p class="rc-h"><span class="cap">${T.bestKnown}</span><span class="rc-now" aria-hidden="true"></span></p><ul class="rc-best">${best.map((i) => `<li><a href="${alb(i)}" data-t="${U.esc(D.album(i).t)}" aria-label="${U.esc(RMR.COPY.albumLabel(D.album(i).t, D.album(i).a))}">${U.cover(i, 52)}</a></li>`).join('')}</ul>` : ''}
      ${all.length > best.length ? `<button type="button" class="textbtn u rc-more" data-more aria-expanded="false"><span>${T.showAlbums}</span></button>
      <ol class="rc-all" hidden>${all.map((i) => `<li><a href="${alb(i)}">${U.cover(i, 36)}<span><b>${U.esc(D.album(i).t)}</b>${U.esc(D.album(i).a)}</span></a></li>`).join('')}</ol>` : ''}
      ${near.length ? `<p class="rc-next"><span class="cap">${T.nextTo}</span> ${near.map((o) => `<a href="${stay(o.id)}">${U.esc(o.display)}</a>`).join('<span class="sep">,</span> ')}</p>` : ''}
      </div>
      <button type="button" class="rc-copy" data-copy aria-label="${T.regionCopy}">${U.icon('link')}</button>
      <button type="button" class="x" aria-label="${T.regionClose}" data-close>${U.icon('x')}</button>
    </div>`;
  };
  /** The phone sheet's grabber: a real button that switches between the peek and the full height (hidden on desktop). */
  Regions.grabHTML = () => `<button type="button" class="sheet-grab" data-grab aria-expanded="false" aria-label="${T.sheetMore}"><i aria-hidden="true"></i></button>`;
})();
