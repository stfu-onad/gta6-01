// Shared tuning numbers for NEON BAY. One place for every magic number the
// other modules need, so balancing the game means editing this file only.
export const CITY = {
  blocks: 7,          // blocks per side
  block: 48,          // block edge length
  road: 14,           // road width
  get pitch() { return this.block + this.road; },
  get half() { return (this.blocks * this.pitch + this.road) / 2; },
  // Road centre lines, one per grid line (blocks + 1 lines).
  roadLines() {
    const lines = [];
    const start = -((this.blocks * this.pitch) / 2);
    for (let i = 0; i <= this.blocks; i += 1) lines.push(start + i * this.pitch);
    return lines;
  },
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 8.5,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 34,
  maxReverse: 10,
  turnRate: 1.9,
  grip: 6,
};

export const WANTED = {
  decayDelay: 14,     // seconds without crime before stars start falling
  decayStep: 9,       // seconds per star lost while hidden
  maxStars: 5,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 90,
  pistolMag: 12,
  punchDamage: 12,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const SAVE_KEY = 'neonbay-save-v1';
export const MISSION_REWARDS = [300, 500, 700, 1200, 2500];
