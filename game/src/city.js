// The city of Neon Bay: a grid of roads and sidewalks, procedural towers
// with lit windows, street lamps, a park, a beach on the south edge, a
// sunset sky and light haze. Everything is built from boxes and canvas
// textures — no loaded assets. Also exports the building footprints the
// player and cars collide with, and the road centre lines traffic uses.
import * as THREE from 'three';
import { CITY } from './config.js';
import { createRandom } from './random.js';

const PALETTES = [
  0x3d4a6b, 0x6b4a3d, 0x4a6b5a, 0x5a4a6b, 0x71563a, 0x37455e,
  0x5e3a4a, 0x46606b, 0x6b5a3d, 0x3d5a6b, 0x54423a, 0x7a6a8a,
];
const NEON = [0xff2e88, 0x00e5ff, 0xffd23e, 0x7dff5e, 0xff7a3d];

function windowTexture(rand, baseColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 10) {
      const lit = rand.next() < litRatio;
      g.fillStyle = lit ? (rand.next() < 0.5 ? '#ffd98a' : '#9be8ff') : '#10141f';
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBox(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts.map ? { map: opts.map } : {}) });
  if (opts.emissive) mat.emissive = new THREE.Color(opts.emissive);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(scene, seed) {
  const rand = createRandom(seed);
  const lines = CITY.roadLines();
  const pitch = CITY.pitch;
  const half = CITY.half;
  const buildings = []; // {x, z, hw, hd} footprints for collision
  const group = new THREE.Group();
  scene.add(group);

  // Sunset sky: big gradient dome + low sun disc + haze.
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a1a5e) },
      mid: { value: new THREE.Color(0xd96a4a) },
      low: { value: new THREE.Color(0xffb03d) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false }),
  );
  sun.position.set(-420, 120, -700);
  sun.lookAt(0, 60, 0);
  group.add(sun);

  // Ground: asphalt base, then sidewalks and road strips on top.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, half * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x2c2f38 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Beach strip along the south edge (z beyond the last road).
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, 90),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, half + 52);
  beach.receiveShadow = true;
  group.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 260, 160),
    new THREE.MeshLambertMaterial({ color: 0x1a5a8a }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, half + 175);
  group.add(sea);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x23262e });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x55565e });

  for (const c of lines) {
    // Road strips both ways.
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, half * 2), roadMat);
    ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0.03, 0); ns.receiveShadow = true;
    group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, CITY.road), roadMat);
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.03, c); ew.receiveShadow = true;
    group.add(ew);
    // Dashed centre lines.
    for (let t = -half + 8; t < half - 4; t += 12) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
      d1.rotation.x = -Math.PI / 2; d1.position.set(c, 0.05, t);
      group.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
      d2.rotation.x = -Math.PI / 2; d2.position.set(t, 0.05, c);
      group.add(d2);
    }
    // Sidewalk strips flanking each road.
    for (const off of [-CITY.road / 2 - 2.5, CITY.road / 2 + 2.5]) {
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(5, half * 2), walkMat);
      s1.rotation.x = -Math.PI / 2; s1.position.set(c + off, 0.04, 0); s1.receiveShadow = true;
      group.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 5), walkMat);
      s2.rotation.x = -Math.PI / 2; s2.position.set(0, 0.04, c + off); s2.receiveShadow = true;
      group.add(s2);
    }
  }

  // Buildings, one to four per block; the centre block is a park.
  const centre = Math.floor(CITY.blocks / 2);
  const texCache = new Map();
  function texFor(color) {
    if (!texCache.has(color)) texCache.set(color, windowTexture(rand, color, 0.42));
    return texCache.get(color);
  }
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const cx = lines[bx] + pitch / 2;
      const cz = lines[bz] + pitch / 2;
      if (bx === centre && bz === centre) {
        // Coral Park: grass, trees, benches, a fountain.
        const grass = new THREE.Mesh(
          new THREE.PlaneGeometry(CITY.block, CITY.block),
          new THREE.MeshLambertMaterial({ color: 0x2e6b34 }),
        );
        grass.rotation.x = -Math.PI / 2; grass.position.set(cx, 0.06, cz); grass.receiveShadow = true;
        group.add(grass);
        for (let i = 0; i < 9; i += 1) {
          const tx = cx + rand.range(-20, 20);
          const tz = cz + rand.range(-20, 20);
          group.add(makeBox(0.5, 3.2, 0.5, 0x5a3a22, tx, 1.6, tz));
          const crown = new THREE.Mesh(
            new THREE.SphereGeometry(rand.range(2.2, 3.4), 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x3f8a3a }),
          );
          crown.position.set(tx, 4.6, tz); crown.castShadow = true;
          group.add(crown);
        }
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 5.5, 1, 16),
          new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
        );
        fountain.position.set(cx, 0.5, cz);
        group.add(fountain);
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(4.4, 4.4, 0.3, 16),
          new THREE.MeshLambertMaterial({ color: 0x2a9ad8, emissive: 0x0a3a5a }),
        );
        water.position.set(cx, 1.05, cz);
        group.add(water);
        continue;
      }
      const count = rand.int(1, 4);
      for (let k = 0; k < count; k += 1) {
        const w = rand.range(10, 18);
        const d = rand.range(10, 18);
        const h = rand.range(9, 42) * (rand.chance(0.18) ? 1.8 : 1);
        const ox = cx + rand.range(-13, 13);
        const oz = cz + rand.range(-13, 13);
        const color = rand.pick(PALETTES);
        const tower = makeBox(w, h, d, color, ox, h / 2, oz, { map: texFor(color) });
        group.add(tower);
        // Roof rim + a neon sign on some towers.
        group.add(makeBox(w + 0.6, 0.5, d + 0.6, 0x1a1d26, ox, h + 0.25, oz, { shadow: false }));
        if (rand.chance(0.4)) {
          const sign = makeBox(Math.min(w * 0.7, 8), 1.6, 0.3, 0x111111, ox, h - 2, oz + d / 2 + 0.2, {
            emissive: rand.pick(NEON), shadow: false,
          });
          group.add(sign);
        }
        buildings.push({ x: ox, z: oz, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
      }
    }
  }

  // Street lamps at every other intersection corner.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2d36 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = 0; j < lines.length; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      const lx = lines[i] + CITY.road / 2 + 1.2;
      const lz = lines[j] + CITY.road / 2 + 1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lampMat);
      pole.position.set(lx, 3.5, lz); pole.castShadow = true;
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(lx, 7.1, lz);
      group.add(bulb);
    }
  }

  // Lighting: warm low sun + cool ambient fill + haze.
  const sunLight = new THREE.DirectionalLight(0xffb070, 1.7);
  sunLight.position.set(-180, 140, -260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -260; sunLight.shadow.camera.right = 260;
  sunLight.shadow.camera.top = 260; sunLight.shadow.camera.bottom = -260;
  sunLight.shadow.camera.far = 900;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x5a4a8a, 1.05));
  const hemi = new THREE.HemisphereLight(0x8a6ab8, 0x2a2a3a, 0.65);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xd98a5e, 220, 780);

  return { buildings, roadLines: lines, half };
}

/** Push a circle (x, z, radius) out of every building footprint it overlaps. */
export function collideBuildings(buildings, pos, radius) {
  for (const b of buildings) {
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    if (Math.abs(dx) < b.hw + radius && Math.abs(dz) < b.hd + radius) {
      const px = b.hw + radius - Math.abs(dx);
      const pz = b.hd + radius - Math.abs(dz);
      if (px < pz) pos.x = b.x + Math.sign(dx || 1) * (b.hw + radius);
      else pos.z = b.z + Math.sign(dz || 1) * (b.hd + radius);
    }
  }
}

/** Nearest road centre line to a coordinate. */
export function nearestRoadLine(lines, v) {
  let best = lines[0];
  let bestD = Infinity;
  for (const l of lines) {
    const d = Math.abs(l - v);
    if (d < bestD) { bestD = d; best = l; }
  }
  return best;
}
