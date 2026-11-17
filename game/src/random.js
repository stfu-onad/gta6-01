// Tiny seeded random generator (mulberry32) plus small helpers, so a given
// seed always builds the same city and the same screenshot scenes.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + this.next() * (max - min); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(list) { return list[Math.floor(this.next() * list.length)]; },
    chance(p) { return this.next() < p; },
  };
}

/** Clamp a value between min and max. */
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

/** Shortest signed angle difference, in radians. */
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance on the ground plane between two points. */
export function flatDist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
