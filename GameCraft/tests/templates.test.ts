// Every template must build, validate, run, and its core mechanic must actually work when played
// with simulated input (headless, same shared runtime as Play mode).
import { describe, expect, it } from 'vitest';
import { Runtime } from '@shared/src/runtime/runtime';
import { validateDocument } from '@shared/src/validate';
import { deepClone } from '@shared/src/schema';
import { editSphere } from '@shared/src/runtime/voxel';
import { TEMPLATES } from '../src/templates';
import { migrateProject } from '../src/project/migrate';
import { typeSummaries } from '../src/editor/actions';
import type { GameProject } from '../src/project/types';

function start(p: GameProject) {
  const scene = p.scenes[0];
  const logs: string[] = [];
  const rt = new Runtime(deepClone(scene), p.logic, { app: 'gamecraft', host: { log: (l, m) => logs.push(`${l}: ${m}`) } });
  return { rt, logs };
}
function hold(rt: Runtime, keys: string[], seconds: number) {
  keys.forEach((k) => rt.input.keyDown(k));
  for (let i = 0; i < Math.round(seconds * 60); i++) rt.tick();
  keys.forEach((k) => rt.input.keyUp(k));
}
function press(rt: Runtime, key: string) { rt.input.keyDown(key); rt.tick(); rt.input.keyUp(key); rt.tick(); }
const run = (rt: Runtime, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) rt.tick(); };

describe('template uids', () => {
  it('every placed object has its own uid', () => {
    for (const t of TEMPLATES) {
      const p = t.build();
      for (const s of p.scenes) expect(new Set(s.instances.map((i) => i.uid)).size, `${t.name} / ${s.name}`).toBe(s.instances.length);
    }
  });
});

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: builds, saves/reloads, validates and runs 5 s without runtime errors`, () => {
      const p = t.build();
      const reloaded = migrateProject(JSON.parse(JSON.stringify(p)));
      expect(reloaded.scenes[0].instances.length).toBe(p.scenes[0].instances.length);
      const types = typeSummaries(p.scenes[0]).map((x) => ({ name: x.name, vars: x.vars.map((v: any) => v.name), behaviors: x.behaviors }));
      const errors = validateDocument(p.logic, { app: 'gamecraft', types }).filter((i) => i.level === 'error');
      expect(errors.map((e) => e.message)).toEqual([]);
      const { rt } = start(p);
      run(rt, 5);
      expect(rt.errors.map((e) => e.message)).toEqual([]);
      expect(rt.halted).toBe(false);
    });
  }

  it('Truck: driving forward collects a coin, updates the counter and spawns particles', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'truck')!.build());
    const total = rt.world.of('Coin').length;
    hold(rt, ['W'], 2.2);
    expect(rt.globals.totalCoins).toBe(total);
    expect(rt.globals.coins).toBeGreaterThanOrEqual(1);
    expect(rt.world.of('Coin').length).toBe(total - rt.globals.coins);
    expect(rt.world.of('CoinsText')[0].text!.text).toContain(`${rt.globals.coins} / ${total}`);
    expect(rt.globals.time).toBeGreaterThan(2);
  });

  it('Truck: steering turns the truck and the finish requires all coins', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'truck')!.build());
    const truck = rt.world.of('Truck')[0];
    const a0 = rt.world.angle(truck);
    hold(rt, ['W'], 1); hold(rt, ['W', 'A'], 1);
    expect(Math.abs(rt.world.angle(truck) - a0)).toBeGreaterThan(20);
    const finish = rt.world.of('Finish')[0];
    truck.x = finish.x; truck.z = finish.z; run(rt, 0.2);
    expect(rt.ui.message?.text).toMatch(/Collect all the coins/);
    expect(rt.ui.screen).toBeNull();
  });

  it('3D Platformer: player lands, jumps, collects a gem and respawns after falling', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'platformer')!.build());
    const pl = rt.world.of('Player')[0];
    run(rt, 1);
    expect(pl.state.platform.grounded).toBe(true);
    const y0 = pl.y;
    press(rt, ' '); run(rt, 0.15);
    expect(pl.y).toBeGreaterThan(y0 + 0.5);
    const gem = rt.world.of('Gem')[0];
    pl.x = gem.x; pl.y = gem.y - 0.5; pl.z = gem.z; run(rt, 0.1);
    expect(rt.globals.gems).toBe(1);
    pl.y = -20; run(rt, 0.1);
    expect(rt.globals.falls).toBe(1);
    expect(pl.y).toBeGreaterThan(-1);
  });

  it('2D Side Scroller: run right, stomp a slime from above, lose a life to spikes', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'sidescroller')!.build());
    const pl = rt.world.of('Player')[0];
    run(rt, 0.5);
    const x0 = pl.x;
    hold(rt, ['ArrowRight'], 1);
    expect(pl.x).toBeGreaterThan(x0 + 3);
    const slime = rt.world.of('Slime')[0];
    pl.x = slime.x; pl.y = slime.y + 1.2; pl.vy = -6; run(rt, 0.2);
    expect(rt.world.of('Slime').length).toBe(3);
    expect(rt.globals.score).toBeGreaterThanOrEqual(100);
    const spike = rt.world.of('Spike')[0];
    pl.x = spike.x; pl.y = spike.y + 0.3; pl.vy = 0; run(rt, 0.1);
    expect(rt.globals.lives).toBe(2);
  });

  it('Physics Playground: pick up, carry, throw with throwStrength', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'physics')!.build());
    run(rt, 1.5);
    const pl = rt.world.of('Player')[0];
    const crate = rt.world.of('Prop').find((p) => p.name === 'Ice cube')!;
    pl.x = crate.x - 1; pl.z = crate.z; run(rt, 0.1);
    press(rt, 'E');
    expect(crate.state.physics.heldBy).toBe(pl.uid);
    run(rt, 0.3);
    press(rt, 'F');
    expect(crate.state.physics.heldBy).toBe(0);
    expect(Math.hypot(crate.vx, crate.vz)).toBeGreaterThan(5);
  });

  it('Combat Arena: enemies detect, path around obstacles and attack; sword kills; victory after all', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'combat')!.build());
    const pl = rt.world.of('Player')[0];
    const e = rt.world.of('Enemy')[0];
    pl.x = e.x + 5; pl.z = e.z; run(rt, 0.2);
    expect(e.vars.state).toBe('chase');
    run(rt, 3);
    expect(['attack', 'chase']).toContain(e.vars.state);
    expect(pl.state.health.hp).toBeLessThan(100);
    // Kill every enemy with the sword.
    for (let n = 0; n < 40 && rt.world.of('Enemy').length; n++) {
      const t = rt.world.of('Enemy')[0];
      pl.x = t.x + 1; pl.z = t.z; rt.world.setAngle(pl, 180); rt.input.mouse.x = t.x; rt.input.mouse.z = t.z;
      rt.input.mouseDown('left'); rt.tick(); rt.input.mouseUp('left'); run(rt, 0.5);
      pl.state.health.hp = 100;
    }
    run(rt, 0.2);
    expect(rt.globals.kills).toBe(4);
    expect(rt.ui.screen?.kind).toBe('victory');
  });

  it('Combat Arena: gun shoots bullets with ammo and reload', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'combat')!.build());
    run(rt, 0.1);
    press(rt, '2');
    const pl = rt.world.of('Player')[0];
    expect(pl.vars.weapon).toBe('Gun');
    rt.input.mouseDown('left'); rt.tick(); rt.input.mouseUp('left');
    expect(rt.world.of('Bullet').length).toBe(1);
    expect(pl.vars.ammo).toBe(7);
    press(rt, 'R'); run(rt, 1.2);
    expect(pl.vars.ammo).toBe(8);
  });

  it('Digging: first person on voxel terrain - dig down into the ground, pile earth back, collect buried treasure', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'digging')!.build());
    run(rt, 0.5);
    const pl = rt.world.of('Player')[0], terrain = rt.world.of('Terrain')[0];
    const grid = rt.world.voxelGrid(terrain)!;
    const solidCells = () => grid.data.reduce((n, c) => n + (c ? 1 : 0), 0);
    expect(pl.state.platform.grounded).toBe(true); // standing on the voxel surface
    const y0 = pl.y, cells0 = solidCells();
    // Look straight down and hold the left button: the ground is excavated and the player sinks into the hole.
    rt.world.of('Camera')[0].state.follow.fpPitch = -1.45;
    rt.input.mouseDown('left'); run(rt, 3); rt.input.mouseUp('left'); run(rt, 0.5);
    expect(solidCells()).toBeLessThan(cells0);
    expect(pl.y).toBeLessThan(y0 - 0.4);
    expect(pl.state.platform.grounded).toBe(true); // still standing on the floor of the hole
    // Right click piles earth back (never inside the player).
    const cells1 = solidCells();
    rt.world.of('Camera')[0].state.follow.fpPitch = -0.6;
    rt.input.mouseDown('right'); run(rt, 0.6); rt.input.mouseUp('right'); run(rt, 0.1);
    expect(solidCells()).toBeGreaterThan(cells1);
    expect(rt.world.aabbs(terrain, rt.world.aabb(pl)).some((b) => b[0] < pl.x && b[3] > pl.x && b[2] < pl.z && b[5] > pl.z && b[1] > pl.y + 0.05 && b[1] < pl.y + 1.6)).toBe(false);
    // Buried treasure: the detector reports it, touching it collects it.
    const tr = rt.world.of('Treasure')[0];
    expect(tr.y).toBeLessThan(terrain.y + grid.ny * grid.cell - 1);
    pl.x = tr.x; pl.z = tr.z + 4; run(rt, 0.6);
    expect(rt.globals.signal).toBeLessThan(10);
    // Excavate down to it (as the player would), then step in.
    editSphere(grid, [tr.x, tr.y + 1, tr.z], 1.6, 0);
    pl.x = tr.x; pl.z = tr.z; pl.y = tr.y + 0.1; pl.vy = 0; run(rt, 0.2);
    expect(rt.globals.treasure).toBe(1);
  });

  it('Dungeon Bound: the user\'s level - key gate, crate on plate, levers, exit key and door, coins', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'dungeon')!.build());
    run(rt, 0.5);
    const pl = rt.world.of('Player')[0];
    // The player starts standing on the user's start platform (compound colliders from the .blend mesh).
    expect(pl.state.platform.grounded).toBe(true);
    const startY = pl.y;
    run(rt, 1);
    expect(Math.abs(pl.y - startY)).toBeLessThan(0.2);
    const goTo = (o: { x: number; y: number; z: number }, dx = 0, dz = 0) => { pl.x = o.x + dx; pl.y = o.y - 0.5; pl.z = o.z + dz; pl.vx = pl.vy = pl.vz = 0; run(rt, 0.1); };
    // Coins
    const coins = rt.world.of('Coin').length;
    expect(coins).toBe(3); // the user's three gold coins
    goTo(rt.world.of('Coin')[0]);
    expect(rt.globals.coins).toBeGreaterThanOrEqual(1);
    // Gate 1: locked until the key from the west platforms is found.
    const gate1 = rt.world.of('LockedGate')[0];
    goTo(gate1, -2, 2); press(rt, 'E');
    expect(gate1.vars.open).toBe(false);
    goTo(rt.world.of('Key')[0]);
    expect(rt.globals.hasKey).toBe(true);
    goTo(gate1, -2, 2); press(rt, 'E');
    expect(gate1.vars.open).toBe(true);
    // Gate 2: crate on the pressure plate.
    const crate = rt.world.of('Crate')[0], plate = rt.world.of('Plate')[0];
    crate.x = plate.x; crate.z = plate.z; run(rt, 1);
    expect(rt.world.of('PlateGate')[0].vars.open).toBe(true);
    // Gate 3: both of the user's levers.
    for (const lever of rt.world.of('Lever')) { goTo(lever, 1.2, 0); press(rt, 'E'); }
    expect(rt.globals.leversOn).toBe(2);
    run(rt, 0.2);
    expect(rt.world.of('LeverGate')[0].vars.open).toBe(true);
    // Exit: second key, then the door, then the exit zone wins.
    goTo(rt.world.of('ExitKey')[0]);
    expect(rt.globals.hasExitKey).toBe(true);
    const exit = rt.world.of('ExitDoor')[0];
    goTo(exit, -2, -2); press(rt, 'E');
    expect(exit.vars.open).toBe(true);
    goTo(rt.world.of('ExitZone')[0], 0, 0);
    expect(rt.ui.screen?.kind).toBe('victory');
  });

  it('Arms Shooter: hitscan along the view damages enemies, cover blocks shots, ammo and reload', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'fps')!.build());
    run(rt, 0.3);
    const pl = rt.world.of('Player')[0];
    expect(rt.world.of('Enemy').length).toBe(4); // wave 1
    expect(rt.world.of('Arms')[0].parent).toBe(rt.world.of('Camera')[0].uid);
    const shoot = () => { rt.input.mouseDown('left'); rt.tick(); rt.input.mouseUp('left'); rt.tick(); };
    // Put one enemy straight ahead (the player faces -Z, ry 90) in open floor and the rest far away.
    const [target, ...rest] = rt.world.of('Enemy');
    rest.forEach((e, n) => { e.x = -20 + n; e.z = -20; });
    for (const e of rt.world.of('Enemy')) e.behaviors = e.behaviors.filter((b) => b.type !== 'pathfinding');
    pl.x = 4; pl.z = 18; target.x = 4; target.z = 13; target.y = 0; run(rt, 0.1);
    const hp0 = target.state.health.hp;
    shoot();
    expect(target.state.health.hp).toBeLessThan(hp0);
    expect(pl.vars.ammo).toBe(11);
    // A crate between player and enemy stops the shot.
    target.x = -8; target.z = -2; pl.x = -8; pl.z = -10; rt.world.of('Camera')[0].state.follow.fpYaw = -Math.PI / 2; run(rt, 0.1);
    const hp1 = target.state.health.hp;
    shoot();
    expect(target.state.health.hp).toBe(hp1);
    // Empty the magazine, then reload.
    pl.vars.ammo = 0; shoot(); expect(pl.vars.ammo).toBe(0);
    press(rt, 'R'); run(rt, 1.4);
    expect(pl.vars.ammo).toBe(12);
  });

  it('Dungeon Bound: the wizard can jump up the stairs; levers pivot at their base', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'dungeon')!.build());
    run(rt, 0.3);
    const pl = rt.world.of('Player')[0];
    const S = pl.sx; // Blender units -> meters
    // Stand on the first stair step (Blender x 45-50, top 2.7) and jump towards the next one (top 6.7).
    pl.x = 48 * S; pl.z = -360 * S; pl.y = 2.75 * S; pl.vx = pl.vy = pl.vz = 0; run(rt, 0.4);
    expect(pl.state.platform.grounded).toBe(true);
    const stepY = pl.y;
    pl.vy = 10; pl.state.platform.grounded = false;
    for (let i = 0; i < 70; i++) { pl.vx = 3; pl.vz = 0; rt.tick(); }
    run(rt, 0.3);
    expect(pl.y).toBeGreaterThan(stepY + 1.1); // landed on the next 1.3 m step
    // Lever: an empty pivot on the pedestal with the (half-size) model as its child.
    const lever = rt.world.of('Lever')[0];
    expect(lever.kind).toBe('empty');
    expect(rt.world.of('LeverModel').some((m) => m.parent === lever.uid)).toBe(true);
  });

  it('Dungeon Bound: the orbit camera stays out of walls inside the dungeon', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'dungeon')!.build());
    run(rt, 0.3);
    const pl = rt.world.of('Player')[0], cam = rt.world.of('Camera')[0];
    const inside = () => rt.world.solids().some((s) => rt.world.aabbs(s).some((b) => cam.x > b[0] && cam.x < b[3] && cam.y > b[1] && cam.y < b[4] && cam.z > b[2] && cam.z < b[5]));
    // Spike corridor and the room behind the first gate, looking from several orbit angles.
    for (const [x, z] of [[1.5, -75], [0, -57], [3, -100]]) {
      for (const dx of [0, 300, -300]) {
        pl.x = x; pl.z = z; pl.y = 0; pl.vx = pl.vy = pl.vz = 0;
        rt.input.mouse.dx = dx; rt.tick(); run(rt, 0.3);
        expect(inside()).toBe(false);
      }
    }
  });

  it('Dungeon Bound: the player is the wizard from the .blend and the heart icons follow HP', () => {
    const p = TEMPLATES.find((t) => t.id === 'dungeon')!.build();
    const { rt } = start(p);
    const pl = rt.world.of('Player')[0];
    expect(pl.mesh?.asset).toMatch(/DungeonBound_4\.blend#Wizard/);
    expect(p.assets.some((a) => a.id.endsWith('#Heart1-'))).toBe(true);
    run(rt, 0.2);
    expect(pl.animation).toBe('idle');
    hold(rt, ['w'], 0.3);
    expect(pl.animation).toBe('walk');
    expect(rt.world.of('Heart3')[0].opacity).toBe(100);
    pl.state.health.hp = 2; run(rt, 0.05); // lose one heart
    expect(rt.world.of('Heart3')[0].opacity).toBeLessThan(50);
    expect(rt.world.of('Heart2')[0].opacity).toBe(100);
  });

  const roomsOf = (rt: Runtime) => rt.world.instances.filter((i) => !i.destroyed && /^Room\d+$/.test(i.type));

  it('Backrooms: random rooms from the .blend fill the 5x5 chunks, far chunks are recycled with their rooms', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.6);
    expect(rt.world.of('Chunk').length).toBe(25);
    expect(roomsOf(rt).length).toBe(25);
    expect(rt.world.of('Ceiling').length).toBe(25);
    expect(rt.world.of('Room13').length).toBeGreaterThan(0); // the spawn room
    // Rooms are attached to their chunk and keep their compound wall colliders.
    const room = roomsOf(rt)[0];
    expect(room.parent).toBeTruthy();
    expect(rt.world.aabbs(room).length).toBeGreaterThan(50);
    const pl = rt.world.of('Player')[0];
    const chunk = rt.globals.chunk as number;
    pl.x = chunk * 5; pl.z = 0; pl.y = 0.5; run(rt, 1.5);
    expect(rt.world.of('Chunk').every((c) => Math.abs(c.vars.cx - 5) <= 2)).toBe(true);
    expect(roomsOf(rt).length).toBe(rt.world.of('Chunk').length);
    expect(Object.keys(rt.globals.generated).length).toBeLessThanOrEqual(25);
  });

  it('Backrooms: first person - walls block the player, items are picked up and used from the inventory', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.6);
    const pl = rt.world.of('Player')[0], cam = rt.world.of('Camera')[0];
    expect(pl.visible).toBe(false); // no player model
    expect(cam.y).toBeGreaterThan(pl.y + 1); // camera at eye height
    // Walk forward a long way: the room's walls must stop the player before it crosses the whole tile.
    const start0 = [pl.x, pl.z];
    hold(rt, ['w'], 4);
    expect(Math.hypot(pl.x - start0[0], pl.z - start0[1])).toBeLessThan(3.4 * 4 - 0.5);
    expect(pl.y).toBeGreaterThan(-0.2); // standing on the room floor
    // Survival + inventory
    run(rt, 2);
    expect(rt.globals.hunger).toBeLessThan(100);
    rt.globals.hunger = 10;
    rt.world.spawn('Bread', pl.x + 0.5, 0, pl.z);
    press(rt, 'E');
    expect(rt.globals.bread).toBe(1);
    press(rt, '1');
    rt.tick();
    expect(rt.world.of('HeldBread')[0].visible).toBe(true);
    rt.input.mouseDown('left'); rt.tick(); rt.input.mouseUp('left'); rt.tick();
    expect(rt.globals.hunger).toBeGreaterThan(40);
    expect(rt.globals.bread).toBe(0);
  });

  it('Backrooms: bacteria hunts the player with pathfinding and flees from a thrown glowstick', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.6);
    const pl = rt.world.of('Player')[0], b = rt.world.of('Bacteria')[0];
    for (const g of rt.world.of('Glowstick')) { g.x = -30; g.z = -30; }
    // Put the monster on a free spot of the spawn room with a clear view of the player.
    b.x = pl.x; b.z = pl.z; run(rt, 0.2);
    // Right next to the player it hunts and, in reach, attacks; its walk clip plays fast while it does.
    expect(['hunt', 'attack']).toContain(b.vars.state);
    expect(b.state.animSpeed).toBeGreaterThan(1.5);
    const g = rt.world.of('Glowstick')[0];
    g.x = b.x - 1; g.z = b.z; run(rt, 0.1);
    expect(b.vars.state).toBe('flee');
  });

  it('Backrooms: blackouts kill the lamps and glow, Smilers come out and close in, and the lights return', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.2);
    rt.globals.nextBlackout = 0.05;
    run(rt, 4.5); // flicker (1.6 s), dark, Smilers after 2 s
    expect(rt.globals.lightsOut).toBe(true);
    expect(rt.scene.settings.emissionScale).toBe(0);
    expect(rt.world.of('Lamp').every((l) => l.light!.power === 0)).toBe(true);
    const smilers = rt.world.of('Smiler');
    expect(smilers.length).toBe(3);
    // Keep glowsticks away so nothing scares them off; they drift toward the player.
    for (const g of rt.world.of('Glowstick')) { g.x = -500; g.z = -500; }
    const pl = rt.world.of('Player')[0];
    const d0 = Math.hypot(smilers[0].x - pl.x, smilers[0].z - pl.z);
    run(rt, 1);
    expect(Math.hypot(smilers[0].x - pl.x, smilers[0].z - pl.z)).toBeLessThan(d0);
    rt.globals.darkLeft = 0.01;
    run(rt, 1.2);
    expect(rt.globals.lightsOut).toBe(false);
    expect(rt.scene.settings.emissionScale).toBe(1);
    expect(rt.world.of('Smiler').length).toBe(0);
    expect(rt.world.of('Lamp').every((l) => l.light!.power === 340)).toBe(true);
  });

  it('Backrooms: the bacteria rests, wanders, and searches where it last saw the player', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    const b = rt.world.of('Bacteria')[0];
    run(rt, 0.1);
    expect(b.vars.state).toBe('idle');
    expect(b.state.animSpeed).toBeLessThan(0.5);
    run(rt, 1.2);
    expect(['wander', 'idle']).toContain(b.vars.state);
    // Lost sight at long range: it goes to search the last place it saw the player.
    b.vars.state = 'hunt'; b.vars.lastX = b.x + 3; b.vars.lastZ = b.z;
    const pl = rt.world.of('Player')[0]; pl.x = b.x + 60; pl.z = b.z;
    run(rt, 0.05);
    expect(b.vars.state === 'search' || b.vars.state === 'idle' || b.vars.state === 'wander').toBe(true);
  });

  it('Backrooms: planks build a single board (1) or a wall (3), middle click rotates, right click refunds', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.6);
    const click = (b: 'left' | 'right' | 'middle') => { rt.input.mouseDown(b); rt.tick(); rt.input.mouseUp(b); rt.tick(); };
    expect(rt.globals.planks).toBe(4);
    // Picking up planks.
    const pl = rt.world.of('Player')[0];
    rt.world.spawn('Plank', pl.x + 0.5, 0, pl.z); press(rt, 'E');
    expect(rt.globals.planks).toBe(5);
    // One plank.
    press(rt, '5');
    expect(rt.world.of('PlankPreview')[0].visible).toBe(true);
    click('left');
    expect(rt.world.of('PlacedPlank').length).toBe(1);
    expect(rt.globals.planks).toBe(4);
    // A wall costs 3, and middle click turns it 90°.
    press(rt, '6');
    const ry0 = rt.world.of('WallPreview')[0].ry;
    click('middle');
    expect(Math.abs(((rt.world.of('WallPreview')[0].ry - ry0) % 360 + 360) % 360 - 90)).toBeLessThan(1);
    click('left');
    const walls = rt.world.of('PlacableWall');
    expect(walls.length).toBe(1);
    expect(rt.globals.planks).toBe(1);
    expect(rt.world.solids()).toContain(walls[0]);
    // Not enough planks for another wall; right click takes the wall back (+3).
    click('left');
    expect(rt.world.of('PlacableWall').length).toBe(1);
    click('right');
    expect(rt.world.of('PlacableWall').length).toBe(0);
    expect(rt.globals.planks).toBe(4);
  });

  it('Backrooms: the bacteria wanders on its own and only hunts when you come close', () => {
    const { rt } = start(TEMPLATES.find((t) => t.id === 'backrooms')!.build());
    run(rt, 0.6);
    const pl = rt.world.of('Player')[0], b = rt.world.of('Bacteria')[0];
    for (const g of rt.world.of('Glowstick')) { g.x = -30; g.z = -30; }
    b.x = pl.x + 25; b.z = pl.z; run(rt, 1);
    expect(b.vars.state).toBe('wander');
    expect(rt.ui.message?.text ?? '').not.toMatch(/coming/i);
  });
});

describe('Mail Delivery', () => {
  const tap = (rt: Runtime, k: string) => { rt.input.keyDown(k); rt.tick(); rt.input.keyUp(k); rt.tick(); };
  it('drive, get out, climb into the back, take a parcel, hand it over: one delivery', () => {
    const { rt, logs } = start(TEMPLATES.find((t) => t.id === 'maildelivery')!.build());
    run(rt, 0.5);
    const pl = rt.world.of('Player')[0], truck = rt.world.of('Truck')[0];
    expect(pl.state.inVehicle).toBe(truck.uid); // the round starts at the wheel
    expect(pl.visible).toBe(true); // seated, playing the driving clip
    expect(pl.animation).toBe('drive');
    hold(rt, ['W'], 2.5);
    expect(Math.hypot(truck.x - 3.2, truck.z - 6)).toBeGreaterThan(5); // drove up the road
    run(rt, 3); // roll to a stop
    tap(rt, 'E');
    expect(pl.state.inVehicle).toBe(0);
    expect(truck.state.parts.Door1.to).toBe(-75); // the driver's door swings open...
    expect(truck.state.parts.Door3?.to ?? 0).toBe(0); // ...the back stays shut until you open it
    expect(Math.round(truck.ry) % 90).toBe(0); // parked straight
    // The rear steps and the cargo floor hold you up (the truck faces -Z: its back is at +Z).
    // A point `lx` metres along the truck's forward axis (negative = towards the back).
    const a = (truck.ry * Math.PI) / 180, back = (lx: number) => [truck.x + lx * Math.cos(a), truck.z - lx * Math.sin(a)] as const;
    [pl.x, pl.z] = back(-3.72); pl.y = 0.6; pl.vx = pl.vy = pl.vz = 0; run(rt, 0.6);
    expect(pl.y).toBeCloseTo(0.4, 1); // the lower step
    const doors = rt.world.of('BackDoors')[0];
    expect(rt.world.behavior(doors, 'solid')!.props.enabled).not.toBe(false); // closed: you can't walk in
    tap(rt, 'G'); run(rt, 0.1); // open them
    expect(rt.globals.backOpen).toBe(true);
    expect(truck.state.parts.Door3.to).toBe(-100);
    expect(truck.state.parts.Door4.to).toBe(100);
    expect(rt.world.behavior(doors, 'solid')!.props.enabled).toBe(false);
    [pl.x, pl.z] = back(-1.8); pl.y = 1.3; pl.vy = 0; run(rt, 0.6);
    expect(pl.y).toBeCloseTo(1.25, 1); // standing inside on the cargo floor
    // A parcel from the cargo floor: carried in both hands.
    const parcels = rt.world.of('Parcel').length;
    [pl.x, pl.z] = back(-2.0); run(rt, 0.2);
    tap(rt, 'F');
    expect(rt.globals.carrying).toBe(true);
    expect(rt.world.of('Parcel').filter((x) => !x.destroyed).length).toBe(parcels - 1);
    expect(pl.mesh?.animMap?.walk).toBe('Hold_Box_Walk');
    expect(rt.world.of('HeldParcel')[0].visible).toBe(true);
    // Walk to a resident and hand it over.
    const resident = rt.world.of('Resident').sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    pl.x = resident.x + Math.sign(-resident.x) * 1.2; pl.z = resident.z; pl.y = 0; run(rt, 0.3);
    tap(rt, 'E'); run(rt, 0.5);
    expect(rt.dialogue?.text).toContain('package');
    rt.dialogueChoose(1); run(rt, 0.2);
    rt.dialogueContinue(); run(rt, 1.5);
    expect(rt.globals.delivered).toBe(1);
    expect(rt.globals.carrying).toBe(false);
    expect(resident.vars.waiting).toBe(false);
    expect(pl.mesh?.animMap?.walk).toBe('Walk_Loop');
    expect(rt.world.of('HeldParcel')[0].visible).toBe(false);
    // Shut the back with the same key, then get back in.
    [pl.x, pl.z] = back(-3.72); pl.y = 0.4; run(rt, 0.3);
    tap(rt, 'G'); run(rt, 0.1);
    expect(rt.globals.backOpen).toBe(false);
    expect(truck.state.parts.Door3.to).toBe(0);
    expect(rt.world.behavior(doors, 'solid')!.props.enabled).not.toBe(false);
    [pl.x, pl.z] = [truck.x, truck.z]; pl.y = 1.3; run(rt, 0.3);
    tap(rt, 'E');
    expect(pl.state.inVehicle).toBe(truck.uid);
    expect(logs.filter((l) => l.startsWith('error'))).toEqual([]);
  });
});
