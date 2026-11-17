// Cars: procedural low-poly models (body, cabin, wheels, lights) in several
// body styles and colours, plus the arcade driving model the player and the
// police share. A car is a THREE.Group with a small state record attached.
import * as THREE from 'three';
import { CAR } from './config.js';
import { clamp } from './random.js';

const BODY_COLORS = [
  0xd83a2e, 0x2e6bd8, 0xe8c832, 0x2ed8a0, 0x8a2ed8, 0xd8d8d8,
  0x222226, 0xff7a3d, 0x3dd8e8, 0x7a8a2e, 0xc0c8d0, 0x5e2e8a,
];
const STYLES = ['sedan', 'sport', 'taxi', 'van', 'truck'];

export function makeCarMesh(style, color, isPolice = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0x14161c : color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x0e2233, emissive: 0x0a1a2a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161c });

  const len = style === 'van' || style === 'truck' ? 5.6 : style === 'sport' ? 4.4 : 4.8;
  const wid = 2.0;
  const bodyH = style === 'van' ? 1.5 : 0.85;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);

  if (style !== 'truck') {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.86, style === 'van' ? 0.9 : 0.7, len * (style === 'van' ? 0.72 : 0.46)),
      style === 'van' ? paint : glass,
    );
    cabin.position.set(0, 0.75 + bodyH / 2 + (style === 'van' ? 0.45 : 0.35), style === 'van' ? 0.2 : -0.2);
    cabin.castShadow = true;
    g.add(cabin);
  } else {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.92, 0.7, len * 0.5), dark);
    bed.position.set(0, 1.15, -len * 0.22);
    g.add(bed);
  }

  if (style === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.08, 0.4), dark);
    spoiler.position.set(0, 1.45, -len / 2 + 0.25);
    g.add(spoiler);
  }
  if (style === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0xffd23e }));
    sign.position.set(0, 1.75, 0);
    g.add(sign);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }

  // Headlights + taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), headMat);
    h.position.set(s * 0.65, 0.8, len / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), tailMat);
    t.position.set(s * 0.65, 0.85, -len / 2 - 0.02);
    g.add(t);
  }

  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaa0000 }));
    bar.position.set(0, 1.75, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.3, len * 0.9),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    stripe.position.y = 0.75;
    g.add(stripe);
  }

  g.userData.wheels = wheels;
  g.userData.length = len;
  return g;
}

export function createCar(scene, x, z, heading, style, color, isPolice = false) {
  const mesh = makeCarMesh(style, color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, style, isPolice,
    speed: 0,
    heading,
    hp: 100,
    dead: false,
    driver: null, // 'player' | 'npc' | 'police' | null (parked)
    steerVisual: 0,
  };
}

/** Arcade drive step: throttle/brake/steer in [-1, 1], dt seconds. */
export function driveCar(car, throttle, steer, dt, buildings) {
  if (car.dead) return;
  const accel = throttle > 0 ? CAR.accel * throttle : CAR.brake * throttle;
  car.speed += accel * dt;
  if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const turn = steer * CAR.turnRate * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.heading += turn * dt;
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  // Simple building collision: stop at the wall instead of passing through.
  let blocked = false;
  for (const b of buildings) {
    if (Math.abs(nx - b.x) < b.hw + 1.1 && Math.abs(nz - b.z) < b.hd + 1.1) { blocked = true; break; }
  }
  if (!blocked) {
    car.mesh.position.x = nx;
    car.mesh.position.z = nz;
  } else {
    car.speed *= 0.4;
  }
  car.mesh.rotation.y = car.heading;
  // Wheel spin + a little body roll for feel.
  const spin = (car.speed * dt) / 0.38;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  car.mesh.rotation.z = -steer * clamp(Math.abs(car.speed) / 30, 0, 1) * 0.04;
}

/** Remove a car from the scene and the world list. */
export function removeCar(scene, cars, car) {
  scene.remove(car.mesh);
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
}
