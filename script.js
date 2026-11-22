(() => {
  const hint = document.querySelector('.hint');
  if (!window.THREE) { hint.textContent = 'Could not load three.js. Check your internet connection and reload.'; return; }

  const canvas = document.getElementById('stage');
  const TAU = Math.PI * 2;
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y = V3(0, 1, 0), Z = V3(0, 0, 1);

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const LOOK = V3(0, -0.3, 0);

  scene.add(new THREE.HemisphereLight(0xffe9f3, 0x3a2060, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(3, 6, 5); scene.add(key);
  const pinkL = new THREE.PointLight(0xff86b6, 0.7, 14); pinkL.position.set(-4, 1.5, 3); scene.add(pinkL);
  const rimL = new THREE.PointLight(0x9a7bff, 0.9, 14); rimL.position.set(2, 2.5, -5); scene.add(rimL);

  const bouquet = new THREE.Group();
  scene.add(bouquet);

  // ---------- geometry helpers ----------
  // Builds a curved petal/leaf surface: length along +Y, width along X, curl toward +Z.
  function buildPetal(o) {
    const nu = o.nu || 12, nv = o.nv || 8;
    const cr = [0], cz = [0];
    for (let i = 1; i <= nu; i++) {
      const u = (i - 0.5) / nu, th = o.t0 - o.k * Math.pow(u, o.kp || 1);
      cr[i] = cr[i - 1] + Math.cos(th) * o.L / nu;
      cz[i] = cz[i - 1] + Math.sin(th) * o.L / nu;
    }
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, w = o.W * o.wf(u);
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        let y = cr[i], z = cz[i];
        z += (o.cup || 0) * v * v * w * (1 - 0.5 * u);
        if (o.ruf) {
          z += o.ruf * Math.pow(u, 1.5) * Math.sin(v * (o.rf || 5) + (o.ph || 0)) * (0.4 + Math.abs(v));
          z += o.ruf * 0.8 * v * v * Math.sin(u * 9 + (o.ph || 0));
        }
        if (o.serr) y -= o.serr * Math.pow(u, 8) * (0.5 + 0.5 * Math.cos(v * (o.sf || 3) * Math.PI));
        pos.push(v * w, y, z); uv.push(j / nv, u);
        if (o.color) { const c = o.color(u, v); col.push(c.r, c.g, c.b); }
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function merge(geos) {
    const out = new THREE.BufferGeometry();
    Object.keys(geos[0].attributes).forEach(n => {
      const size = geos[0].attributes[n].itemSize;
      const arr = new Float32Array(geos.reduce((s, g) => s + g.attributes[n].array.length, 0));
      let o = 0; geos.forEach(g => { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    let total = 0; const ids = [];
    geos.forEach(g => {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i++) ids.push(ix[i] + total);
      total += g.attributes.position.count;
    });
    out.setIndex(ids);
    return out;
  }

  function cylBetween(a, b, r) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, 4, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V3(1, 1, 1)));
    return g;
  }

  // ---------- textures & materials ----------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function lilyTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#fffafc'; g.fillRect(0, 0, 256, 512);
    const lg = g.createLinearGradient(0, 512, 0, 0);
    lg.addColorStop(0, '#a8104a'); lg.addColorStop(0.25, '#d8337a');
    lg.addColorStop(0.6, 'rgba(244,120,172,0.88)'); lg.addColorStop(0.92, 'rgba(255,205,226,0.2)');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 512);
    const eg = g.createLinearGradient(0, 0, 256, 0);
    [[0, 1], [0.2, 0.55], [0.38, 0], [0.62, 0], [0.8, 0.55], [1, 1]].forEach(([s, a]) => eg.addColorStop(s, `rgba(255,250,252,${a})`));
    g.fillStyle = eg; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = 'rgba(150,10,70,0.3)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(128, 512); g.lineTo(128, 70); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(190,40,100,0.18)';
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(128, 500); g.lineTo(128 + k * 28, 120); g.stroke(); }
    for (let n = 0; n < 150; n++) {
      const u = 0.08 + Math.pow(Math.random(), 1.2) * 0.72;
      const x = 128 + (Math.random() + Math.random() - 1) * 70 * (1.1 - u * 0.5);
      g.fillStyle = `rgba(105,8,52,${rnd(0.55, 0.85)})`;
      g.beginPath(); g.arc(x, 512 * (1 - u), rnd(1.3, 3.4), 0, TAU); g.fill();
    }
    const tg = g.createRadialGradient(128, 512, 0, 128, 512, 120);
    tg.addColorStop(0, 'rgba(205,232,95,0.95)'); tg.addColorStop(1, 'rgba(205,232,95,0)');
    g.fillStyle = tg; g.fillRect(0, 0, 256, 512);
    const t = new THREE.CanvasTexture(c); t.anisotropy = maxAniso;
    return t;
  }
  const lilyTextures = [lilyTexture(), lilyTexture(), lilyTexture()];
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5f9f67, roughness: 0.8 });
  const twigMat = new THREE.MeshStandardMaterial({ color: 0x8fbf8a, roughness: 0.8 });
  const calyxMat = new THREE.MeshStandardMaterial({ color: 0x5d9a62, roughness: 0.7 });
  const filMat = new THREE.MeshStandardMaterial({ color: 0xd6e8a0, roughness: 0.6 });
  const antMat = new THREE.MeshStandardMaterial({ color: 0x5a1030, roughness: 0.5 });

  // ---------- placement ----------
  const C = V3(0, 0.15, 0), BASE = V3(0, -1.9, 0);
  const placed = [];
  function place(R, rad, minPhi, maxPhi) {
    let res;
    for (let t = 0; t < 90; t++) {
      const th = rnd(TAU), ph = rnd(minPhi, maxPhi);
      const d = V3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const p = C.clone().addScaledVector(d, R * rnd(0.94, 1.06));
      res = { p, d };
      if (placed.every(q => q.p.distanceTo(p) > (q.rad + rad) * 0.78)) break;
    }
    placed.push({ p: res.p, rad });
    return res;
  }
  function addStem(end, r, mat) {
    // Stems bundle tightly inside the cone and only fan out after passing the rim (y = 0.2).
    const inside = V3(rnd(-0.05, 0.05), -1.1, rnd(-0.05, 0.05));
    const atRim = V3(end.x * 0.25, 0.1, end.z * 0.25);
    const above = atRim.clone().lerp(end, 0.55); above.y += 0.1;
    const curve = new THREE.CatmullRomCurve3([BASE, inside, atRim, above, end], false, 'centripetal');
    bouquet.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 6, false), mat));
  }
  function addFlower(geo, mat, p, n, roll, extra, scale) {
    const g = new THREE.Group();
    g.position.copy(p); g.quaternion.setFromUnitVectors(Z, n);
    const m = new THREE.Mesh(geo, mat); m.rotation.z = roll; g.add(m);
    if (extra) g.add(extra);
    if (scale) g.scale.setScalar(scale);
    bouquet.add(g);
  }

  // ---------- stargazer lilies ----------
  const lilyW = u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.55);
  function lilyGeo() {
    const list = [];
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 3; i++) {
      const g = buildPetal({
        L: rnd(0.7, 0.8) * (layer ? 0.95 : 1), W: layer ? 0.3 : 0.25,
        t0: layer ? 0.62 : 0.45, k: layer ? 1.05 : 1.2, kp: 1.1,
        cup: 0.55, ruf: 0.035, rf: 5, ph: rnd(6), nu: 16, nv: 8, wf: lilyW
      });
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(i * TAU / 3 + layer * TAU / 6 + rnd(-0.1, 0.1)));
      list.push(g);
    }
    return merge(list);
  }
  function stamens() {
    const grp = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + rnd(0.3), len = rnd(0.5, 0.62);
      const s = new THREE.Group(); s.quaternion.setFromUnitVectors(Y, V3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.85).normalize());
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, len, 5), filMat); f.position.y = len / 2; s.add(f);
      const an = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), antMat); an.scale.set(0.035, 0.11, 0.035); an.position.y = len; s.add(an);
      grp.add(s);
    }
    const ps = new THREE.Group(); ps.quaternion.setFromUnitVectors(Y, V3(0.15, 0.1, 1).normalize());
    const pf = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.7, 5), filMat); pf.position.y = 0.35; ps.add(pf);
    const pk = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8f0a0 })); pk.position.y = 0.7; ps.add(pk);
    grp.add(ps);
    return grp;
  }
  for (let i = 0; i < 5; i++) {
    const { p, d } = place(1.5, 0.7, 0.15, 1.0);
    const n = d.clone().add(V3(0, 0.35, 0)).normalize();
    const tex = lilyTextures[i % 3];
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.6, side: THREE.DoubleSide });
    addFlower(lilyGeo(), mat, p, n, rnd(TAU), stamens());
    addStem(p.clone().addScaledVector(n, -0.1), 0.028, stemMat);
  }

  // ---------- pink carnations ----------
  const carnW = u => 0.15 + 0.85 * Math.pow(u, 0.5);
  const carnPalettes = [['#ffd0e0', '#ff9cc0', '#e8508a'], ['#ffc2d8', '#ff7fae', '#d93a78'], ['#ffe0ea', '#ffb0cb', '#f06598']];
  const carnLayers = [[11, 0.40, 0.15, 0.35, 1.1], [10, 0.36, 0.14, 0.6, 0.9], [9, 0.31, 0.13, 0.85, 0.7], [8, 0.26, 0.12, 1.1, 0.5], [6, 0.2, 0.11, 1.3, 0.3]];
  function carnGeo(pal) {
    const [light, mid, deep] = pal.map(h => new THREE.Color(h));
    const tmp = new THREE.Color(), list = [];
    carnLayers.forEach((ly, li) => {
      const off = rnd(TAU);
      const edge = light.clone().lerp(mid, li / 4), base = mid.clone().lerp(deep, Math.min(1, li / 4 + 0.2));
      for (let i = 0; i < ly[0]; i++) {
        const g = buildPetal({
          L: ly[1] * rnd(0.9, 1.1), W: ly[2], t0: ly[3] + rnd(-0.08, 0.08), k: ly[4], kp: 1.3,
          cup: 0.25, ruf: 0.05, rf: 6, ph: rnd(6), serr: 0.045, sf: 3, nu: 8, nv: 14, wf: carnW,
          color: (u, v) => tmp.copy(base).lerp(edge, Math.pow(u, 1.3) * (1 - 0.15 * Math.abs(v)))
        });
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ(off + i * TAU / ly[0] + rnd(-0.15, 0.15)));
        list.push(g);
      }
    });
    return merge(list);
  }
  const carnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide, emissive: 0x3a0a1c, emissiveIntensity: 0.5 });
  for (let i = 0; i < 8; i++) {
    const { p, d } = place(1.3, 0.38, 0.1, 1.1);
    const n = d.clone().add(V3(0, 0.25, 0)).normalize();
    const calyx = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.07, 0.3, 10), calyxMat);
    calyx.rotation.x = Math.PI / 2; calyx.position.z = -0.14;
    addFlower(carnGeo(pick(carnPalettes)), carnMat, p, n, rnd(TAU), calyx);
    addStem(p.clone().addScaledVector(n, -0.2), 0.022, stemMat);
  }

  // ---------- baby's breath ----------
  const blossoms = [], twigGeos = [];
  for (let i = 0; i < 13; i++) {
    const { p } = place(1.75, 0.28, 0.1, 1.25);
    addStem(p, 0.011, twigMat);
    for (let b = 0; b < 4; b++) {
      const bp = p.clone().add(V3(rnd(-0.28, 0.28), rnd(-0.2, 0.28), rnd(-0.28, 0.28)));
      twigGeos.push(cylBetween(p, bp, 0.006)); blossoms.push(bp);
      for (let t = 0; t < 4; t++) {
        const tp = bp.clone().add(V3(rnd(-0.16, 0.16), rnd(-0.12, 0.16), rnd(-0.16, 0.16)));
        twigGeos.push(cylBetween(bp, tp, 0.004)); blossoms.push(tp);
      }
    }
  }
  bouquet.add(new THREE.Mesh(merge(twigGeos), twigMat));
  const bGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 });
  const bInst = new THREE.InstancedMesh(bGeo, bMat, blossoms.length);
  const qI = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  blossoms.forEach((bp, i) => { const s = rnd(0.8, 1.35); bInst.setMatrixAt(i, m4.compose(bp, qI, V3(s, s, s))); });
  bouquet.add(bInst);

  // ---------- white roses (filler) ----------
  const roseW = u => Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.5);
  // [petal count, length, half-width, start angle, curl, cup]
  const roseLayers = [[3, 0.22, 0.17, 1.35, -0.4, 0.8], [4, 0.27, 0.19, 1.2, -0.1, 0.8], [5, 0.32, 0.22, 1.0, 0.25, 0.75], [6, 0.37, 0.25, 0.75, 0.6, 0.7], [6, 0.42, 0.27, 0.5, 0.9, 0.7]];
  function roseGeo() {
    const tmp = new THREE.Color(), list = [];
    roseLayers.forEach((ly, li) => {
      const off = rnd(TAU);
      const base = new THREE.Color('#f0e0d0').lerp(new THREE.Color('#f8ece2'), li / 4);
      const edge = new THREE.Color('#ffffff');
      for (let i = 0; i < ly[0]; i++) {
        const g = buildPetal({
          L: ly[1] * rnd(0.92, 1.08), W: ly[2], t0: ly[3] + rnd(-0.06, 0.06), k: ly[4], kp: 1.2,
          cup: ly[5], ruf: 0.02, rf: 4, ph: rnd(6), nu: 9, nv: 8, wf: roseW,
          color: (u, v) => tmp.copy(base).lerp(edge, Math.pow(u, 1.2))
        });
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ(off + i * TAU / ly[0] + rnd(-0.12, 0.12)));
        list.push(g);
      }
    });
    return merge(list);
  }
  const roseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x3a3036, emissiveIntensity: 0.4 });
  for (let i = 0; i < 9; i++) {
    const { p, d } = place(1.15, 0.34, 0.2, 1.2);
    const n = d.clone().add(V3(0, 0.2, 0)).normalize();
    const sepals = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8), calyxMat);
    sepals.rotation.x = -Math.PI / 2; sepals.position.z = -0.1;
    addFlower(roseGeo(), roseMat, p, n, rnd(TAU), sepals);
    addStem(p.clone().addScaledVector(n, -0.18), 0.024, stemMat);
  }

  // ---------- collar of carnations & white roses covering the stems above the wrap ----------
  function collar(count, radius, y, upness, scale, phase) {
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU + rnd(-0.12, 0.12);
      const out = V3(Math.cos(a), 0, Math.sin(a));
      const p = V3(out.x * radius * rnd(0.95, 1.05), y + rnd(-0.05, 0.05), out.z * radius * rnd(0.95, 1.05));
      const n = out.clone().multiplyScalar(1 - upness).add(V3(0, upness, 0)).normalize();
      const isRose = i % 2 === 1;
      const extra = new THREE.Mesh(isRose ? new THREE.ConeGeometry(0.13, 0.22, 8) : new THREE.CylinderGeometry(0.15, 0.07, 0.3, 10), calyxMat);
      extra.rotation.x = isRose ? -Math.PI / 2 : Math.PI / 2;
      extra.position.z = isRose ? -0.1 : -0.14;
      addFlower(isRose ? roseGeo() : carnGeo(pick(carnPalettes)), isRose ? roseMat : carnMat, p, n, rnd(TAU), extra, scale);
      addStem(p.clone().addScaledVector(n, -0.15), 0.022, stemMat);
    }
  }
  collar(12, 0.9, 0.36, 0.45, 0.95, 0);   // low ring that sits on the rim
  collar(8, 0.55, 0.85, 0.6, 0.9, 0.4);   // second ring above it

  // ---------- paper wrap, ribbon, bow ----------
  const RIM_Y = 0.2, TIP_Y = -2.5, RIM_R = 0.95, CONE_H = RIM_Y - TIP_Y;
  const coneGeo = new THREE.CylinderGeometry(RIM_R, 0.01, CONE_H, 64, 10, true);
  const cp = coneGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const t = (y + CONE_H / 2) / CONE_H, ang = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.sin(ang * 7) * t;
    cp.setXYZ(i, x * k, y + (t > 0.99 ? 0.05 * Math.sin(ang * 5) : 0), z * k);
  }
  coneGeo.computeVertexNormals();
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xfdf3f6, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x2a1a22, emissiveIntensity: 0.6 }));
  cone.position.y = (RIM_Y + TIP_Y) / 2;
  bouquet.add(cone);

  const ribMat = new THREE.MeshStandardMaterial({ color: 0xee7fa6, roughness: 0.35, side: THREE.DoubleSide, emissive: 0x401024, emissiveIntensity: 0.4 });
  const rAt = y => RIM_R * (y - TIP_Y) / CONE_H * 1.08;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(rAt(-0.4), rAt(-0.5), 0.1, 64, 1, true), ribMat);
  ribbon.position.y = -0.45; bouquet.add(ribbon);
  const bow = new THREE.Group();
  [-1, 1].forEach(s => {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 20), ribMat);
    loop.scale.x = 1.25; loop.position.x = s * 0.15; loop.rotation.z = s * 0.5; bow.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.012), ribMat);
    tail.position.set(s * 0.06, -0.22, 0); tail.rotation.z = s * 0.22; bow.add(tail);
  });
  bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), ribMat));
  bow.position.set(0, -0.45, rAt(-0.45) + 0.02); bow.rotation.x = 0.34;
  bouquet.add(bow);

  // ---------- glow particles ----------
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uBoost: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      varying vec3 vColor; varying float vA; uniform float uTime; uniform float uScale; uniform float uBoost;
      void main() {
        vColor = aColor;
        vA = (0.45 + 0.55 * abs(sin(uTime * 1.5 + aPhase))) * uBoost;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float g = exp(-d * d * 5.0), core = smoothstep(0.25, 0.0, d);
        gl_FragColor = vec4(vColor * (g + core) * vA, g * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  function points(n, fill) {
    const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) fill(i, pos, size, ph, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, pMat); pts.frustumCulled = false;
    return pts;
  }
  const palette = [[1, 0.84, 0.47], [1, 0.59, 0.78], [0.78, 0.67, 1], [1, 1, 1]];
  const N = reduceMotion ? 110 : 240;
  const pd = Array.from({ length: N }, () => ({ a: rnd(TAU), r: rnd(1.3, 4.2), y: rnd(-3, 3.4), sp: rnd(0.1, 0.45) * (Math.random() < 0.5 ? 1 : -1), rise: rnd(0.08, 0.3) }));
  const sparkles = points(N, (i, pos, size, ph, col) => {
    size[i] = rnd(200, 520); ph[i] = rnd(TAU);
    const c = pick(palette); col.set(c, i * 3);
  });
  scene.add(sparkles);
  bouquet.add(points(blossoms.length, (i, pos, size, ph, col) => {
    pos.set([blossoms[i].x, blossoms[i].y, blossoms[i].z], i * 3);
    size[i] = rnd(90, 150); ph[i] = rnd(TAU); col.set([0.9, 0.9, 1], i * 3);
  }));

  // ---------- spin-reactive floral line glow ----------
  // Glowing vines wind around the bouquet. A bright trail chases the spin direction,
  // and small line-drawn blossoms bloom as the trail passes them. Idle = invisible.
  const glowTime = { value: 0 };
  const glowGroup = new THREE.Group();
  scene.add(glowGroup);
  function glowMat(color, mode) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: 0 }, uDir: { value: 1 }, uTrail: { value: 0.3 }, uAmt: { value: 0 }, uSoft: { value: 0 }, uTime: glowTime },
      vertexShader: `
        varying float vU; varying vec3 vN; varying vec3 vV;
        void main() {
          vU = uv.x;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uHead; uniform float uDir; uniform float uTrail; uniform float uAmt; uniform float uSoft; uniform float uTime;
        varying float vU; varying vec3 vN; varying vec3 vV;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float core = pow(facing, 2.0);
          float mask;
          ${mode === 'trail'
            ? 'float d = fract((uHead - vU) * uDir); mask = d < uTrail ? pow(1.0 - d / uTrail, 1.4) : 0.0;'
            : 'mask = 0.65 + 0.35 * sin(vU * 40.0 - uTime * 6.0);'}
          float edge = mix(0.6 + 0.4 * core, facing * facing, uSoft);
          float a = mask * uAmt * edge;
          gl_FragColor = vec4(uColor * (0.4 + core), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
  }

  const vineCols = ['#ffd27a', '#ff8fc4', '#c9b0ff', '#ffe9b0', '#ff9fd0', '#b8d8ff'];
  const petalOutline = (() => {
    const pts = [];
    for (let i = 0; i < 80; i++) {
      const th = (i / 80) * TAU, r = 0.2 * (0.45 + 0.55 * Math.abs(Math.cos(2.5 * th)));
      pts.push(V3(Math.cos(th) * r, Math.sin(th) * r, 0));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.01, 4, true);
  })();
  const vines = [];
  for (let v = 0; v < 6; v++) {
    const a0 = rnd(TAU), dir = v % 2 ? 1 : -1, ph = rnd(TAU), pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, a = a0 + dir * t * TAU * 1.6, r = 2.05 + 0.3 * Math.sin(t * TAU * 2.5 + ph);
      pts.push(V3(Math.cos(a) * r, -2.3 + t * 4.6 + 0.12 * Math.sin(t * TAU * 4 + ph), Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const core = glowMat(vineCols[v], 'trail'), halo = glowMat(vineCols[v], 'trail');
    halo.uniforms.uSoft.value = 1;
    const m1 = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.011, 5, false), core);
    const m2 = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.07, 8, false), halo);
    m1.renderOrder = m2.renderOrder = 10;
    glowGroup.add(m1, m2);
    const vine = { head: rnd(), speed: 0.22 + v * 0.04, core, halo, accents: [] };
    for (let k = 0; k < 6; k++) {
      const u0 = (k + 0.5) / 6 + rnd(-0.04, 0.04), p = curve.getPointAt(u0);
      const mat = glowMat(vineCols[v], 'pulse');
      const grp = new THREE.Group();
      grp.position.copy(p); grp.lookAt(0, p.y, 0);
      const f1 = new THREE.Mesh(petalOutline, mat), f2 = new THREE.Mesh(petalOutline, mat);
      f2.scale.setScalar(0.5); f2.rotation.z = Math.PI / 5;
      f1.renderOrder = f2.renderOrder = 10;
      grp.add(f1, f2); glowGroup.add(grp);
      vine.accents.push({ grp, mat, u0 });
    }
    vines.push(vine);
  }
  // letters: one new letter in each word per LETTER_STEP radians of fast, user-driven spinning
  const buildWord = el => [...el.dataset.text].map(ch => {
    const sp = document.createElement('span');
    sp.textContent = ch; sp.setAttribute('aria-hidden', 'true');
    el.appendChild(sp);
    return sp;
  });
  const lettersL = buildWord(document.getElementById('wordL'));
  const lettersR = buildWord(document.getElementById('wordR'));
  const maxLetters = Math.max(lettersL.length, lettersR.length);
  const LETTER_STEP = 0.8;
  let spinAcc = 0, revealed = 0;

  let glow = 0, wS = 0, dirSign = 1, prevRot = 0;
  const fract = x => x - Math.floor(x);
  function updateGlow(dt, time) {
    const w = (bouquet.rotation.y - prevRot) / Math.max(dt, 0.001); prevRot = bouquet.rotation.y;
    wS += (w - wS) * Math.min(1, dt * 10);
    if (Math.abs(wS) > 0.15) dirSign = Math.sign(wS);
    if (started && revealed < maxLetters && Math.abs(wS) > 0.55) {
      spinAcc += Math.abs(wS) * dt;
      while (spinAcc >= LETTER_STEP && revealed < maxLetters) {
        spinAcc -= LETTER_STEP;
        [lettersL[revealed], lettersR[revealed]].forEach(l => l && l.classList.add('on'));
        revealed++;
      }
    }
    const target = THREE.MathUtils.clamp((Math.abs(wS) - 0.55) / 2.2, 0, 1);
    glow += (target - glow) * Math.min(1, dt * (target > glow ? 9 : 1.6));
    glowTime.value = time;
    glowGroup.visible = glow > 0.003;
    pMat.uniforms.uBoost.value = 1 + glow;
    const trail = 0.18 + 0.25 * glow;
    vines.forEach(v => {
      v.head = fract(v.head + wS * dt * v.speed);
      [v.core, v.halo].forEach(m => { m.uniforms.uHead.value = v.head; m.uniforms.uDir.value = dirSign; m.uniforms.uTrail.value = trail; });
      v.core.uniforms.uAmt.value = glow * 1.6;
      v.halo.uniforms.uAmt.value = glow * 0.55;
      v.accents.forEach(a => {
        const d = fract((v.head - a.u0) * dirSign), span = trail * 1.4;
        const b = d < span ? Math.pow(1 - d / span, 1.2) : 0;
        a.mat.uniforms.uAmt.value = glow * b * 1.5;
        a.grp.visible = b > 0.01;
        a.grp.scale.setScalar(0.3 + 0.9 * b);
      });
    });
  }

  // ---------- interaction & loop ----------
  let started = false;
  let dragging = false, lastX = 0, vel = 0;
  canvas.addEventListener('pointerdown', e => { if (!started) return; dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    bouquet.rotation.y += dx * 0.008; vel = dx * 0.008;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(2.9 / t, 2.5 / (t * camera.aspect));
    camera.position.set(0, d * 0.2, d);
    camera.lookAt(LOOK);
    camera.updateProjectionMatrix();
    pMat.uniforms.uScale.value = (h / 900) * renderer.getPixelRatio();
  }
  window.addEventListener('resize', resize);
  resize();

  const pAttr = sparkles.geometry.attributes.position;
  pd.forEach((p, i) => pAttr.setXYZ(i, Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r));
  pAttr.needsUpdate = true;
  let last = performance.now(), time = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!started) { renderer.render(scene, camera); requestAnimationFrame(loop); return; }
    time += dt;
    if (!dragging) { vel *= 0.95; bouquet.rotation.y += (reduceMotion ? 0.06 : 0.4) * dt + vel; }
    updateGlow(dt, time);
    bouquet.rotation.z = Math.sin(time * 0.6) * 0.02;
    bouquet.position.y = Math.sin(time * 0.9) * 0.04;
    pd.forEach((p, i) => {
      p.y += p.rise * dt * (reduceMotion ? 0.3 : 1);
      if (p.y > 3.6) p.y = -3.2;
      p.a += p.sp * dt * 0.5;
      pAttr.setXYZ(i, Math.cos(p.a) * p.r + Math.sin(time + i) * 0.08, p.y, Math.sin(p.a) * p.r);
    });
    pAttr.needsUpdate = true;
    pMat.uniforms.uTime.value = time;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- start screen & music ----------
  const intro = document.getElementById('intro');
  const startBtn = document.getElementById('startBtn');
  const bgm = document.getElementById('bgm');
  const musicBtn = document.getElementById('musicBtn');
  bgm.volume = 0.5; // 0 to 1
  const setMusicLabel = () => { musicBtn.textContent = bgm.paused ? 'Play music' : 'Pause music'; };

  startBtn.addEventListener('click', () => {
    started = true;                    // unfreezes rotation, particles and glow
    intro.classList.add('hide');
    bgm.play().then(() => { musicBtn.hidden = false; setMusicLabel(); })
      .catch(() => {});                // no music.mp3 yet: the scene still runs silently
    last = performance.now();
  });
  musicBtn.addEventListener('click', () => {
    if (bgm.paused) bgm.play().then(setMusicLabel).catch(() => {}); else { bgm.pause(); setMusicLabel(); }
  });
})();