// NEON BAY — boot, the fixed-step game loop, the player, the camera, car
// enter/exit, shooting, damage, saving, and the ?shot= screenshot scenes.
// The world itself lives in the other modules; this file wires them together.
import * as THREE from 'three';
import { CITY, PLAYER, COMBAT } from './config.js';
import { createRandom, clamp, angleDiff, flatDist } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { buildCity, collideBuildings } from './city.js';
import { createCar, driveCar } from './vehicles.js';
import { createTraffic, stepTraffic, removePed } from './traffic.js';
import { createPolice, addCrime, stepPolice, clearPolice } from './police.js';
import { createCombat, stepCombat, firePistol, explodeCar } from './combat.js';
import {
  createMissions, stepMissions, missionObjective, missionTimerText, jumpToMission, pointMarker,
} from './missions.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.floor(Math.random() * 4294967296) >>> 0);
const SHOT_MODE = shotName !== null;
const STEP = 1 / 60;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 40, 120);

const rand = createRandom(seed);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();

// ---- world ---------------------------------------------------------------
const city = buildCity(scene, seed);
const traffic = createTraffic(scene, seed, city.roadLines, city.buildings, createRandom(seed + 7));
const police = createPolice(scene);
const combat = createCombat(scene);
const missions = createMissions(scene, createRandom(seed + 13), city.roadLines);

// ---- player --------------------------------------------------------------
function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0e7a6b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), jacket);
  body.position.y = 1.08; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
  head.position.y = 1.7; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.92;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), jeans);
  legL.position.set(-0.15, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.18), jacket);
  armL.position.set(-0.4, 1.08, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 0.85, 0.3);
  gun.visible = false;
  g.add(gun);
  g.userData = { legL, legR, armL, armR, gun };
  return g;
}

const playerMesh = makePlayerMesh();
scene.add(playerMesh);

const player = {
  pos: new THREE.Vector3(city.roadLines[3], 0, city.roadLines[3]),
  vy: 0,
  yaw: 0,           // facing, radians
  camYaw: Math.PI,  // camera orbit
  camPitch: 0.32,
  health: PLAYER.maxHealth,
  onGround: true,
  walkPhase: 0,
  car: null,        // the car the player is driving, or null
  lastDamageAt: -99,
};

const game = {
  screen: 'title', // title | play | pause | over
  cash: 150,
  weapon: 'fists',
  ammo: COMBAT.pistolMag,
  reloadTimer: 0,
  punchTimer: 0,
  clockMinutes: 18 * 60,
  time: 0,
  lastDanger: null,
  dangerTimer: 0,
  ramCooldown: 0,
  saveTimer: 0,
  auto: null,       // shot-mode autopilot: { drive, walkTo }
  won: false,
};

let targetCar = null; // mission 5 gold coupe

// Restore a previous session.
const saved = loadSave();
if (saved) {
  game.cash = typeof saved.cash === 'number' ? saved.cash : game.cash;
  missions.index = Math.min(5, Math.max(0, saved.mission | 0));
  player.health = typeof saved.health === 'number' ? saved.health : player.health;
  if (typeof saved.px === 'number' && typeof saved.pz === 'number') {
    player.pos.set(saved.px, 0, saved.pz);
  }
}

// ---- helpers -------------------------------------------------------------
function playerForward() {
  return { x: -Math.sin(player.camYaw), z: -Math.cos(player.camYaw) };
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of traffic.cars) {
    if (car.dead) continue;
    const d = flatDist(car.mesh.position.x, car.mesh.position.z, player.pos.x, player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of police.cars) {
    if (car.dead) continue;
    const d = flatDist(car.mesh.position.x, car.mesh.position.z, player.pos.x, player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function damagePlayer(amount) {
  if (game.screen !== 'play') return;
  player.health -= amount;
  player.lastDamageAt = game.time;
  if (player.health <= 0) {
    player.health = 0;
    endGame('WASTED', 'Rex Marlowe went down in the streets of Neon Bay.');
  }
}

function hurtNear(pos, radius, amount, exceptCar) {
  const d = flatDist(player.pos.x, player.pos.z, pos.x, pos.z);
  if (d < radius && !player.car) damagePlayer(amount * (1 - d / radius));
  if (player.car && player.car !== exceptCar) {
    const cd = flatDist(player.car.mesh.position.x, player.car.mesh.position.z, pos.x, pos.z);
    if (cd < radius) damageCar(player.car, amount * 0.5);
  }
}

function damageCar(car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    const wasPlayer = player.car === car;
    explodeCar(combat, car, (pos, radius) => hurtNear(pos, radius, 34, car));
    audio.explosion();
    game.lastDanger = { x: car.mesh.position.x, z: car.mesh.position.z };
    game.dangerTimer = 1;
    if (wasPlayer) {
      player.car = null;
      player.pos.copy(car.mesh.position).add(new THREE.Vector3(2.5, 0, 0));
      playerMesh.visible = true;
      damagePlayer(30);
    }
  }
}

function spawnTargetCar() {
  if (targetCar && !targetCar.dead) return;
  const line = city.roadLines[2];
  targetCar = createCar(scene, line + 2, player.pos.z - 40, 0, 'sport', 0xd8a800);
  targetCar.driver = 'target';
  targetCar.cruise = 20;
  traffic.cars.push(targetCar);
  hud.say('Duke Kessler', 'You want my crown, Marlowe? Come and take it — if you can catch me!');
}

// ---- screens ---------------------------------------------------------------
function showScreen(name) {
  document.getElementById('title').style.display = name === 'title' ? 'flex' : 'none';
  document.getElementById('pause').style.display = name === 'pause' ? 'flex' : 'none';
  document.getElementById('over').style.display = name === 'over' ? 'flex' : 'none';
  hud.show(name === 'play');
}

function startGame() {
  game.screen = 'play';
  showScreen('play');
  input.lock();
}

function pauseGame() {
  if (game.screen !== 'play') return;
  game.screen = 'pause';
  showScreen('pause');
  input.unlock();
}

function resumeGame() {
  game.screen = 'play';
  showScreen('play');
  input.lock();
}

function endGame(title, text) {
  game.screen = 'over';
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-text').textContent = text;
  document.getElementById('over-stats').textContent =
    `Cash $${Math.floor(game.cash).toLocaleString('en-US')} · Jobs done ${missions.index} / 5`;
  showScreen('over');
  input.unlock();
  audio.busted();
  writeSave({ cash: game.cash, missionIndex: missions.index, missionsDone: missions.index, player });
}

function winGame() {
  if (game.won) return;
  game.won = true;
  clearPolice(scene, police);
  hud.toast('KING OF THE BAY!');
  hud.say('Vera Solano', 'The bay is yours, Rex. Duke is done — Neon Bay has a new king.');
  endGame('KING OF THE BAY', 'Duke Kessler is finished. Neon Bay is yours — every street, every deal, every sunset.');
  document.getElementById('over-title').style.background =
    'linear-gradient(180deg, #ffe95e, #ff7a3d)';
}

// ---- mission context -------------------------------------------------------
const missionCtx = {
  playerPos: player.pos,
  get inCar() { return !!player.car; },
  get robHeld() { return input.down('KeyE'); },
  say: (who, text) => hud.say(who, text),
  toast: (text) => hud.toast(text),
  addCash: (n) => { game.cash += n; audio.cash(); },
  setWanted: (n) => { police.stars = n; police.crimeHeat = 0; },
  win: () => winGame(),
  audio,
  spawnTargetCar,
  targetCarDead: () => !!targetCar && targetCar.dead,
};

// ---- combat ---------------------------------------------------------------
function shootTargets() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone().addScaledVector(dir, 0.6);
  const targets = [];
  for (const o of police.officers) {
    targets.push({ pos: o.mesh.position.clone().setY(1.2), radius: 0.9, hp: o.hp, kind: 'officer', ref: o });
  }
  for (const ped of traffic.peds) {
    targets.push({ pos: ped.mesh.position.clone().setY(1.2), radius: 0.9, hp: ped.hp, kind: 'ped', ref: ped });
  }
  for (const car of [...traffic.cars, ...police.cars]) {
    if (car.dead || car === player.car) continue;
    targets.push({ pos: car.mesh.position.clone().setY(0.9), radius: 2.4, hp: car.hp, kind: 'car', ref: car });
  }
  const result = firePistol(combat, origin, dir, targets);
  audio.gunshot();
  game.lastDanger = { x: origin.x, z: origin.z };
  game.dangerTimer = 1;
  if (result.hit) {
    const t = result.hit;
    t.ref.hp = t.hp;
    if (t.kind === 'officer') {
      if (t.hp <= 0) {
        scene.remove(t.ref.mesh);
        police.officers.splice(police.officers.indexOf(t.ref), 1);
        addCrime(police, 1);
        hud.toast('OFFICER DOWN');
      }
    } else if (t.kind === 'ped') {
      if (t.hp <= 0) {
        removePed(scene, traffic, t.ref);
        addCrime(police, 1);
      }
    } else if (t.kind === 'car') {
      // firePistol already took the HP off; a 0-damage call just checks
      // whether the car is now wrecked and blows it up if so.
      damageCar(t.ref, 0);
      if (!t.ref.isPolice) addCrime(police, 1);
    }
  }
}

function punchTargets() {
  const fwd = playerForward();
  let best = null;
  let bestD = COMBAT.punchRange;
  const consider = (pos, hp, kind, ref) => {
    const dx = pos.x - player.pos.x;
    const dz = pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) return;
    const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
    if (dot < 0.4) return;
    best = { pos, hp, kind, ref };
    bestD = d;
  };
  for (const o of police.officers) consider(o.mesh.position, o.hp, 'officer', o);
  for (const ped of traffic.peds) consider(ped.mesh.position, ped.hp, 'ped', ped);
  audio.punch();
  if (!best) return;
  best.hp -= COMBAT.punchDamage;
  best.ref.hp = best.hp;
  if (best.hp <= 0) {
    if (best.kind === 'officer') {
      scene.remove(best.ref.mesh);
      police.officers.splice(police.officers.indexOf(best.ref), 1);
    } else removePed(scene, traffic, best.ref);
    addCrime(police, 1);
  }
}

// ---- one fixed step of the whole world ------------------------------------
function stepWorld(dt) {
  game.time += dt;
  game.clockMinutes += dt * 0.5;
  game.ramCooldown = Math.max(0, game.ramCooldown - dt);
  game.dangerTimer = Math.max(0, game.dangerTimer - dt);
  const danger = game.dangerTimer > 0 ? game.lastDanger : null;

  // Mouse look.
  const mouse = input.takeMouse();
  player.camYaw -= mouse.x * 0.0028;
  player.camPitch = clamp(player.camPitch + mouse.y * 0.0022, -0.15, 1.1);

  // Weapon switching.
  if (input.wasPressed('Digit1')) { game.weapon = 'fists'; }
  if (input.wasPressed('Digit2')) { game.weapon = 'pistol'; }
  if (input.wasPressed('KeyM')) audio.toggleMute();
  if (input.wasPressed('KeyR') && game.weapon === 'pistol') {
    game.reloadTimer = 1.1;
    game.reloading = true;
  }
  if (game.reloadTimer > 0) {
    game.reloadTimer = Math.max(0, game.reloadTimer - dt);
    if (game.reloadTimer === 0 && game.reloading) {
      game.ammo = COMBAT.pistolMag;
      game.reloading = false;
    }
  }

  // --- driving ---
  if (player.car) {
    const car = player.car;
    let throttle = 0;
    let steer = 0;
    if (game.auto?.drive) {
      throttle = 1;
      const line = city.roadLines[3];
      const targetHeading = 0;
      steer = clamp(angleDiff(targetHeading, car.heading) * 1.6 - (car.mesh.position.x - line) * 0.06, -1, 1);
    } else {
      if (input.down('KeyW')) throttle = 1;
      if (input.down('KeyS')) throttle = -1;
      if (input.down('KeyA')) steer = -1;
      if (input.down('KeyD')) steer = 1;
      if (input.down('Space')) throttle = throttle > 0 ? 0.15 : -1; // handbrake-ish
    }
    driveCar(car, throttle, steer, dt, city.buildings);
    audio.setEngine(Math.abs(car.speed) / 34, true);
    // Bump into other cars: slow down, dent them a little.
    for (const other of [...traffic.cars, ...police.cars]) {
      if (other === car || other.dead) continue;
      const d = flatDist(car.mesh.position.x, car.mesh.position.z, other.mesh.position.x, other.mesh.position.z);
      if (d < 3.4 && Math.abs(car.speed) > 4) {
        car.speed *= 0.5;
        damageCar(other, 4);
        if (other.driver === 'npc' && other.cruise) other.cruise = Math.max(4, other.cruise - 2);
      }
    }
    // Run over pedestrians.
    for (const ped of [...traffic.peds]) {
      const d = flatDist(car.mesh.position.x, car.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z);
      if (d < 1.6 && Math.abs(car.speed) > 3) {
        removePed(scene, traffic, ped);
        addCrime(police, 1);
        hud.toast('PEDESTRIAN HIT!');
      }
    }
    // Exit the car.
    if (input.wasPressed('KeyE') && !game.auto) {
      player.pos.copy(car.mesh.position).add(new THREE.Vector3(2.6, 0, 0));
      playerMesh.visible = true;
      player.car = null;
      audio.setEngine(0, false);
    }
    // Target car flees from the player.
  } else {
    audio.setEngine(0, false);
    // --- on foot ---
    let mx = 0;
    let mz = 0;
    if (game.auto?.walkTo) {
      const t = game.auto.walkTo;
      const dx = t.x - player.pos.x;
      const dz = t.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.5) {
        mx = dx / d; mz = dz / d;
        player.camYaw = Math.atan2(-mx, -mz);
      }
    } else {
      const f = playerForward();
      const r = { x: -f.z, z: f.x };
      if (input.down('KeyW')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyD')) { mx += r.x; mz += r.z; }
      if (input.down('KeyA')) { mx -= r.x; mz -= r.z; }
    }
    const len = Math.hypot(mx, mz);
    const run = input.down('ShiftLeft') || input.down('ShiftRight') || !!game.auto;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (len > 0) {
      mx /= len; mz /= len;
      player.pos.x += mx * speed * dt;
      player.pos.z += mz * speed * dt;
      player.yaw = Math.atan2(mx, mz);
      player.walkPhase += dt * speed * 1.6;
    }
    // Jump + gravity.
    if (input.wasPressed('Space') && player.onGround) {
      player.vy = PLAYER.jumpSpeed;
      player.onGround = false;
    }
    player.vy -= 22 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
    collideBuildings(city.buildings, player.pos, PLAYER.radius);
    player.pos.x = clamp(player.pos.x, -CITY.half - 30, CITY.half + 90);
    player.pos.z = clamp(player.pos.z, -CITY.half - 30, CITY.half + 130);

    // Enter a nearby car.
    if (input.wasPressed('KeyE') && !game.auto) {
      const car = nearestCar(4);
      if (car) {
        if (car.driver === 'npc' || car.driver === 'police' || car.driver === 'target') {
          addCrime(police, car.driver === 'police' ? 2 : 1);
          hud.toast(car.driver === 'police' ? 'STOLE A POLICE CAR!' : 'CAR STOLEN!');
        }
        if (car.driver === 'target') { /* stealing the target's ride is fair game */ }
        car.driver = 'player';
        player.car = car;
        playerMesh.visible = false;
        player.camYaw = car.heading + Math.PI;
        audio.click();
      }
    }
    // Attack.
    if (input.consumeClick() && game.punchTimer <= 0) {
      if (game.weapon === 'pistol') {
        if (game.ammo > 0 && game.reloadTimer <= 0) {
          game.ammo -= 1;
          shootTargets();
          if (game.ammo === 0) game.reloadTimer = 1.1;
        } else if (game.ammo === 0) game.reloadTimer = 1.1;
      } else {
        game.punchTimer = COMBAT.punchCooldown;
        punchTargets();
      }
    }
    // Walk-cycle animation.
    const swing = len > 0 ? Math.sin(player.walkPhase) * 0.55 : 0;
    playerMesh.userData.legL.rotation.x = swing;
    playerMesh.userData.legR.rotation.x = -swing;
    playerMesh.userData.armL.rotation.x = -swing * 0.7;
    playerMesh.userData.armR.rotation.x = swing * 0.7;
    playerMesh.userData.gun.visible = game.weapon === 'pistol';
  }

  // Target car (mission 5): flee from the player.
  if (targetCar && !targetCar.dead) {
    const pos = targetCar.mesh.position;
    const away = Math.atan2(pos.x - player.pos.x, pos.z - player.pos.z);
    const steer = clamp(angleDiff(away, targetCar.heading) * 1.5, -1, 1);
    driveCar(targetCar, 0.9, steer, dt, city.buildings);
    // Keep it inside the city.
    if (Math.abs(pos.x) > CITY.half || Math.abs(pos.z) > CITY.half) {
      targetCar.heading += Math.PI;
    }
  }

  // Traffic, police, combat particles, missions.
  stepTraffic(traffic, dt, rand, city.roadLines, danger);
  stepPolice(police, scene, dt, rand, city.roadLines, city.buildings, player.pos, !!player.car,
    () => endGame('BUSTED', 'The Bay Police finally caught up with you.'),
    () => {
      if (game.ramCooldown > 0) return;
      game.ramCooldown = 0.9;
      if (player.car) damageCar(player.car, 7);
      else damagePlayer(9);
      audio.punch();
    });
  if (police.sirenDue) { police.sirenDue = false; audio.siren(); }
  stepCombat(combat, dt);
  stepMissions(missions, dt, missionCtx);

  // Health regen while calm.
  if (police.stars === 0 && game.time - player.lastDamageAt > 8 && player.health < PLAYER.maxHealth) {
    player.health = Math.min(PLAYER.maxHealth, player.health + 4 * dt);
  }

  // Autosave.
  game.saveTimer += dt;
  if (game.saveTimer > 5) {
    game.saveTimer = 0;
    writeSave({ cash: game.cash, missionIndex: missions.index, missionsDone: missions.index, player });
  }
}

// ---- camera + render -------------------------------------------------------
function updateCamera(dt) {
  if (SHOT_MODE && shotName === '4') {
    camera.position.set(190, 130, 190);
    camera.lookAt(0, 15, 0);
    return;
  }
  if (SHOT_MODE && shotName === '1') {
    const t = game.time * 0.05;
    camera.position.set(Math.cos(t) * 170, 85, Math.sin(t) * 170);
    camera.lookAt(0, 12, 0);
    return;
  }
  if (player.car) {
    const car = player.car;
    const desiredYaw = car.heading + Math.PI;
    // Let the camera drift back behind the car after mouse-look.
    player.camYaw += angleDiff(desiredYaw, player.camYaw) * Math.min(1, dt * 1.2);
    const dist = 12;
    const tx = car.mesh.position.x + Math.sin(player.camYaw) * dist;
    const tz = car.mesh.position.z + Math.cos(player.camYaw) * dist;
    const ty = 3.4 + player.camPitch * 3;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 6);
    camera.lookAt(
      car.mesh.position.x - Math.sin(car.heading) * 8,
      1.8,
      car.mesh.position.z - Math.cos(car.heading) * 8,
    );
    return;
  }
  const dist = 7.5;
  const cp = Math.cos(player.camPitch);
  const sp = Math.sin(player.camPitch);
  camera.position.set(
    player.pos.x + Math.sin(player.camYaw) * dist * cp,
    player.pos.y + 2 + sp * dist,
    player.pos.z + Math.cos(player.camYaw) * dist * cp,
  );
  camera.lookAt(player.pos.x, player.pos.y + 1.7, player.pos.z);
}

function render() {
  playerMesh.position.copy(player.pos);
  playerMesh.rotation.y = player.yaw;
  playerMesh.visible = playerMesh.visible && !player.car;
  renderer.render(scene, camera);
}

function refreshHud() {
  const obj = missionObjective(missions);
  hud.setObjective(obj.name, obj.text, missionTimerText(missions));
  hud.setStars(Math.round(police.stars));
  hud.setCash(game.cash);
  hud.setClock(game.clockMinutes);
  hud.setHealth(player.health);
  hud.setWeapon(game.weapon === 'pistol' ? `Pistol${game.reloadTimer > 0 ? ' · reloading…' : ''}` : 'Fists',
    game.weapon === 'pistol' ? game.ammo : null);
  hud.setSpeed(player.car ? player.car.speed * 2.237 : 0, !!player.car);
  hud.setCrosshair(game.weapon === 'pistol' && !player.car);
  const near = player.car ? null : nearestCar(4);
  hud.setHint(player.car
    ? 'E exit car · WASD drive · SPACE brake'
    : near
      ? 'Press E to get in the car'
      : (missions.index === 3 && missions.stage === 1 ? 'Hold E to rob the till' : 'WASD move · SHIFT run · SPACE jump · Click attack'));
  hud.drawMinimap({
    roadLines: city.roadLines,
    parkCenter: { x: city.roadLines[3] + CITY.pitch / 2, z: city.roadLines[3] + CITY.pitch / 2 },
    marker: missions.marker,
    police: police.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    player: {
      x: player.car ? player.car.mesh.position.x : player.pos.x,
      z: player.car ? player.car.mesh.position.z : player.pos.z,
      heading: player.car ? player.car.heading : player.yaw,
    },
  });
}

// ---- screenshot scenes -----------------------------------------------------
function stageShot(name) {
  game.screen = 'play';
  showScreen(name === '1' || name === '4' ? 'title' : 'play');
  if (name === '1') {
    // Title over a living city: traffic cruises for a few seconds.
    hud.show(false);
    for (let i = 0; i < 300; i += 1) stepWorld(STEP);
    return;
  }
  if (name === '4') {
    hud.show(false);
    document.getElementById('title').style.display = 'none';
    for (let i = 0; i < 180; i += 1) stepWorld(STEP);
    return;
  }
  if (name === '2') {
    // A chase: the player driving, 3 stars, police closing in.
    jumpToMission(missions, missionCtx, 2);
    const line = city.roadLines[3];
    const car = createCar(scene, line, -140, 0, 'sport', 0xd83a2e);
    car.driver = 'player';
    traffic.cars.push(car);
    player.car = car;
    playerMesh.visible = false;
    player.camYaw = Math.PI;
    game.auto = { drive: true };
    police.stars = 3;
    // One unit comes head-on down the same road so the chase is in frame:
    // placed far enough ahead that the two cars meet right as the frame lands.
    const cop = createCar(scene, line, -140 + 45, Math.PI, 'sedan', 0x14161c, true);
    cop.driver = 'police';
    police.cars.push(cop);
    for (let i = 0; i < 90; i += 1) stepWorld(STEP);
    game.auto = null;
    return;
  }
  // name === '3': on foot, mid-mission, walking to the drop.
  jumpToMission(missions, missionCtx, 1);
  missions.stage = 1;
  missions.timer = 74;
  pointMarker(missions, missions.drop);
  player.pos.set(missions.pickup.x + 16, 0, missions.pickup.z + 10);
  player.camYaw = Math.atan2(-(missions.pickup.x - player.pos.x), -(missions.pickup.z - player.pos.z));
  game.auto = { walkTo: missions.drop };
  for (let i = 0; i < 200; i += 1) stepWorld(STEP);
  game.auto = null;
}

// ---- main loop -------------------------------------------------------------
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (game.screen === 'play' && !SHOT_MODE) {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepWorld(STEP);
      accumulator -= STEP;
    }
    updateCamera(dt);
    render();
    refreshHud();
  } else if (game.screen === 'title' && !SHOT_MODE) {
    // Idle city behind the title screen.
    game.time += dt;
    stepTraffic(traffic, dt, rand, city.roadLines, null);
    updateCamera(dt);
    render();
  }
  // Pause / game-over: keep the last frame; nothing advances.
  if (input.wasPressed('Escape') && !SHOT_MODE) {
    if (game.screen === 'play') pauseGame();
    else if (game.screen === 'pause') resumeGame();
  }
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('btn-start').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  startGame();
});
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); window.location.reload(); });
document.getElementById('btn-again').addEventListener('click', () => { window.location.reload(); });

// Auto-pause when the player leaves pointer lock mid-game (Esc does this).
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && hadLock && game.screen === 'play' && !SHOT_MODE) pauseGame();
  hadLock = locked;
});

// Small read-only handle for smoke tests and debugging (no cheats: it only
// exposes live state, it cannot change the rules).
window.__neonbay = {
  get inCar() { return !!player.car; },
  get stars() { return Math.round(police.stars); },
  get mission() { return missions.index; },
  get health() { return Math.round(player.health); },
  get cash() { return Math.floor(game.cash); },
  get speed() { return player.car ? player.car.speed : 0; },
  get ammo() { return game.ammo; },
  get screen() { return game.screen; },
  playerPos() { return { x: player.pos.x, z: player.pos.z }; },
  nearestParkedCar() {
    let best = null;
    let bestD = Infinity;
    for (const car of traffic.cars) {
      if (car.dead || car.driver !== null) continue;
      const d = flatDist(car.mesh.position.x, car.mesh.position.z, player.pos.x, player.pos.z);
      if (d < bestD) { bestD = d; best = { x: car.mesh.position.x, z: car.mesh.position.z }; }
    }
    return best;
  },
  teleport(x, z) { player.pos.set(x, 0, z); },
};

if (SHOT_MODE) {
  const names = { 1: '1', 2: '2', 3: '3', 4: '4' };
  stageShot(names[shotName] ?? '1');
  updateCamera(0.016);
  render();
  refreshHud();
  let painted = 0;
  (function paint() {
    updateCamera(1); // snap the chase camera behind the car at once
    render();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  showScreen('title');
  requestAnimationFrame(frame);
}
