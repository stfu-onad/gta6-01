// Combat: fists up close, a pistol with raycast hits, muzzle flash, tracer
// sparks, and car explosions that hurt everything nearby. Hits on cops and
// bystanders raise the wanted level; a car at 0 HP blows up.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { flatDist } from './random.js';

export function createCombat(scene) {
  // Pooled spark particles (small glowing boxes that fly and fade).
  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  for (let i = 0; i < 90; i += 1) {
    const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  // Muzzle flash light + a short-lived tracer line.
  const flash = new THREE.PointLight(0xffc860, 0, 14);
  scene.add(flash);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  scene.add(tracer);
  return {
    scene, sparks, flash, tracer,
    flashTimer: 0,
    tracerTimer: 0,
    explosions: [], // expanding fireballs, purely visual
  };
}

function spawnSparks(combat, origin, count, speed, color) {
  let made = 0;
  for (const s of combat.sparks) {
    if (made >= count) break;
    if (s.life > 0) continue;
    s.life = 0.5;
    s.mesh.visible = true;
    s.mesh.position.copy(origin);
    s.mesh.material.color.setHex(color);
    s.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
    made += 1;
  }
}

function addExplosion(combat, pos) {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.9 }),
  );
  ball.position.copy(pos);
  ball.position.y = 1;
  combat.scene.add(ball);
  combat.explosions.push({ mesh: ball, life: 0.6, max: 0.6 });
  spawnSparks(combat, pos, 26, 14, 0xff5a1e);
  spawnSparks(combat, pos, 12, 8, 0x333333);
}

export function stepCombat(combat, dt) {
  for (const s of combat.sparks) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.mesh.position.addScaledVector(s.vel, dt);
    s.vel.y -= 12 * dt;
    s.mesh.position.y = Math.max(0.08, s.mesh.position.y);
  }
  if (combat.flashTimer > 0) {
    combat.flashTimer -= dt;
    combat.flash.intensity = combat.flashTimer > 0 ? 26 : 0;
  }
  if (combat.tracerTimer > 0) {
    combat.tracerTimer -= dt;
    combat.tracer.material.opacity = Math.max(0, combat.tracerTimer * 4);
  }
  for (let i = combat.explosions.length - 1; i >= 0; i -= 1) {
    const e = combat.explosions[i];
    e.life -= dt;
    const t = 1 - e.life / e.max;
    e.mesh.scale.setScalar(1 + t * 9);
    e.mesh.material.opacity = Math.max(0, 0.9 * (1 - t));
    if (e.life <= 0) {
      combat.scene.remove(e.mesh);
      combat.explosions.splice(i, 1);
    }
  }
}

/**
 * Fire the pistol from `origin` along `dir`. Raycasts against officers,
 * pedestrians and cars; returns a report for the game to score and react to.
 * `targets` is [{pos: Vector3, radius, hp, kind, ref}].
 */
export function firePistol(combat, origin, dir, targets) {
  const ray = new THREE.Raycaster(origin, dir, 0.1, COMBAT.pistolRange);
  let best = null;
  let bestDist = COMBAT.pistolRange;
  for (const t of targets) {
    const to = new THREE.Vector3().subVectors(t.pos, origin);
    const along = to.dot(dir);
    if (along < 0 || along > bestDist) continue;
    const perp = to.addScaledVector(dir, -along).length();
    if (perp < t.radius && along < bestDist) {
      best = t;
      bestDist = along;
    }
  }
  const end = origin.clone().addScaledVector(dir, best ? bestDist : COMBAT.pistolRange);
  combat.flash.position.copy(origin);
  combat.flashTimer = 0.06;
  combat.tracer.geometry.setFromPoints([origin, end]);
  combat.tracerTimer = 0.09;
  if (best) {
    best.hp -= COMBAT.pistolDamage;
    spawnSparks(combat, end, 8, 7, 0xff3a3a);
    return { hit: best, end, killed: best.hp <= 0 };
  }
  spawnSparks(combat, end, 3, 4, 0xaaaaaa);
  return { hit: null, end, killed: false };
}

/** Blow a car up: fireball, damage to nearby people, and a wreck flag. */
export function explodeCar(combat, car, hurt) {
  const pos = car.mesh.position.clone();
  addExplosion(combat, pos);
  car.dead = true;
  car.hp = 0;
  // Scorch the wreck: tilt it and darken it.
  car.mesh.rotation.z = 0.35;
  hurt(pos, 14);
}
