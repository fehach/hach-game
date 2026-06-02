import * as THREE from 'three';
import { buildCharacterModel } from './character.js';

const SPEED = 1.8;
const FOLLOW_RANGE = 8; // start following when the player is this close
const STOP_DISTANCE = 2.5; // but stop before bumping into them

// A friendly creature that wanders the world and follows the player when near.
// Uses a simple state machine + the shared blocky character model.
class NPC {
  constructor(scene, world, def, bound) {
    this.world = world;
    this.bound = bound;
    this.parts = buildCharacterModel(def);
    this.group = this.parts.group;
    this.group.scale.setScalar(0.7); // a bit smaller than the player
    scene.add(this.group);

    this.heading = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
    this.time = 0;
    this.moving = false;

    // Drop somewhere random near the middle of the map.
    const x = (Math.random() * 2 - 1) * bound * 0.6;
    const z = (Math.random() * 2 - 1) * bound * 0.6;
    this.x = x;
    this.z = z;
    this._snapToGround();
  }

  _snapToGround() {
    this.group.position.set(this.x, this.world.surfaceHeight(this.x, this.z), this.z);
  }

  update(dt, player) {
    this.time += dt;

    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distToPlayer = Math.hypot(dx, dz);

    let move = true;
    if (distToPlayer < FOLLOW_RANGE) {
      // Follow mode: head toward the player, but keep a polite distance.
      if (distToPlayer > STOP_DISTANCE) {
        this.heading = Math.atan2(dx, dz);
      } else {
        move = false; // close enough, just stand
      }
    } else {
      // Wander mode: change direction every few seconds.
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.heading += (Math.random() * 2 - 1) * 1.5;
        this.wanderTimer = 2 + Math.random() * 3;
      }
    }

    this.moving = move;
    if (move) {
      const nx = this.x + Math.sin(this.heading) * SPEED * dt;
      const nz = this.z + Math.cos(this.heading) * SPEED * dt;
      // Stay inside the map; bounce the heading if we hit the edge.
      if (Math.abs(nx) < this.bound && Math.abs(nz) < this.bound) {
        this.x = nx;
        this.z = nz;
      } else {
        this.heading += Math.PI;
      }
      this._snapToGround();
      this.group.rotation.y = this.heading;
    }

    // Leg/arm swing while walking.
    const swing = move ? Math.sin(this.time * 9) * 0.6 : 0;
    this.parts.leftLeg.rotation.x = swing;
    this.parts.rightLeg.rotation.x = -swing;
    this.parts.leftArm.rotation.x = -swing;
    this.parts.rightArm.rotation.x = swing;
  }

  remove(scene) {
    scene.remove(this.group);
  }
}

// Color palettes for the creatures so they look varied and cute.
const CREATURE_DEFS = [
  { head: '#ff8fab', body: '#ff5d8f', arms: '#ff8fab', legs: '#c9184a' },
  { head: '#8ecae6', body: '#219ebc', arms: '#8ecae6', legs: '#023047' },
  { head: '#ffd166', body: '#f4a261', arms: '#ffd166', legs: '#e76f51' },
  { head: '#caffbf', body: '#80ed99', arms: '#caffbf', legs: '#38a3a5' },
  { head: '#cdb4db', body: '#b298dc', arms: '#cdb4db', legs: '#7251b5' },
];

export class NPCManager {
  constructor(scene) {
    this.scene = scene;
    this.npcs = [];
  }

  // (Re)spawn creatures for a freshly created world.
  spawn(world, count = 5) {
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
    for (const npc of this.npcs) npc.update(dt, player);
  }
}
