import * as THREE from 'three';

// ---- Simple smooth value-noise (deterministic, no dependencies) ----
function valueAt(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s); // 0..1
}

function smooth(t) {
  return t * t * (3 - 2 * t); // smoothstep
}

function noise2D(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);

  const v00 = valueAt(x0, z0);
  const v10 = valueAt(x0 + 1, z0);
  const v01 = valueAt(x0, z0 + 1);
  const v11 = valueAt(x0 + 1, z0 + 1);

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fz; // 0..1
}

function keyOf(x, y, z) {
  return x + ',' + y + ',' + z;
}

export class World {
  constructor(scene, worldConfig, blocksConfig) {
    this.scene = scene;
    this.config = worldConfig;
    this.blocks = blocksConfig;

    this.size = 40; // columns from -size/2 to size/2
    this.baseHeight = 4;
    this.amplitude = 4 + worldConfig.hilliness * 14;
    this.frequency = 0.08;

    this.heightCache = new Map();
    this.voxels = new Map(); // "x,y,z" -> blockId (solid blocks only)
    this.edits = new Map(); // player changes vs the generated world (for saving)
    this.meshes = [];
    this.sharedGeometry = new THREE.BoxGeometry(1, 1, 1);

    this._generateVoxels();
    this.rebuild();
  }

  _columnHeight(gx, gz) {
    const key = gx + ',' + gz;
    if (this.heightCache.has(key)) return this.heightCache.get(key);
    const n = noise2D(gx * this.frequency, gz * this.frequency);
    const h = Math.max(1, Math.round(this.baseHeight + n * this.amplitude));
    this.heightCache.set(key, h);
    return h;
  }

  _generateVoxels() {
    const half = this.size / 2;
    const surfaceId = this.config.surfaceBlock;
    const groundId = this.config.groundBlock;

    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const h = this._columnHeight(gx, gz);
        for (let y = 0; y < h; y++) {
          const id = y === h - 1 ? surfaceId : groundId;
          this.voxels.set(keyOf(gx, y, gz), id);
        }
      }
    }
  }

  inBounds(gx, gz) {
    const half = this.size / 2;
    return gx >= -half && gx <= half && gz >= -half && gz <= half;
  }

  // Integer-voxel solidity test. Below y=0 is bedrock (always solid).
  isSolidVoxel(gx, gy, gz) {
    if (gy < 0) return true;
    return this.voxels.has(keyOf(gx, gy, gz));
  }

  // Float world-space solidity test (used by player collision).
  isSolid(wx, wy, wz) {
    return this.isSolidVoxel(Math.floor(wx), Math.floor(wy), Math.floor(wz));
  }

  getBlock(gx, gy, gz) {
    return this.voxels.get(keyOf(gx, gy, gz)) || null;
  }

  setBlock(gx, gy, gz, id) {
    if (gy < 0 || !this.inBounds(gx, gz)) return false;
    const key = keyOf(gx, gy, gz);
    this.voxels.set(key, id);
    this.edits.set(key, id);
    this.rebuild();
    return true;
  }

  removeBlock(gx, gy, gz) {
    if (gy < 0) return false; // cannot dig bedrock
    const key = keyOf(gx, gy, gz);
    if (!this.voxels.has(key)) return false;
    this.voxels.delete(key);
    this.edits.set(key, null); // null marks a removed block
    this.rebuild();
    return true;
  }

  // Set many blocks at once, rebuilding only a single time at the end.
  // `list` is an array of { x, y, z, id }. Used by the build helper.
  setBlocksBulk(list) {
    let changed = 0;
    for (const b of list) {
      if (b.y < 0 || !this.inBounds(b.x, b.z)) continue;
      const key = keyOf(b.x, b.y, b.z);
      this.voxels.set(key, b.id);
      this.edits.set(key, b.id);
      changed++;
    }
    if (changed) this.rebuild();
    return changed;
  }

  // Return only the player's changes, ready to JSON.stringify for saving.
  getEdits() {
    return [...this.edits.entries()];
  }

  // Re-apply saved edits in bulk, then rebuild once.
  applyEdits(entries) {
    for (const [key, id] of entries) {
      this.edits.set(key, id);
      if (id === null) this.voxels.delete(key);
      else this.voxels.set(key, id);
    }
    this.rebuild();
  }

  surfaceHeight(wx, wz) {
    return this._columnHeight(Math.floor(wx), Math.floor(wz));
  }

  // A voxel face is hidden if a solid neighbor sits against it. We only render
  // voxels that have at least one exposed face (big performance win on edits).
  _isExposed(gx, gy, gz) {
    return (
      !this.isSolidVoxel(gx + 1, gy, gz) ||
      !this.isSolidVoxel(gx - 1, gy, gz) ||
      !this.isSolidVoxel(gx, gy + 1, gz) ||
      !this.isSolidVoxel(gx, gy - 1, gz) ||
      !this.isSolidVoxel(gx, gy, gz + 1) ||
      !this.isSolidVoxel(gx, gy, gz - 1)
    );
  }

  rebuild() {
    // Clear previous meshes.
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this.meshes = [];

    // Group exposed voxels by block type.
    const byType = new Map();
    for (const [key, id] of this.voxels) {
      const [gx, gy, gz] = key.split(',').map(Number);
      if (!this._isExposed(gx, gy, gz)) continue;
      if (!byType.has(id)) byType.set(id, []);
      byType.get(id).push([gx, gy, gz]);
    }

    const dummy = new THREE.Object3D();
    for (const [id, positions] of byType) {
      const blockDef = this.blocks[id] || { color: '#ff00ff' };
      const material = new THREE.MeshLambertMaterial({ color: blockDef.color });
      const mesh = new THREE.InstancedMesh(this.sharedGeometry, material, positions.length);

      positions.forEach((p, i) => {
        dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this.meshes = [];
    this.sharedGeometry.dispose();
  }
}
