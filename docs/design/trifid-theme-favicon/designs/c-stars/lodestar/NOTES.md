# Lodestar

**Idea.** One bright star, the album you start from, with a halo of gas that runs warm (red-orange, gold) on one side and cool (teal, blue) on the other. Thin diffraction spikes of unequal length make it a telescope star and not a sparkle.

**At 16 px.** Dark rounded tile, a 5 px white core, 1 px spikes on the pixel grid (14 px tall, 10 px wide), and the halo as two colour areas split on the diagonal. Reads clearly as a glowing point on a warm-to-cool disc; the strongest of the three at tab size.

**Tile.** Dark rounded tile; the halo fills it almost to the corners so it does not read as a dark circle. Fine on both tab bars.

**Weaknesses.** A first draft with a concave four-point star looked like the generic "AI sparkle"; the round core and thin spikes fix most of that, but a white cross on colour can still be read as a compass or a flash. The diagonal warm/cool split is a gradient, so it is less "swirling gas" than the map until the 180 px size, where `feTurbulence` warps it.
