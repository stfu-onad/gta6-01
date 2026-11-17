// Vera Solano's job chain: five missions with a story, a glowing marker in
// the world, dialog, timers and cash rewards. Progress is what the save
// file stores, so a returning player picks up at the next job.
import * as THREE from 'three';
import { MISSION_REWARDS } from './config.js';
import { flatDist } from './random.js';

export const MISSION_NAMES = [
  'First Wheels',
  'The Drop',
  'Heat',
  'Bay Heist',
  'King of the Bay',
];

function spot(roadLines, ix, iz) {
  return { x: roadLines[ix], z: roadLines[iz] };
}

export function createMissions(scene, rand, roadLines) {
  // Job locations on the grid, spread across the city.
  const garage = spot(roadLines, 6, 1);
  const pickup = spot(roadLines, 1, 6);
  const drop = spot(roadLines, 6, 6);
  const shop = spot(roadLines, 3, 2);
  const safehouse = spot(roadLines, 1, 1);
  const crown = spot(roadLines, 4, 4);

  // The marker: a light beam plus a spinning diamond, moved to the current goal.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  scene.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  gem.position.y = 8;
  scene.add(gem);

  const m = {
    index: 0,          // current mission (0..4), 5 = all done
    stage: 0,          // step inside the mission
    timer: 0,
    robProgress: 0,
    targetCar: null,
    garage, pickup, drop, shop, safehouse, crown,
    beam, gem,
    marker: null,      // {x, z} or null
    introShown: false,
  };
  return m;
}

function setMarker(m, spotPos) {
  m.marker = spotPos ? { x: spotPos.x, z: spotPos.z } : null;
  if (spotPos) {
    m.beam.position.x = spotPos.x;
    m.beam.position.z = spotPos.z;
    m.beam.visible = true;
    m.gem.position.x = spotPos.x;
    m.gem.position.z = spotPos.z;
    m.gem.visible = true;
  } else {
    m.beam.visible = false;
    m.gem.visible = false;
  }
}

function startMission(m, ctx) {
  m.stage = 0;
  m.timer = 0;
  m.robProgress = 0;
  m.introShown = true;
  const i = m.index;
  if (i === 0) {
    ctx.say('Vera Solano', 'Rex, welcome back to the bay. First rule: wheels are free if you take them. Steal a car, then bring it to my garage.');
    setMarker(m, m.garage);
  } else if (i === 1) {
    ctx.say('Vera Solano', 'A package is waiting at the north docks. Grab it and drop it at the east marina — you have 90 seconds once you pick it up.');
    setMarker(m, m.pickup);
  } else if (i === 2) {
    ctx.say('Vera Solano', 'You stepped on the wrong toes, Rex. The whole bay PD is on you — three stars. Stay free for 60 seconds and they will lose the scent.');
    ctx.setWanted(3);
    m.timer = 60;
    setMarker(m, null);
  } else if (i === 3) {
    ctx.say('Vera Solano', 'The corner store on Coral Row keeps its till full. Walk in, hold E, take it — then lose the heat at the safehouse.');
    setMarker(m, m.shop);
  } else if (i === 4) {
    ctx.say('Vera Solano', 'One last thing. Duke Kessler, the so-called King of the Bay, is cruising Coral Row in his gold coupe. Wreck his ride, then take the crown at the park.');
    ctx.spawnTargetCar();
    setMarker(m, null);
  }
}

function completeMission(m, ctx) {
  const reward = MISSION_REWARDS[m.index];
  ctx.addCash(reward);
  ctx.toast(`JOB DONE  +$${reward}`);
  ctx.audio.missionDone();
  m.index += 1;
  m.stage = 0;
  m.timer = 0;
  if (m.index >= 5) {
    setMarker(m, null);
    ctx.win();
    return;
  }
  startMission(m, ctx);
}

function failMission(m, ctx, reason) {
  ctx.toast(reason);
  ctx.say('Vera Solano', 'That went sideways, Rex. Shake it off — the job is still open. Try again.');
  m.stage = 0;
  m.timer = 0;
  m.robProgress = 0;
  if (m.index === 2) ctx.setWanted(3);
  startMission(m, ctx);
}

/** Current objective text for the HUD. */
export function missionObjective(m) {
  if (m.index >= 5) return { name: 'KING OF THE BAY', text: 'You own this city. Free roam — the bay is yours.' };
  const names = MISSION_NAMES;
  if (m.index === 0) return { name: `1 · ${names[0]}`, text: m.stage === 0 ? 'Steal a car (walk up to one and press E)' : 'Drive it to Vera\'s garage (follow the gold beam)' };
  if (m.index === 1) return { name: `2 · ${names[1]}`, text: m.stage === 0 ? 'Pick up the package at the north docks' : 'Deliver it to the east marina — fast!' };
  if (m.index === 2) return { name: `3 · ${names[2]}`, text: 'Stay free with 3 stars — survive the heat!' };
  if (m.index === 3) return { name: `4 · ${names[3]}`, text: m.stage === 0 ? 'Go to the corner store on Coral Row' : m.stage === 1 ? 'Hold E to empty the till…' : 'Escape to the safehouse (gold beam)' };
  return { name: `5 · ${names[4]}`, text: m.stage === 0 ? 'Wreck Duke Kessler\'s gold coupe!' : 'Take the crown at Coral Park!' };
}

export function missionTimerText(m) {
  if (m.index === 1 && m.stage === 1) return `DELIVER IN ${Math.ceil(m.timer)}s`;
  if (m.index === 2) return `SURVIVE ${Math.ceil(m.timer)}s`;
  if (m.index === 3 && m.stage === 1) return `ROBBING… ${Math.ceil(m.robProgress * 100 / 3)}%`;
  return '';
}

/**
 * Advance the mission chain. `ctx` carries the live game: playerPos, inCar,
 * nearCar, keys, and callbacks (say, toast, addCash, setWanted, win, audio,
 * spawnTargetCar, targetCarDead). Returns nothing; markers update in place.
 */
export function stepMissions(m, dt, ctx) {
  // Spin the marker gem.
  m.gem.rotation.y += dt * 2;
  m.gem.position.y = 8 + Math.sin(performance.now() / 400) * 0.6;
  if (m.index >= 5) return;
  if (!m.introShown) startMission(m, ctx);

  const p = ctx.playerPos;
  if (m.index === 0) {
    if (m.stage === 0 && ctx.inCar) {
      m.stage = 1;
      ctx.say('Vera Solano', 'Nice wheels. Now bring it to the garage — gold beam, east side.');
    } else if (m.stage === 1 && flatDist(p.x, p.z, m.garage.x, m.garage.z) < 8) {
      completeMission(m, ctx);
    }
  } else if (m.index === 1) {
    if (m.stage === 0 && flatDist(p.x, p.z, m.pickup.x, m.pickup.z) < 6) {
      m.stage = 1;
      m.timer = 90;
      setMarker(m, m.drop);
      ctx.say('Vera Solano', 'Package in hand. East marina, 90 seconds. Move!');
    } else if (m.stage === 1) {
      m.timer -= dt;
      if (flatDist(p.x, p.z, m.drop.x, m.drop.z) < 8) completeMission(m, ctx);
      else if (m.timer <= 0) failMission(m, ctx, 'DELIVERY TOO SLOW');
    }
  } else if (m.index === 2) {
    m.timer -= dt;
    if (m.timer <= 0) {
      ctx.setWanted(0);
      completeMission(m, ctx);
    }
  } else if (m.index === 3) {
    if (m.stage === 0 && flatDist(p.x, p.z, m.shop.x, m.shop.z) < 6) {
      m.stage = 1;
      ctx.say('Vera Solano', 'Hold E — empty that till, quick!');
    } else if (m.stage === 1) {
      if (flatDist(p.x, p.z, m.shop.x, m.shop.z) > 9) { m.stage = 0; m.robProgress = 0; setMarker(m, m.shop); }
      else if (ctx.robHeld) {
        m.robProgress += dt;
        if (m.robProgress >= 3) {
          m.stage = 2;
          ctx.setWanted(4);
          setMarker(m, m.safehouse);
          ctx.say('Vera Solano', 'Till\'s yours! Now shake the cops — safehouse, west side!');
        }
      } else m.robProgress = Math.max(0, m.robProgress - dt * 2);
    } else if (m.stage === 2 && flatDist(p.x, p.z, m.safehouse.x, m.safehouse.z) < 8) {
      ctx.setWanted(0);
      completeMission(m, ctx);
    }
  } else if (m.index === 4) {
    if (m.stage === 0 && ctx.targetCarDead()) {
      m.stage = 1;
      setMarker(m, m.crown);
      ctx.say('Vera Solano', 'Kessler is finished. The park, Rex — go take your crown.');
    } else if (m.stage === 1 && flatDist(p.x, p.z, m.crown.x, m.crown.z) < 8) {
      completeMission(m, ctx);
    }
  }
}

/** Move the gold marker beam to a new goal (used by shot staging). */
export function pointMarker(m, spotPos) {
  setMarker(m, spotPos);
}

/** Teleport-free reset used by shot staging: jump the chain to a mission. */
export function jumpToMission(m, ctx, index) {
  m.index = index;
  m.introShown = false;
  startMission(m, ctx);
  m.introShown = true;
}
