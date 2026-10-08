# Ember Trio v2

**Idea.** Today's three linked stars become a small constellation: a gold star, a larger pale teal star and a white star that is the largest, joined in an uneven triangle. The tile is filled edge to edge with dusty gas, salmon folding through slate into teal, with a touch of cream-gold in one corner.

**At 16 px.** One diagonal gradient (salmon, slate lane, teal) fills the whole tile, so the tile shape holds on a dark bar. The triangle is a full-strength 1 px star-white line with no glow under it; the slate lane runs under the middle of the triangle so the lines sit on the darkest gas. Stars are r 1.5, r 2 and r 2.5 with hard edges, no bloom. The lines are diagonal, so they are anti-aliased, not pixel-crisp, but they hold at true size.

**Tile.** Opaque gas-filled rounded tile, no black sky. Checked on light and dark strips.

**Weaknesses.** With no black in it the tile is closer to a soft gradient app tile than to the night sky; the marbling only appears at 180 px (`feTurbulence` dust, phone icon only). The gold star on salmon gas has the least contrast of the three. Three linked dots still carry some "graph" reading, though unequal sizes and colours and the closed triangle move it away from the share glyph.
