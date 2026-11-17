// The wanted system: stars rise with crime and fall when the player hides.
// Bay Police cars chase and ram; on foot, officers chase and try to bust
// the player. Police lose the player when they get far enough away.
import * as THREE from 'three';
import { CITY, WANTED } from './config.js';
import { clamp, flatDist } from './random.js';
import { createCar, driveCar } from './vehicles.js';

export function createPolice(scene) {
  return {
    stars: 0,
    crimeHeat: 0,      // seconds since the last crime
    cars: [],
    officers: [],
    sirenTimer: 0,
    bustTimer: 0,      // how long an officer has stood next to the player
  };
}

/** A crime happened: raise the wanted level by `amount` stars. */
export function addCrime(police, amount) {
  police.stars = clamp(police.stars + amount, 0, WANTED.maxStars);
  police.crimeHeat = 0;
}

/** Pick a spawn point on a road near (x, z), a little way off. */
function spawnPointNear(rand, roadLines, x, z, dist) {
  const line = roadLines[Math.floor(rand.next() * roadLines.length)];
  const angle = rand.range(0, Math.PI * 2);
  const sx = clamp(x + Math.sin(angle) * dist, -CITY.half, CITY.half);
  const sz = clamp(z + Math.cos(angle) * dist, -CITY.half, CITY.half);
  const horizontal = Math.abs(sx - x) > Math.abs(sz - z);
  return { x: sx, z: sz, heading: horizontal ? Math.PI / 2 : 0 };
}

export function stepPolice(police, scene, dt, rand, roadLines, buildings, playerPos, inCar, onBusted, onRam) {
  police.crimeHeat += dt;
  // Wanted decays when the player has been quiet and no police is close.
  if (police.stars > 0 && police.crimeHeat > WANTED.decayDelay) {
    const nearest = police.cars.reduce((m, c) => Math.min(m, flatDist(c.mesh.position.x, c.mesh.position.z, playerPos.x, playerPos.z)), Infinity);
    if (nearest > 70) {
      police.decayAcc = (police.decayAcc || 0) + dt;
      if (police.decayAcc >= WANTED.decayStep) {
        police.stars -= 1;
        police.decayAcc = 0;
      }
    } else police.decayAcc = 0;
  }

  // Keep the right number of units on the street: one car per star, plus
  // foot officers from 2 stars up.
  const wantCars = police.stars >= 1 ? Math.min(police.stars, 4) : 0;
  while (police.cars.length < wantCars) {
    const s = spawnPointNear(rand, roadLines, playerPos.x, playerPos.z, 55);
    const car = createCar(scene, s.x, s.z, s.heading, 'sedan', 0x14161c, true);
    car.driver = 'police';
    police.cars.push(car);
  }
  while (police.cars.length > wantCars) {
    const car = police.cars.pop();
    scene.remove(car.mesh);
  }
  const wantOfficers = police.stars >= 2 ? Math.min(police.stars - 1, 3) : 0;
  while (police.officers.length < wantOfficers) {
    const s = spawnPointNear(rand, roadLines, playerPos.x, playerPos.z, 30);
    const mesh = makeOfficerMesh();
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    police.officers.push({ mesh, hp: 60, speed: 5.2, walkPhase: 0 });
  }
  while (police.officers.length > wantOfficers) {
    const o = police.officers.pop();
    scene.remove(o.mesh);
  }

  // Siren wail every few seconds while wanted.
  if (police.stars > 0) {
    police.sirenTimer -= dt;
    if (police.sirenTimer <= 0) { police.sirenTimer = 2.2; police.sirenDue = true; }
  }

  // Police cars: steer at the player, ram on contact.
  for (const car of police.cars) {
    const pos = car.mesh.position;
    const targetAngle = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
    const diff = ((targetAngle - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = clamp(diff * 1.4, -1, 1);
    const dist = flatDist(pos.x, pos.z, playerPos.x, playerPos.z);
    const throttle = dist > 6 ? 1 : 0.4;
    driveCar(car, throttle, steer, dt, buildings);
    // Flash the light bar.
    const bar = car.mesh.getObjectByName('lightbar');
    if (bar) bar.material.emissive.setHex(Math.floor(performance.now() / 350) % 2 === 0 ? 0xff0000 : 0x0000ff);
    if (dist < 3.2 && !car.dead) onRam(dist);
  }

  // Foot officers: run at the player; standing close for 2 s = busted.
  let officerNear = false;
  for (const o of police.officers) {
    const pos = o.mesh.position;
    const dist = flatDist(pos.x, pos.z, playerPos.x, playerPos.z);
    if (dist > 1.6) {
      const angle = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
      pos.x += Math.sin(angle) * o.speed * dt;
      pos.z += Math.cos(angle) * o.speed * dt;
      o.mesh.rotation.y = angle;
      o.walkPhase += dt * 9;
      o.mesh.userData.legL.rotation.x = Math.sin(o.walkPhase) * 0.6;
      o.mesh.userData.legR.rotation.x = -Math.sin(o.walkPhase) * 0.6;
    } else {
      officerNear = true;
    }
  }
  if (officerNear && !inCar) {
    police.bustTimer += dt;
    if (police.bustTimer > 2) { police.bustTimer = 0; onBusted(); }
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }
}

function makeOfficerMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a5e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), navy);
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x0a0a0a, emissive: 0x111111 }));
  vest.position.y = 1.1;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.66; head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), navy);
  cap.position.y = 1.86;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), navy);
  legL.position.set(-0.14, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), navy);
  armL.position.set(-0.36, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.36; g.add(armR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

/** Clear every police unit (used on busted / mission reset). */
export function clearPolice(scene, police) {
  for (const car of police.cars) scene.remove(car.mesh);
  for (const o of police.officers) scene.remove(o.mesh);
  police.cars = [];
  police.officers = [];
  police.stars = 0;
  police.bustTimer = 0;
}
