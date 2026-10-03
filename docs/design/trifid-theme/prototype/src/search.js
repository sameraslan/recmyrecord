/* Search: the app's word-prefix matcher for albums and artists (lib/search.ts, without the typo fallback). */
(function () {
  'use strict';
  const RMR = window.RMR, U = RMR.util, T = RMR.TEXT, COPY = RMR.COPY;
  const Search = (RMR.Search = {});
  const EXTRA = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', "'": '', '’': '', '‘': '', 'ʼ': '' };
  const WORD = /[\p{L}\p{N}]+/gu;
  let index = null, seq = 0; const boxes = [];

  /** Lowercased, accent-free copy with a map back to the original string (for highlights). */
  function fold(s) {
    let text = ''; const map = []; let i = 0;
    for (const ch of s) { const lower = ch.toLowerCase(); const f = EXTRA[lower] != null ? EXTRA[lower] : lower.normalize('NFKD').replace(/\p{M}+/gu, ''); for (let u = 0; u < f.length; u++) { text += f[u]; map.push(i); } i += ch.length; }
    map.push(s.length); return { src: s, text, map };
  }
  const wordsAt = (text) => Array.from(text.matchAll(WORD), (m) => ({ w: m[0], at: m.index }));
  const required = (words) => { const r = words.filter((w) => w !== 'and'); return r.length ? r : words.slice(); };

  function build() {
    const D = RMR.D, R = window.RMR_DATA; index = [];
    for (let i = 0; i < R.n; i++) {
      const t = fold(R.albums[i].t), a = fold(R.albums[i].a), tw = wordsAt(t.text), aw = wordsAt(a.text);
      index.push({ id: i, t, a, tw, aw, tc: tw.map((x) => x.w).filter((w) => w !== 'and').join(' ') });
    }
  }
  const starts = (list, w, need) => { let n = 0; for (const x of list) if (x.w.startsWith(w) && ++n === need) break; return n; };
  // 0 title equals the query, 1 title starts with it, 2 every word in the title, 3 split with the artist, 4 all in the artist
  function tier(e, need, q) {
    let inTitle = 0;
    for (const [w, n] of need) { if (starts(e.tw, w, n) === n) inTitle++; else if (starts(e.aw, w, n) < n) return null; }
    if (e.tc === q) return 0; if (e.tc.startsWith(q)) return 1; if (inTitle === need.size) return 2; return inTitle > 0 ? 3 : 4;
  }
  /** Original string with the matched word prefixes wrapped in <mark>. */
  function mark(f, fw, words) {
    const used = new Set(), found = [];
    for (const w of words) {
      let k = fw.findIndex((x, i) => !used.has(i) && x.w.startsWith(w)); if (k < 0) k = fw.findIndex((x) => x.w.startsWith(w)); if (k < 0) continue;
      used.add(k); found.push([f.map[fw[k].at], f.map[fw[k].at + w.length - 1] + 1]);
    }
    found.sort((a, b) => a[0] - b[0]);
    let out = '', at = 0;
    for (const [s, e] of found) { if (s < at) continue; out += U.esc(f.src.slice(at, s)) + '<mark>' + U.esc(f.src.slice(s, e)) + '</mark>'; at = e; }
    return out + U.esc(f.src.slice(at));
  }

  Search.albums = function (query, limit) {
    if (!index) build();
    const words = wordsAt(fold(query).text).map((x) => x.w); if (!words.length) return [];
    const req = required(words), q = req.join(' '), need = new Map(); for (const w of req) need.set(w, (need.get(w) || 0) + 1);
    const ranked = []; for (const e of index) { const t = tier(e, need, q); if (t !== null) ranked.push([t, e.id]); }
    ranked.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return ranked.slice(0, limit || 6).map(([, id]) => { const e = index[id]; return { id, title: mark(e.t, e.tw, req), artist: mark(e.a, e.aw, req) }; });
  };

  /** Markup of one search box; several live at once (header, Home hero, 404, the phone sheet). */
  Search.html = function (variant) {
    const id = 'combo-' + (++seq);
    return `<div class="combo combo--${variant}"><div class="combo-field">${U.icon('search')}
      <input type="search" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${COPY.searchPlaceholder}" aria-label="${COPY.searchLabel}" aria-describedby="${id}-h">
      ${variant === 'sheet' ? '' : '<span class="kbd" aria-hidden="true">/</span>'}</div>
      <p class="sr-only" id="${id}-h">${COPY.searchHint}</p><p class="sr-only" aria-live="polite"></p>
      <div class="combo-pop" hidden><div role="listbox" id="${id}" aria-label="${COPY.searchList}"></div><p class="combo-empty" hidden></p></div></div>`;
  };

  /** Wire one search box. opts: {onChosen, always (list stays open: the phone sheet)}. */
  Search.attach = function (root, o) {
    o = o || {};
    const input = root.querySelector('input'), pop = root.querySelector('.combo-pop'), list = root.querySelector('[role=listbox]');
    let opts = [], active = -1, open = false;
    const live = root.querySelector('[aria-live]');
    const empty = root.querySelector('.combo-empty');
    function render() {
      const q = input.value.trim(); opts = [];
      if (q) {
        opts = Search.albums(q, 6);
        const none = !opts.length, msg = COPY.searchNoMatches(q);
        empty.hidden = !none; empty.innerHTML = none ? U.esc(COPY.searchNoMatches('\u0000')).replace('\u0000', `<b>${U.esc(q)}</b>`) : '';
        live.textContent = none ? msg : T.searchCount(opts.length);   // the count and "no match" are announced politely
        list.hidden = none; setOpen(true);
        list.innerHTML = opts.map((h, k) => `<div class="opt" role="option" id="${list.id}-${k}" aria-selected="false" data-k="${k}">${U.cover(h.id, 44)}<span class="opt-text"><span class="opt-t">${h.title}</span><span class="opt-a">${h.artist}</span></span></div>`).join('');
      } else { live.textContent = ''; empty.hidden = true; list.innerHTML = ''; setOpen(false); }
      setActive(opts.length ? 0 : -1);
    }
    function setOpen(v) { open = v; pop.hidden = !v; input.setAttribute('aria-expanded', String(v)); if (!v) input.removeAttribute('aria-activedescendant'); }
    function setActive(k) {
      active = k;
      list.querySelectorAll('.opt').forEach((e) => { const on = Number(e.dataset.k) === k; e.setAttribute('aria-selected', String(on)); if (on) { input.setAttribute('aria-activedescendant', e.id); if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); } });
      if (k < 0) input.removeAttribute('aria-activedescendant');
    }
    function choose(k) {
      const c = opts[k]; if (!c) return;
      RMR.S.openerHint = o.opener || input;   // where focus returns when what this opened is closed
      input.value = ''; setOpen(false); input.blur(); if (o.onChosen) o.onChosen();
      RMR.go({ name: 'album', slug: RMR.D.album(c.id).slug });
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    if (!o.always) input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) setOpen(false); }, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) render(); if (opts.length) setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length + (active < 0 && e.key === 'ArrowUp' ? 1 : 0)) % opts.length); }
      else if (e.key === 'Enter') { if (open && active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (o.onEscape) o.onEscape(); else if (open) setOpen(false); else input.blur(); }
    });
    // a tap or click chooses; touchstart is left alone so the list can scroll
    list.addEventListener('mousedown', (e) => { if (e.target.closest('.opt')) e.preventDefault(); });
    list.addEventListener('click', (e) => { const li = e.target.closest('.opt'); if (li) choose(Number(li.dataset.k)); });
    list.addEventListener('mousemove', (e) => { const li = e.target.closest('.opt'); if (li && Number(li.dataset.k) !== active) setActive(Number(li.dataset.k)); });
    const box = { root, input, render, demo: (q) => { input.value = q; input.focus(); render(); } };
    boxes.push(box); return box;
  };

  /** "/" focuses the search box that is on screen (the hero's on Home, the header's elsewhere). */
  Search.init = function () {
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && ((t.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const b = Search.visible(); if (b) { e.preventDefault(); b.input.focus(); }
    });
  };
  // on screen and not visibility:hidden (the header field is hidden on Home); the newest box first
  const isShown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  Search.visible = () => boxes.slice().reverse().find((b) => isShown(b.input)) || null;
  /** For screenshots: open the visible list with a query (hash parameter q=). */
  Search.demo = function (q) { const b = Search.visible(); if (b) b.demo(q); };
})();
