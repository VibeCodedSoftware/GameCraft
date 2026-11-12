// Procedural animation on the user's rigged characters (ProceduralCharacters.blend): the rig is read from the
// skeleton's shape, feet stay planted and step in alternating groups with IK, snakes slither, ragdolls fall onto the
// ground and get up again. The ground is a flat floor at y = 0 (or a raised step).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { blendToThree, extractObject } from '../src/asset-import/blend/blendToThree';
import { ProcAnimator, analyzeRig, solveFabrik, poseChain, type ProcFrame } from '../src/engine/procAnim';

const FILE = new URL('../asset-library/characters/ProceduralCharacters.blend', import.meta.url);
const res = blendToThree(fs.readFileSync(FILE));

/** A character standing on the floor, inside an object node that moves like a game object. */
function character(name: string) {
  const ex = extractObject(res, name, (o) => SkeletonUtils.clone(o))!;
  const model = ex.group;
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.position.x -= (box.min.x + box.max.x) / 2; model.position.z -= (box.min.z + box.max.z) / 2;
  const obj = new THREE.Group(); obj.add(model);
  obj.updateMatrixWorld(true);
  return { obj, model, height: box.max.y - box.min.y };
}

type Ground = (x: number, z: number) => number;
const groundOf = (h: Ground) => (from: THREE.Vector3, dir: THREE.Vector3, max: number) => {
  if (dir.y > -0.5) return null; // floors only
  const y = h(from.x, from.z), t = (from.y - y) / -dir.y;
  return t >= 0 && t <= max ? { point: new THREE.Vector3(from.x, y, from.z), normal: new THREE.Vector3(0, 1, 0) } : null;
};
const flat = groundOf(() => 0);
const frame = (o: Partial<ProcFrame>): ProcFrame => ({ dt: 1 / 60, time: 0, velocity: new THREE.Vector3(), ground: flat, props: {}, ragdoll: null, climb: null, lookAt: null, ...o });

const tipOf = (c: { bones: THREE.Bone[]; tip: THREE.Vector3 }) => c.bones[c.bones.length - 1].localToWorld(c.tip.clone());
const noNaN = (root: THREE.Object3D) => { let ok = true; root.traverse((o) => { if (o.quaternion.toArray().some((x) => !Number.isFinite(x)) || o.position.toArray().some((x) => !Number.isFinite(x))) ok = false; }); return ok; };

/** Walk along +X at `speed` for `seconds`, recording each leg's foot. */
function walk(name: string, speed: number, seconds: number, ground = flat, props: Record<string, any> = {}) {
  const c = character(name);
  const anim = new ProcAnimator(c.model, 'auto');
  const legs = (anim as any).legs as { chain: any; step: any; group: number; planted: THREE.Vector3 | null }[];
  const legLen = (anim as any).legLen as number;
  const log: { t: number; x: number; feet: THREE.Vector3[]; stepping: boolean[]; groups: number[] }[] = [];
  // Each foot's tip height standing on the floor (the sole is below the bone's tip).
  const lift = legs.map((l) => tipOf(l.chain).y);
  const dt = 1 / 60;
  for (let k = 0; k < seconds * 60; k++) {
    c.obj.position.x += speed * dt;
    // The object rides the ground (a character controller would): its base follows the floor under its centre.
    c.obj.position.y = Math.max(0, ...[0].map(() => (ground === flat ? 0 : (ground(new THREE.Vector3(c.obj.position.x, 50, c.obj.position.z), new THREE.Vector3(0, -1, 0), 100)?.point.y ?? 0))));
    c.obj.updateMatrixWorld(true);
    anim.update(frame({ dt, time: k * dt, velocity: new THREE.Vector3(speed, 0, 0), ground, props }));
    log.push({ t: k * dt, x: c.obj.position.x, feet: legs.map((l) => tipOf(l.chain)), stepping: legs.map((l) => !!l.step), groups: legs.map((l) => l.group) });
  }
  return { ...c, anim, legs, legLen, log, lift };
}

describe('procedural animation: reading the rigs', () => {
  const cases: [string, string, number][] = [['ProceduralHuman', 'human', 2], ['TwoLeggedCube', 'human', 2], ['4LeggedCube', 'quadruped', 4], ['ProceduralsPIDER', 'spider', 8], ['ProceduralSnake', 'snake', 0], ['ProceduralOcto', 'octopus', 0]];
  for (const [name, kind, legs] of cases) it(`${name}: ${kind}, ${legs} legs`, () => {
    const info = analyzeRig(character(name).model);
    expect(info.kind).toBe(kind);
    expect(info.chains.filter((c) => c.role === 'leg').length).toBe(legs);
  });
  it('human: two arms and a head; octopus: 8 tentacles; snake: a 6-bone spine', () => {
    const h = analyzeRig(character('ProceduralHuman').model).chains;
    expect(h.filter((c) => c.role === 'arm').length).toBe(2);
    expect(h.filter((c) => c.role === 'head').length).toBe(1);
    expect(analyzeRig(character('ProceduralOcto').model).chains.filter((c) => c.role === 'tentacle').length).toBe(8);
    expect(analyzeRig(character('ProceduralSnake').model).chains.find((c) => c.role === 'spine')!.bones.length).toBe(6);
  });
  it('the bone mapping and the Rig choice override the guess', () => {
    const m = character('ProceduralHuman').model;
    const info = analyzeRig(m, 'robot', { Bone011: 'ignore' });
    expect(info.kind).toBe('robot'); expect(info.auto).toBe('human');
    expect(info.chains.find((c) => c.name === 'Bone011')!.role).toBe('ignore');
  });
});

describe('procedural animation: IK', () => {
  it('FABRIK reaches a reachable target and bends toward the pole', () => {
    const { model } = character('ProceduralHuman');
    const leg = analyzeRig(model).chains.find((c) => c.role === 'leg')!;
    const base = leg.bones[0].getWorldPosition(new THREE.Vector3());
    const target = base.clone().add(new THREE.Vector3(0.6, -leg.length * 0.8, 0));
    const pole = base.clone().add(new THREE.Vector3(5, -leg.length * 0.4, 0));
    const pts = solveFabrik(leg.bones, leg.tip, target, pole);
    poseChain(leg.bones, leg.tip, pts);
    expect(tipOf(leg).distanceTo(target)).toBeLessThan(leg.length * 0.01);
    // The knee (middle joint) points toward the pole (+X), not backward.
    const knee = leg.bones[Math.floor(leg.bones.length / 2)].getWorldPosition(new THREE.Vector3());
    expect(knee.x).toBeGreaterThan((base.x + target.x) / 2);
  });
});

describe('procedural animation: walking', () => {
  it('human: planted feet never slide, the two legs alternate, feet stay on the floor and keep up', () => {
    const w = walk('ProceduralHuman', 3, 4);
    let steps = 0;
    for (let k = 1; k < w.log.length; k++) {
      const a = w.log[k - 1], b = w.log[k];
      expect(b.stepping.filter(Boolean).length).toBeLessThanOrEqual(1);
      b.stepping.forEach((s, i) => {
        if (!s && !a.stepping[i]) expect(b.feet[i].distanceTo(a.feet[i])).toBeLessThan(w.legLen * 0.02); // planted
        if (s && !a.stepping[i]) steps++;
        if (!s) expect(Math.abs(b.feet[i].y - w.lift[i])).toBeLessThan(w.legLen * 0.03); // on the floor
        expect(Math.abs(b.feet[i].x - b.x)).toBeLessThan(w.legLen * 1.6); // never left behind
      });
    }
    expect(steps).toBeGreaterThanOrEqual(4); // it really walked (12 m with an 11 m tall model: ~4 m strides)
    expect(noNaN(w.model)).toBe(true);
  });
  it('quadruped and spider: legs step in two alternating groups', () => {
    for (const name of ['4LeggedCube', 'ProceduralsPIDER']) {
      const w = walk(name, 2, 3);
      let steps = 0;
      for (const f of w.log) {
        const g = new Set(f.stepping.map((s, i) => (s ? f.groups[i] : -1)).filter((x) => x >= 0));
        expect(g.size).toBeLessThanOrEqual(1);
        steps += f.stepping.filter(Boolean).length;
      }
      expect(steps).toBeGreaterThan(0);
      expect(new Set(w.log[0].groups).size).toBe(2);
      expect(noNaN(w.model)).toBe(true);
    }
  });
  it('a raised step: feet land on top of it', () => {
    const stepGround = groundOf((x) => (x >= 4 ? 0.8 : 0));
    const w = walk('ProceduralHuman', 2, 6, stepGround);
    const last = w.log[w.log.length - 1];
    expect(last.x).toBeGreaterThan(10);
    last.feet.forEach((f, i) => { if (!last.stepping[i]) expect(f.y - w.lift[i]).toBeCloseTo(0.8, 1); });
  });
  it('T-pose arms hang at the sides', () => {
    const { model } = character('ProceduralHuman');
    const anim = new ProcAnimator(model);
    anim.update(frame({}));
    for (const c of anim.info.chains.filter((x) => x.role === 'arm')) {
      const base = c.bones[0].getWorldPosition(new THREE.Vector3());
      expect(base.y - tipOf(c).y).toBeGreaterThan(c.length * 0.8);
    }
  });
  it('standing still: feet settle under the body and stop stepping', () => {
    const w = walk('ProceduralHuman', 0, 3);
    expect(w.log.slice(-30).every((f) => f.stepping.every((s) => !s))).toBe(true);
  });
});

describe('procedural animation: snake, octopus, climbing', () => {
  it('snake: the body waves sideways while it moves', () => {
    const { obj, model } = character('ProceduralSnake');
    const anim = new ProcAnimator(model);
    const spine = anim.info.chains.find((c) => c.role === 'spine')!;
    const tail = () => tipOf(spine);
    const zs: number[] = [];
    for (let k = 0; k < 120; k++) { obj.position.x += 2 / 60; obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, velocity: new THREE.Vector3(2, 0, 0) })); zs.push(spine.bones[3].getWorldPosition(new THREE.Vector3()).z); }
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.2);
    expect(Number.isFinite(tail().x)).toBe(true);
  });
  it('octopus: tentacles move, without NaN', () => {
    const { obj, model } = character('ProceduralOcto');
    const anim = new ProcAnimator(model);
    const t = anim.info.chains.find((c) => c.role === 'tentacle')!;
    const a = tipOf(t);
    for (let k = 0; k < 60; k++) { obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, velocity: new THREE.Vector3(1, 0, 0) })); }
    expect(tipOf(t).distanceTo(a)).toBeGreaterThan(0.05);
    expect(noNaN(model)).toBe(true);
  });
  it('snake: the head leads, and the body follows the path the head took', () => {
    const { obj, model } = character('ProceduralSnake');
    const anim = new ProcAnimator(model);
    const spine = anim.info.chains.find((c) => c.role === 'spine')!;
    const path: THREE.Vector3[] = [];
    let headFront = 0, n = 0;
    for (let k = 0; k < 360; k++) {
      obj.position.x += 2 / 60; obj.updateMatrixWorld(true);
      anim.update(frame({ time: k / 60, dt: 1 / 60, velocity: new THREE.Vector3(2, 0, 0) }));
      const head = tipOf(spine), tail = spine.bones[0].getWorldPosition(new THREE.Vector3());
      path.push(head);
      if (k > 60) { n++; if (head.x > tail.x) headFront++; }
    }
    expect(headFront).toBe(n); // never tail-first
    // A point near the tail is where the head has already been (not sliding sideways through fresh ground).
    const tail = spine.bones[1].getWorldPosition(new THREE.Vector3());
    const nearest = Math.min(...path.map((p) => Math.hypot(p.x - tail.x, p.z - tail.z)));
    const L = spine.length;
    expect(nearest).toBeLessThan(L * 0.12);
    expect(noNaN(model)).toBe(true);
  });
  it('octopus: lies flat on the floor and crawls: arms along the ground, planted tips stay put', () => {
    const { obj, model } = character('ProceduralOcto');
    const anim = new ProcAnimator(model);
    const legs = (anim as any).legs as { chain: any; step: any; planted: THREE.Vector3 | null }[];
    expect(legs.length).toBe(8);
    const baseY = () => legs[0].chain.bones[0].getWorldPosition(new THREE.Vector3()).y;
    const y0 = baseY();
    let stepped = 0, slipped = 0, maxTipGap = 0, highest = 0;
    const was = legs.map(() => null as THREE.Vector3 | null);
    for (let k = 0; k < 300; k++) {
      obj.position.x += 1 / 60; obj.updateMatrixWorld(true);
      anim.update(frame({ time: k / 60, dt: 1 / 60, velocity: new THREE.Vector3(1, 0, 0) }));
      legs.forEach((l, n) => {
        const tip = tipOf(l.chain);
        if (k > 60 && !l.step && l.planted) { maxTipGap = Math.max(maxTipGap, tip.distanceTo(l.planted)); if (was[n] && was[n]!.distanceTo(tip) > 0.08) slipped++; was[n] = tip; }
        else { if (l.step) stepped++; was[n] = null; }
        // Everything past the arm's first bone stays low: along the floor, never standing on the tips.
        if (k > 60) for (const b of l.chain.bones.slice(2)) highest = Math.max(highest, b.getWorldPosition(new THREE.Vector3()).y);
      });
    }
    expect(stepped).toBeGreaterThan(50);
    expect(slipped).toBe(0);
    expect(maxTipGap).toBeLessThan(0.15);
    expect(baseY()).toBeLessThanOrEqual(y0 + 1e-6); // down on the floor, not held up
    expect(highest).toBeLessThan(y0); // not arching up from it: lower than the arm's root was standing
    expect(noNaN(model)).toBe(true);
  });
  it('spider: every foot reaches the ground with the lowest point of its own leg', () => {
    const { obj, model } = character('ProceduralsPIDER');
    const anim = new ProcAnimator(model);
    for (let k = 0; k < 30; k++) { obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, dt: 1 / 60 })); }
    const legs = (anim as any).legs as { chain: any }[];
    obj.updateMatrixWorld(true);
    for (const l of legs) {
      let low = Infinity;
      l.chain.bones[l.chain.bones.length - 1].traverse((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh) low = Math.min(low, new THREE.Box3().setFromObject(o, true).min.y); });
      expect(Math.abs(low)).toBeLessThan(0.6); // hanging legs were up to 1.3 above the floor
    }
  });
  it('spider: turning fast, no foot is dragged across under the body', () => {
    const { obj, model } = character('ProceduralsPIDER');
    const anim = new ProcAnimator(model);
    const legs = (anim as any).legs as { chain: any; home: THREE.Vector3 }[];
    for (let k = 0; k < 40; k++) { obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, dt: 1 / 60 })); }
    let worst = 0;
    for (let k = 0; k < 240; k++) {
      obj.rotation.y += (Math.PI * 300 / 180) / 60; obj.updateMatrixWorld(true); // 300°/s, the Wander default
      anim.update(frame({ time: k / 60, dt: 1 / 60 }));
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      for (const l of legs) {
        const tip = tipOf(l.chain).applyMatrix4(inv);
        worst = Math.max(worst, Math.hypot(tip.x - l.home.x, tip.z - l.home.z));
      }
    }
    // The feet stand about 7 from the centre: a dragged foot ended up more than 9 from where it belongs.
    expect(worst).toBeLessThan(6);
  });
  it('climbing: the body turns to stand on the wall', () => {
    const { obj, model } = character('ProceduralsPIDER');
    const anim = new ProcAnimator(model);
    for (let k = 0; k < 90; k++) { obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, climb: [-1, 0, 0] })); }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.quaternion.clone().multiply((anim as any).restQ.clone().invert()));
    expect(up.x).toBeLessThan(-0.9);
  });
});

describe('procedural animation: ragdoll', () => {
  it('human: topples and lies on the floor, then gets up', () => {
    const { obj, model, height } = character('ProceduralHuman');
    const anim = new ProcAnimator(model);
    for (let k = 0; k < 10; k++) anim.update(frame({ time: k / 60 }));
    const ragdoll = { since: 0, push: [2, 0, 0] as [number, number, number] };
    for (let k = 0; k < 150; k++) { obj.updateMatrixWorld(true); anim.update(frame({ time: k / 60, ragdoll })); }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.quaternion.clone().multiply((anim as any).restQ.clone().invert()));
    expect(up.y).toBeLessThan(0.3); // lying down
    expect(up.x).toBeGreaterThan(0.5); // fell the way it was pushed
    let lowest = Infinity; model.traverse((o) => { if ((o as THREE.Bone).isBone) lowest = Math.min(lowest, o.getWorldPosition(new THREE.Vector3()).y); });
    expect(lowest).toBeGreaterThan(-height * 0.05); // nothing sinks into the floor
    expect(noNaN(model)).toBe(true);
    for (let k = 0; k < 60; k++) anim.update(frame({ time: 3 + k / 60 }));
    const up2 = new THREE.Vector3(0, 1, 0).applyQuaternion(model.quaternion.clone().multiply((anim as any).restQ.clone().invert()));
    expect(up2.y).toBeGreaterThan(0.99); // standing again
  });
  it('reset puts every bone back as imported', () => {
    const { model } = character('ProceduralsPIDER');
    const before: number[] = []; model.traverse((o) => before.push(...o.quaternion.toArray()));
    const anim = new ProcAnimator(model);
    for (let k = 0; k < 60; k++) anim.update(frame({ time: k / 60, velocity: new THREE.Vector3(2, 0, 0) }));
    anim.reset();
    const after: number[] = []; model.traverse((o) => after.push(...o.quaternion.toArray()));
    after.forEach((x, i) => expect(x).toBeCloseTo(before[i], 6));
  });
});
