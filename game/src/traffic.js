// Street life: NPC cars that cruise the road grid and turn at intersections,
// and pedestrians who stroll the sidewalks and run when shots or blasts go
// off nearby. Both are cheap, procedural, and keep the city feeling alive.
import * as THREE from 'three';
import { CITY } from './config.js';
import { clamp, flatDist } from './random.js';
import { createCar, driveCar } from './vehicles.js';

const PED_SHIRTS = [0xd83a2e, 0x2e6bd8, 0xe8c832, 0x2ed8a0, 0x8a2ed8, 0xff7a3d, 0xdddddd, 0x3a3a3a];
const PED_SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf0c8a0];

function makePedMesh(rand) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rand.pick(PED_SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rand.pick(PED_SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: rand.pick([0x222244, 0x333333, 0x444455]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.65; head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), shirt);
  armL.position.set(-0.36, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.36; g.add(armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function createTraffic(scene, seed, roadLines, buildings, rand) {
  const cars = [];
  const peds = [];
  const half = CITY.half;

  // Parked cars along the roads.
  for (let i = 0; i < 14; i += 1) {
    const line = rand.pick(roadLines);
    const along = rand.range(-half + 20, half - 20);
    const side = rand.chance(0.5) ? 1 : -1;
    const horizontal = rand.chance(0.5);
    const x = horizontal ? along : line + side * (CITY.road / 2 - 1.6);
    const z = horizontal ? line + side * (CITY.road / 2 - 1.6) : along;
    const car = createCar(scene, x, z, horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      rand.pick(['sedan', 'sport', 'taxi', 'van']), rand.pick([0xd83a2e, 0x2e6bd8, 0xe8c832, 0x2ed8a0, 0xd8d8d8, 0x222226]));
    car.driver = null;
    cars.push(car);
  }

  // Moving traffic cars: each follows one road line, turns at intersections.
  for (let i = 0; i < 10; i += 1) {
    const line = rand.pick(roadLines);
    const horizontal = rand.chance(0.5);
    const dir = rand.chance(0.5) ? 1 : -1;
    const lane = (rand.chance(0.5) ? 1 : -1) * 2.2;
    const x = horizontal ? rand.range(-half + 20, half - 20) : line + lane;
    const z = horizontal ? line + lane : rand.range(-half + 20, half - 20);
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(scene, x, z, heading, rand.pick(['sedan', 'sport', 'taxi', 'van', 'truck']),
      rand.pick([0xd83a2e, 0x2e6bd8, 0xe8c832, 0x2ed8a0, 0x8a2ed8, 0xd8d8d8]));
    car.driver = 'npc';
    car.cruise = rand.range(9, 15);
    car.horizontal = horizontal;
    car.line = line;
    car.lane = lane;
    cars.push(car);
  }

  // Pedestrians on the sidewalks.
  for (let i = 0; i < 18; i += 1) {
    const mesh = makePedMesh(rand);
    const line = rand.pick(roadLines);
    const horizontal = rand.chance(0.5);
    const side = (rand.chance(0.5) ? 1 : -1) * (CITY.road / 2 + 2.5);
    const along = rand.range(-half + 10, half - 10);
    const x = horizontal ? along : line + side;
    const z = horizontal ? line + side : along;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh,
      horizontal,
      line,
      side,
      along,
      dir: rand.chance(0.5) ? 1 : -1,
      speed: rand.range(1.2, 2.2),
      walkPhase: rand.range(0, 6),
      flee: 0, // seconds left of running away
      hp: 50,
    });
  }

  return { cars, peds };
}

/** Steer one traffic car along the grid; it turns at intersections. */
function stepTrafficCar(car, dt, rand, roadLines) {
  const pos = car.mesh.position;
  const half = CITY.half;
  const speed = car.cruise;
  const ahead = car.horizontal
    ? (Math.sin(car.heading) > 0 ? pos.x : -pos.x)
    : (Math.cos(car.heading) > 0 ? pos.z : -pos.z);
  // Near an intersection? Maybe turn onto the crossing road.
  const along = car.horizontal ? pos.x : pos.z;
  let nearLine = null;
  for (const l of roadLines) {
    if (Math.abs(along - l) < 1.2) { nearLine = l; break; }
  }
  if (nearLine !== null && rand.chance(0.012)) {
    car.horizontal = !car.horizontal;
    const newDir = rand.chance(0.5) ? 1 : -1;
    car.heading = car.horizontal
      ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (newDir > 0 ? 0 : Math.PI);
    car.line = nearLine;
    car.lane = (rand.chance(0.5) ? 1 : -1) * 2.2;
  }
  // Keep on its lane.
  if (car.horizontal) pos.z = car.line + car.lane;
  else pos.x = car.line + car.lane;
  // Slow down if another car is right ahead.
  car.speed = speed;
  driveCar(car, 0.5, 0, dt, []);
  car.speed = speed; // driveCar clamps; keep cruise steady
  // Turn around at the city edge.
  if (Math.abs(pos.x) > half + 6 || Math.abs(pos.z) > half + 6) {
    car.heading += Math.PI;
    pos.x = clamp(pos.x, -half - 4, half + 4);
    pos.z = clamp(pos.z, -half - 4, half + 4);
  }
}

export function stepTraffic(traffic, dt, rand, roadLines, danger) {
  for (const car of traffic.cars) {
    if (car.driver !== 'npc' || car.dead) continue;
    stepTrafficCar(car, dt, rand, roadLines);
  }
  for (const ped of traffic.peds) {
    const pos = ped.mesh.position;
    let speed = ped.speed;
    if (ped.flee > 0) {
      ped.flee -= dt;
      speed = 6.5;
    } else if (danger && flatDist(pos.x, pos.z, danger.x, danger.z) < 26) {
      // Shots or blasts nearby: run away from the noise.
      ped.flee = rand.range(2, 4);
      const away = Math.atan2(pos.x - danger.x, pos.z - danger.z);
      ped.horizontal = Math.abs(Math.sin(away)) > Math.abs(Math.cos(away));
      ped.dir = (ped.horizontal ? Math.sin(away) : Math.cos(away)) > 0 ? 1 : -1;
    }
    ped.along += ped.dir * speed * dt;
    if (ped.along > CITY.half - 8 || ped.along < -CITY.half + 8) ped.dir *= -1;
    if (ped.horizontal) { pos.x = ped.along; pos.z = ped.line + ped.side; }
    else { pos.z = ped.along; pos.x = ped.line + ped.side; }
    ped.mesh.rotation.y = ped.horizontal
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? 0 : Math.PI);
    // Walk-cycle swing.
    ped.walkPhase += dt * speed * 2.4;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.userData.armL.rotation.x = -swing * 0.7;
    ped.mesh.userData.armR.rotation.x = swing * 0.7;
  }
}

/** Remove a pedestrian from the scene. */
export function removePed(scene, traffic, ped) {
  scene.remove(ped.mesh);
  const i = traffic.peds.indexOf(ped);
  if (i >= 0) traffic.peds.splice(i, 1);
}
