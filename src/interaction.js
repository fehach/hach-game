import * as THREE from 'three';
import { sfx } from './sound.js';

const REACH = 6; // how many blocks away you can build/break

export class BlockInteraction {
  constructor(scene, world, player, camera, blocksConfig) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.blockDefs = blocksConfig;

    // Hotbar = the blocks you can place. Order matches the on-screen bar.
    this.palette = Object.keys(blocksConfig);
    this.selected = 0;

    this._buildHighlight();
    this._buildHotbar();
    this._initInput();
  }

  get selectedId() {
    return this.palette[this.selected];
  }

  // Point interaction at a freshly generated world.
  setWorld(world) {
    this.world = world;
    this.highlight.visible = false;
  }

  _buildHighlight() {
    const geo = new THREE.BoxGeometry(1.001, 1.001, 1.001);
    const edges = new THREE.EdgesGeometry(geo);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  _buildHotbar() {
    const bar = document.createElement('div');
    bar.id = 'hotbar';
    this.slots = [];

    this.palette.forEach((id, i) => {
      const def = this.blockDefs[id] || { name: id, color: '#ff00ff' };
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.title = def.name;
      slot.innerHTML = `
        <span class="slot-key">${i + 1}</span>
        <span class="slot-swatch" style="background:${def.color}"></span>
        <span class="slot-name">${def.name}</span>`;
      slot.addEventListener('click', () => this.select(i));
      bar.appendChild(slot);
      this.slots.push(slot);
    });

    document.body.appendChild(bar);
    this._updateHotbar();
  }

  _updateHotbar() {
    this.slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selected);
    });
  }

  select(i) {
    if (i < 0 || i >= this.palette.length) return;
    this.selected = i;
    this._updateHotbar();
  }

  _initInput() {
    // Number keys 1-9 pick a block.
    document.addEventListener('keydown', (e) => {
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= this.palette.length) this.select(n - 1);
    });

    // Mouse wheel scrolls through blocks.
    document.addEventListener('wheel', (e) => {
      if (!this.player.locked) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.select((this.selected + dir + this.palette.length) % this.palette.length);
    });

    // Don't show the browser menu on right-click.
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousedown', (e) => {
      if (!this.player.locked) return;
      const hit = this._raycast();
      if (!hit) return;
      if (e.button === 0) {
        // Left click = break the targeted block.
        if (this.world.removeBlock(hit.block.x, hit.block.y, hit.block.z)) sfx.break();
      } else if (e.button === 2 && hit.place) {
        // Right click = place a block on the face we are looking at.
        const p = hit.place;
        if (!this._insidePlayer(p.x, p.y, p.z)) {
          if (this.world.setBlock(p.x, p.y, p.z, this.selectedId)) sfx.place();
        }
      }
    });
  }

  // Don't let the player place a block inside their own body.
  _insidePlayer(gx, gy, gz) {
    const p = this.player.position;
    const minX = Math.floor(p.x - 0.3);
    const maxX = Math.floor(p.x + 0.3);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + 1.8);
    const minZ = Math.floor(p.z - 0.3);
    const maxZ = Math.floor(p.z + 0.3);
    return gx >= minX && gx <= maxX && gy >= minY && gy <= maxY && gz >= minZ && gz <= maxZ;
  }

  // Voxel ray traversal (Amanatides & Woo). Returns the first solid block hit
  // and the empty cell just before it (where a new block would be placed).
  _raycast() {
    const o = this.camera.position;
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);

    let x = Math.floor(o.x);
    let y = Math.floor(o.y);
    let z = Math.floor(o.z);

    const stepX = d.x > 0 ? 1 : -1;
    const stepY = d.y > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;

    const tDeltaX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tDeltaY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tDeltaZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;

    const boundX = stepX > 0 ? x + 1 : x;
    const boundY = stepY > 0 ? y + 1 : y;
    const boundZ = stepZ > 0 ? z + 1 : z;

    let tMaxX = d.x !== 0 ? (boundX - o.x) / d.x : Infinity;
    let tMaxY = d.y !== 0 ? (boundY - o.y) / d.y : Infinity;
    let tMaxZ = d.z !== 0 ? (boundZ - o.z) / d.z : Infinity;

    let prev = null;
    let t = 0;

    for (let i = 0; i < 100 && t <= REACH; i++) {
      if (this.world.isSolidVoxel(x, y, z)) {
        return { block: { x, y, z }, place: prev };
      }
      prev = { x, y, z };

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
      }
    }
    return null;
  }

  // Called every frame to move the highlight box onto the targeted block.
  update() {
    if (!this.player.locked) {
      this.highlight.visible = false;
      return;
    }
    const hit = this._raycast();
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
    } else {
      this.highlight.visible = false;
    }
  }
}
