/* Regions as data: the lists per stop and which regions sit near an album. They are only ever shown as names on the map. */
(function () {
  'use strict';
  const RMR = window.RMR, U = RMR.util;
  const Regions = (RMR.Regions = {});

  Regions.current = () => RMR.D.regions[RMR.S.stop].list;
  Regions.named = (stop) => RMR.D.regions[stop || RMR.S.stop].list.filter((r) => r.level !== 0);

  /** Up to k nearest other regions by centre distance. */
  Regions.neighbours = function (r, k) {
    return Regions.named(r.stop).filter((o) => o !== r).map((o) => [Math.hypot(o.wx - r.wx, o.wy - r.wy), o]).sort((a, b) => a[0] - b[0]).slice(0, k || 3).map((q) => q[1]);
  };
  /** The two regions an album in no region sits between: nearest by distance to the region's edge. */
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
  function inHull(h, x, y) { let c = false; for (let i = 0, j = h.length - 1; i < h.length; j = i++) if ((h[i][1] > y) !== (h[j][1] > y) && x < ((h[j][0] - h[i][0]) * (y - h[i][1])) / (h[j][1] - h[i][1]) + h[i][0]) c = !c; return c; }
})();
