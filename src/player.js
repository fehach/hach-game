import * as THREE from 'three';
import { sfx } from './sound.js';

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
const EYE = 1.6;
const GRAVITY = 26;
const JUMP_SPEED = 9;
const MOVE_SPEED = 5.5;

export class Player {
  constructor(camera, world, domElement) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.onGround = false;

    this.yaw = 0;
    this.pitch = 0;

    this.thirdPerson = false;
    this.cameraDistance = 4;

    this.wasOnGround = true;
    this.stepTimer = 0;

    this.respawn();

    this.keys = {};
    this._initInput();
  }

  toggleView() {
    this.thirdPerson = !this.thirdPerson;
    return this.thirdPerson;
  }

  // Drop the player above the center of the current world.
  respawn() {
    const startH = this.world.surfaceHeight(0, 0);
    this.position.set(0.5, startH + 2, 0.5);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }

  // Switch to a freshly generated world and reset position.
  setWorld(world) {
    this.world = world;
    this.respawn();
  }

  _initInput() {
    document.addEventListener('keydown', (e) => (this.keys[e.code] = true));
    document.addEventListener('keyup', (e) => (this.keys[e.code] = false));

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });
  }

  lock() {
    this.dom.requestPointerLock();
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  _collides(x, y, z) {
    const minX = Math.floor(x - HALF_WIDTH);
    const maxX = Math.floor(x + HALF_WIDTH);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + HEIGHT);
    const minZ = Math.floor(z - HALF_WIDTH);
    const maxZ = Math.floor(z + HALF_WIDTH);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (this.world.isSolid(bx + 0.5, by + 0.5, bz + 0.5)) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    // Build horizontal movement from input, relative to yaw.
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wish = new THREE.Vector3();
    if (this.keys['KeyW']) wish.add(forward);
    if (this.keys['KeyS']) wish.sub(forward);
    if (this.keys['KeyD']) wish.add(right);
    if (this.keys['KeyA']) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(MOVE_SPEED);

    this.velocity.x = wish.x;
    this.velocity.z = wish.z;

    // Jump.
    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
      sfx.jump();
    }

    // Gravity.
    this.velocity.y -= GRAVITY * dt;

    // Move + resolve collisions per axis.
    const p = this.position;

    p.x += this.velocity.x * dt;
    if (this._collides(p.x, p.y, p.z)) {
      p.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    p.z += this.velocity.z * dt;
    if (this._collides(p.x, p.y, p.z)) {
      p.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    const fallSpeed = this.velocity.y; // negative while descending
    p.y += this.velocity.y * dt;
    if (this._collides(p.x, p.y, p.z)) {
      const movingDown = this.velocity.y <= 0;
      p.y -= this.velocity.y * dt;
      this.onGround = movingDown;
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // Landing thud after falling a bit.
    if (this.onGround && !this.wasOnGround && fallSpeed < -6) {
      sfx.land();
    }

    // Footsteps while walking on the ground.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && this.locked && horizSpeed > 0.5) {
      this.stepTimer += dt;
      if (this.stepTimer > 0.34) {
        this.stepTimer = 0;
        const below = this.world.getBlock(
          Math.floor(p.x),
          Math.floor(p.y - 0.2),
          Math.floor(p.z)
        );
        sfx.step(below);
      }
    } else {
      this.stepTimer = 0.34; // so the next step plays promptly
    }

    this.wasOnGround = this.onGround;

    // Respawn if we somehow fall out of the world.
    if (p.y < -20) {
      this.respawn();
    }

    // Sync camera orientation.
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    const eyeX = p.x;
    const eyeY = p.y + EYE;
    const eyeZ = p.z;

    if (this.thirdPerson) {
      // Look direction from yaw/pitch, then pull the camera back along it.
      const cp = Math.cos(this.pitch);
      const dx = -Math.sin(this.yaw) * cp;
      const dy = Math.sin(this.pitch);
      const dz = -Math.cos(this.yaw) * cp;

      // Shorten the distance if terrain is in the way so we never see inside it.
      let dist = this.cameraDistance;
      while (dist > 0.5 && this.world.isSolid(eyeX - dx * dist, eyeY - dy * dist, eyeZ - dz * dist)) {
        dist -= 0.5;
      }
      this.camera.position.set(eyeX - dx * dist, eyeY - dy * dist, eyeZ - dz * dist);
    } else {
      this.camera.position.set(eyeX, eyeY, eyeZ);
    }
  }
}
