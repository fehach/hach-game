import * as THREE from 'three';
import { buildCharacterModel } from './character.js';

const FOLLOW_RANGE = 8; // start following when the player is this close
const STOP_DISTANCE = 2.5; // but stop before bumping into them
const PERSONAL_SPACE = 1.4;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makeBox(width, height, depth, color, position) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.copy(position);
  return mesh;
}

// A friendly creature that wanders the world and follows the player when near.
// Uses a simple state machine + the shared blocky character model.
class NPC {
  constructor(scene, world, def, bound) {
    this.world = world;
    this.bound = bound;
    this.def = def;
    this.parts = buildCharacterModel(def);
    this.group = this.parts.group;
    this.group.scale.setScalar(def.scale || 0.7);
    this._addCreatureDetails();
    scene.add(this.group);

    this.heading = Math.random() * Math.PI * 2;
    this.targetHeading = this.heading;
    this.wanderTimer = rand(0.4, 2.5);
    this.pauseTimer = Math.random() * 1.2;
    this.curiosityTimer = 0;
    this.time = 0;
    this.moving = false;

    // Drop somewhere random near the middle of the map.
    this.x = 0;
    this.z = 0;
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * 2 - 1) * bound * 0.75;
      const z = (Math.random() * 2 - 1) * bound * 0.75;
      if (this._canStand(x, z)) {
        this.x = x;
        this.z = z;
        break;
      }
    }
    this._snapToGround();
  }

  _addCreatureDetails() {
    const accent = this.def.accent || this.def.head;
    const dark = this.def.dark || this.def.legs;

    if (this.def.kind === 'sprout') {
      this.parts.head.add(makeBox(0.16, 0.32, 0.1, accent, new THREE.Vector3(-0.12, 0.36, 0)));
      this.parts.head.add(makeBox(0.16, 0.32, 0.1, accent, new THREE.Vector3(0.12, 0.36, 0)));
      this.parts.head.add(makeBox(0.09, 0.09, 0.04, dark, new THREE.Vector3(-0.11, 0.04, -0.26)));
      this.parts.head.add(makeBox(0.09, 0.09, 0.04, dark, new THREE.Vector3(0.11, 0.04, -0.26)));
    }

    if (this.def.kind === 'hopper') {
      this.parts.body.scale.set(1.15, 0.82, 1.25);
      this.parts.head.position.y = 1.38;
      this.parts.leftArm.visible = false;
      this.parts.rightArm.visible = false;
      this.parts.leftLeg.scale.set(1.25, 0.75, 1.25);
      this.parts.rightLeg.scale.set(1.25, 0.75, 1.25);
      this.group.add(makeBox(0.32, 0.22, 0.32, accent, new THREE.Vector3(0, 0.95, 0.42)));
      this.parts.head.add(makeBox(0.08, 0.08, 0.04, dark, new THREE.Vector3(-0.1, 0.03, -0.26)));
      this.parts.head.add(makeBox(0.08, 0.08, 0.04, dark, new THREE.Vector3(0.1, 0.03, -0.26)));
    }

    if (this.def.kind === 'bot') {
      this.parts.head.scale.set(1.18, 0.82, 1);
      this.parts.body.scale.set(0.9, 1.12, 1);
      this.parts.head.add(makeBox(0.34, 0.08, 0.05, accent, new THREE.Vector3(0, 0.02, -0.27)));
      this.group.add(makeBox(0.08, 0.38, 0.08, accent, new THREE.Vector3(0, 1.92, 0)));
      this.group.add(makeBox(0.18, 0.18, 0.18, accent, new THREE.Vector3(0, 2.16, 0)));
    }

    if (this.def.kind === 'shy') {
      this.parts.head.scale.set(0.9, 1.15, 0.9);
      this.parts.body.scale.set(0.82, 0.9, 0.82);
      this.parts.head.add(makeBox(0.07, 0.07, 0.04, dark, new THREE.Vector3(-0.11, 0.02, -0.26)));
      this.parts.head.add(makeBox(0.07, 0.07, 0.04, dark, new THREE.Vector3(0.11, 0.02, -0.26)));
    }
  }

  _snapToGround() {
    this.group.position.set(this.x, this.world.surfaceHeight(this.x, this.z), this.z);
  }

  _canStand(x, z) {
    if (Math.abs(x) >= this.bound || Math.abs(z) >= this.bound) return false;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    const y = this.world.surfaceHeight(x, z);
    return this.world.getBlock(gx, y, gz) !== 'water';
  }

  _tryMove(dt) {
    const speed = this.def.speed || 1.6;
    const nx = this.x + Math.sin(this.heading) * speed * dt;
    const nz = this.z + Math.cos(this.heading) * speed * dt;
    if (!this._canStand(nx, nz)) return false;

    const currentY = this.world.surfaceHeight(this.x, this.z);
    const nextY = this.world.surfaceHeight(nx, nz);
    if (Math.abs(nextY - currentY) > 1.5) return false;

    this.x = nx;
    this.z = nz;
    return true;
  }

  _avoidNeighbors(npcs) {
    let pushX = 0;
    let pushZ = 0;
    for (const other of npcs) {
      if (other === this) continue;
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < PERSONAL_SPACE) {
        const strength = (PERSONAL_SPACE - d) / PERSONAL_SPACE;
        pushX += (dx / d) * strength;
        pushZ += (dz / d) * strength;
      }
    }
    if (pushX || pushZ) {
      this.targetHeading = Math.atan2(pushX, pushZ);
      return true;
    }
    return false;
  }

  update(dt, player, npcs) {
    this.time += dt;

    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distToPlayer = Math.hypot(dx, dz);

    let move = this.pauseTimer <= 0;
    const avoiding = this._avoidNeighbors(npcs);
    if (distToPlayer < FOLLOW_RANGE) {
      this.curiosityTimer = Math.max(this.curiosityTimer, rand(0.5, 1.4));
      if (distToPlayer > STOP_DISTANCE && !avoiding && this.def.personality !== 'shy') {
        this.targetHeading = Math.atan2(dx, dz);
        move = true;
      } else {
        move = false; // close enough, just stand
        this.targetHeading = Math.atan2(dx, dz);
      }
    } else if (avoiding) {
      move = true;
    } else {
      // Wander mode: change direction every few seconds.
      this.wanderTimer -= dt;
      this.pauseTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.targetHeading = this.heading + rand(-1.5, 1.5);
        this.wanderTimer = rand(2, 5.5);
        this.pauseTimer = Math.random() < 0.38 ? rand(0.8, 1.9) : 0;
      }
    }

    this.curiosityTimer = Math.max(0, this.curiosityTimer - dt);
    this.heading = THREE.MathUtils.lerp(this.heading, this.targetHeading, Math.min(1, dt * 3.5));
    this.moving = move;
    if (move) {
      if (!this._tryMove(dt)) {
        this.targetHeading = this.heading + Math.PI * rand(0.65, 1.05);
        this.pauseTimer = rand(0.15, 0.45);
      }
      this._snapToGround();
    }
    this.group.rotation.y = this.heading;

    // Leg/arm swing while walking.
    const swing = move ? Math.sin(this.time * (this.def.stepRate || 9)) * 0.6 : 0;
    const hop = this.def.kind === 'hopper' ? 0.14 : 0.08;
    const bob = move ? Math.abs(Math.sin(this.time * (this.def.stepRate || 9))) * hop : 0;
    this.group.position.y += bob;
    this.parts.leftLeg.rotation.x = swing;
    this.parts.rightLeg.rotation.x = -swing;
    this.parts.leftArm.rotation.x = -swing;
    this.parts.rightArm.rotation.x = swing;
    this.parts.head.rotation.y =
      distToPlayer < 5 ? THREE.MathUtils.clamp(dx * 0.08, -0.45, 0.45) : Math.sin(this.time * 1.7) * 0.12;
    this.parts.head.rotation.x = this.curiosityTimer > 0 ? Math.sin(this.time * 6) * 0.08 : 0;
  }

  remove(scene) {
    scene.remove(this.group);
  }
}

// Color palettes for the creatures so they look varied and cute.
const CREATURE_DEFS = [
  { kind: 'sprout', head: '#ffb3c6', body: '#ff5d8f', arms: '#ffb3c6', legs: '#c9184a', accent: '#ffd6e0', dark: '#3a0f1c', scale: 0.62, speed: 1.9, stepRate: 11 },
  { kind: 'bot', head: '#8ecae6', body: '#219ebc', arms: '#8ecae6', legs: '#023047', accent: '#ffd166', dark: '#023047', scale: 0.76, speed: 1.35, stepRate: 8 },
  { kind: 'hopper', head: '#ffd166', body: '#f4a261', arms: '#ffd166', legs: '#e76f51', accent: '#ffe8a3', dark: '#5f2f14', scale: 0.68, speed: 1.75, stepRate: 10 },
  { kind: 'sprout', head: '#caffbf', body: '#80ed99', arms: '#caffbf', legs: '#38a3a5', accent: '#f1ffc4', dark: '#164a41', scale: 0.58, speed: 2.05, stepRate: 12 },
  { kind: 'shy', personality: 'shy', head: '#cdb4db', body: '#b298dc', arms: '#cdb4db', legs: '#7251b5', accent: '#f5d0fe', dark: '#321450', scale: 0.82, speed: 1.2, stepRate: 7 },
];

export class NPCManager {
  constructor(scene) {
    this.scene = scene;
    this.npcs = [];
  }

  // (Re)spawn creatures for a freshly created world.
  spawn(world, count = 7) {
    this.clear();
    const bound = world.size / 2 - 2;
    for (let i = 0; i < count; i++) {
      const def = CREATURE_DEFS[i % CREATURE_DEFS.length];
      this.npcs.push(new NPC(this.scene, world, def, bound));
    }
  }

  clear() {
    for (const npc of this.npcs) npc.remove(this.scene);
    this.npcs = [];
  }

  update(dt, player) {
    for (const npc of this.npcs) npc.update(dt, player, this.npcs);
  }
}
