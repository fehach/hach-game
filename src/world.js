import * as THREE from 'three';

// ---- Simple smooth value-noise (deterministic, no dependencies) ----
function valueAt(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s); // 0..1
}

function randomAt(ix, iz, salt = 0) {
  const s = Math.sin(ix * 269.5 + iz * 183.3 + salt * 97.1) * 12458.91;
  return s - Math.floor(s);
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

const BIOME_BLOCKS = {
  grass: { surface: 'grass', ground: 'dirt' },
  desert: { surface: 'sand', ground: 'sand' },
  snow: { surface: 'snow', ground: 'stone' },
};

export class World {
  constructor(scene, worldConfig, blocksConfig) {
    this.scene = scene;
    this.config = worldConfig;
    this.blocks = blocksConfig;

    this.size = 40; // columns from -size/2 to size/2
    this.baseHeight = 4;
    this.amplitude = 4 + worldConfig.hilliness * 14;
    this.frequency = 0.08;
    this.waterLevel = this.baseHeight + 1;

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

  _isLakeColumn(gx, gz) {
    if (Math.abs(gx) < 5 && Math.abs(gz) < 5) return false;
    const lakeNoise = noise2D(gx * 0.16 + 41, gz * 0.16 - 23);
    const shoreNoise = noise2D(gx * 0.38 - 9, gz * 0.38 + 17);
    return lakeNoise > 0.64 && shoreNoise > 0.42;
  }

  _biomeAt(gx, gz, height) {
    const climate = noise2D(gx * 0.045 + 19, gz * 0.045 - 73);
    const moisture = noise2D(gx * 0.055 - 121, gz * 0.055 + 37);
    const highGround = height > this.baseHeight + this.amplitude * 0.72;
    let biome = 'grass';

    if (this.config.surfaceBlock === 'sand') {
      biome = 'desert';
      if (moisture > 0.72) biome = 'grass';
      if (highGround && climate > 0.82) biome = 'snow';
    } else if (this.config.surfaceBlock === 'snow') {
      biome = 'snow';
      if (!highGround && climate < 0.33) biome = moisture < 0.28 ? 'desert' : 'grass';
    } else {
      if (moisture < 0.22) biome = 'desert';
      else if (highGround && climate > 0.62) biome = 'snow';
      else biome = 'grass';
    }

    const blocks = BIOME_BLOCKS[biome] || BIOME_BLOCKS.grass;
    return {
      name: biome,
      surface: this.blocks[blocks.surface] ? blocks.surface : this.config.surfaceBlock,
      ground: this.blocks[blocks.ground] ? blocks.ground : this.config.groundBlock,
    };
  }

  _generateVoxels() {
    const half = this.size / 2;
    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const h = this._columnHeight(gx, gz);
        const biome = this._biomeAt(gx, gz, h);
        for (let y = 0; y < h; y++) {
          const id = y === h - 1 ? biome.surface : biome.ground;
          this.voxels.set(keyOf(gx, y, gz), id);
        }

        if (h <= this.waterLevel && this.blocks.water && this._isLakeColumn(gx, gz)) {
          for (let y = h; y <= this.waterLevel; y++) {
            this.voxels.set(keyOf(gx, y, gz), 'water');
          }
        }
      }
    }

    this._generateNature();
    this._generateLandmarks();
  }

  _generateNature() {
    const half = this.size / 2;
    for (let gx = -half + 2; gx <= half - 2; gx++) {
      for (let gz = -half + 2; gz <= half - 2; gz++) {
        if (Math.abs(gx) < 4 && Math.abs(gz) < 4) continue;

        const h = this._columnHeight(gx, gz);
        if (this.getBlock(gx, h, gz) === 'water') continue;

        const surface = this.getBlock(gx, h - 1, gz);
        const canGrowTree = surface === 'grass' || surface === 'snow';
        const canGrowFlower = surface === 'grass';
        const treeChance = surface === 'snow' ? 0.022 : surface === 'grass' ? 0.045 : 0;

        if (canGrowTree && randomAt(gx, gz, 1) < treeChance) {
          this._addTree(gx, h, gz);
          continue;
        }

        if ((surface === 'grass' || surface === 'sand' || surface === 'snow') && randomAt(gx, gz, 5) < 0.045) {
          this._addRock(gx, h, gz);
          continue;
        }

        if ((surface === 'grass' || surface === 'snow') && randomAt(gx, gz, 6) < 0.055) {
          this._addBush(gx, h, gz);
          continue;
        }

        if (canGrowFlower && randomAt(gx, gz, 2) < 0.08) {
          const flower = randomAt(gx, gz, 3) > 0.5 ? 'wildflower' : 'rose';
          if (this.blocks[flower]) this.voxels.set(keyOf(gx, h, gz), flower);
        }
      }
    }
  }

  _addTree(gx, baseY, gz) {
    const trunkH = 4 + Math.floor(randomAt(gx, gz, 4) * 3);
    for (let y = 0; y < trunkH; y++) {
      this.voxels.set(keyOf(gx, baseY + y, gz), 'wood');
    }

    const top = baseY + trunkH;
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        for (let y = -1; y <= 1; y++) {
          if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
          if (Math.abs(x) + Math.abs(z) + Math.abs(y) > 4) continue;
          this.voxels.set(keyOf(gx + x, top + y, gz + z), 'leaves');
        }
      }
    }
    this.voxels.set(keyOf(gx, top + 2, gz), 'leaves');
  }

  _addRock(gx, baseY, gz) {
    this.voxels.set(keyOf(gx, baseY, gz), 'stone');
    if (randomAt(gx, gz, 7) > 0.45) this.voxels.set(keyOf(gx + 1, baseY, gz), 'stone');
    if (randomAt(gx, gz, 8) > 0.65) this.voxels.set(keyOf(gx, baseY + 1, gz), 'stone');
  }

  _addBush(gx, baseY, gz) {
    const radius = randomAt(gx, gz, 9) > 0.55 ? 1 : 0;
    this.voxels.set(keyOf(gx, baseY, gz), 'leaves');
    if (radius) {
      this.voxels.set(keyOf(gx + 1, baseY, gz), 'leaves');
      this.voxels.set(keyOf(gx - 1, baseY, gz), 'leaves');
      this.voxels.set(keyOf(gx, baseY, gz + 1), 'leaves');
      this.voxels.set(keyOf(gx, baseY, gz - 1), 'leaves');
    }
  }

  _generateLandmarks() {
    const half = this.size / 2;
    const candidates = [
      { x: 12, z: -12, radius: 2, build: (x, y, z) => this._addStoneRuin(x, y, z) },
      { x: -13, z: 10, radius: 2, build: (x, y, z) => this._addWell(x, y, z) },
      { x: 10, z: 13, radius: 3, build: (x, y, z) => this._addCampsite(x, y, z) },
      { x: -11, z: -14, radius: 3, build: (x, y, z) => this._addGiantTree(x, y, z) },
      { x: 15, z: 5, radius: 2, build: (x, y, z) => this._addStoneRuin(x, y, z) },
    ];
    let placed = 0;

    for (const { x: gx, z: gz, radius, build } of candidates) {
      if (Math.abs(gx) > half - 5 || Math.abs(gz) > half - 5) continue;
      if (Math.hypot(gx, gz) < 7) continue;
      const baseY = this._flatDryBase(gx, gz, radius);
      if (baseY !== null) {
        build(gx, baseY, gz);
        placed++;
        if (placed >= 3) return;
      }
    }
  }

  _flatDryBase(cx, cz, radius) {
    const heights = [];
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const gx = cx + x;
        const gz = cz + z;
        const h = this._columnHeight(gx, gz);
        if (this.getBlock(gx, h, gz) === 'water') return null;
        heights.push(h);
      }
    }
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    return max - min <= 2 ? max : null;
  }

  _addStoneRuin(cx, baseY, cz) {
    const footprint = 2;
    for (let x = -footprint; x <= footprint; x++) {
      for (let z = -footprint; z <= footprint; z++) {
        const edge = Math.abs(x) === footprint || Math.abs(z) === footprint;
        if (!edge) continue;
        const gap = z === footprint && x === 0;
        if (gap) continue;
        const height = 1 + Math.floor(randomAt(cx + x, cz + z, 10) * 3);
        for (let y = 0; y < height; y++) {
          this.voxels.set(keyOf(cx + x, baseY + y, cz + z), 'stone');
        }
      }
    }
    this.voxels.set(keyOf(cx, baseY, cz), 'wildflower');
    this.voxels.set(keyOf(cx + 1, baseY, cz - 1), 'rose');
  }

  _addWell(cx, baseY, cz) {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        const edge = Math.abs(x) === 1 || Math.abs(z) === 1;
        this.voxels.set(keyOf(cx + x, baseY, cz + z), edge ? 'stone' : 'water');
        if (edge) this.voxels.set(keyOf(cx + x, baseY + 1, cz + z), 'stone');
      }
    }
    this.voxels.set(keyOf(cx - 1, baseY + 2, cz), 'wood');
    this.voxels.set(keyOf(cx + 1, baseY + 2, cz), 'wood');
    this.voxels.set(keyOf(cx, baseY + 3, cz), 'wood');
    this.voxels.set(keyOf(cx, baseY + 2, cz), 'marker');
  }

  _addCampsite(cx, baseY, cz) {
    const stones = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [x, z] of stones) {
      this.voxels.set(keyOf(cx + x, baseY, cz + z), x === 0 && z === 0 ? 'ember' : 'stone');
    }
    this.voxels.set(keyOf(cx - 2, baseY, cz - 1), 'wood');
    this.voxels.set(keyOf(cx - 2, baseY, cz), 'wood');
    this.voxels.set(keyOf(cx + 2, baseY, cz + 1), 'wood');
    this.voxels.set(keyOf(cx + 2, baseY, cz), 'wood');
    this.voxels.set(keyOf(cx, baseY, cz + 3), 'marker');
    this.voxels.set(keyOf(cx + 1, baseY, cz + 3), 'wildflower');
  }

  _addGiantTree(cx, baseY, cz) {
    const trunkH = 8;
    for (let y = 0; y < trunkH; y++) {
      this.voxels.set(keyOf(cx, baseY + y, cz), 'wood');
      if (y < trunkH - 2 && y % 2 === 0) this.voxels.set(keyOf(cx + 1, baseY + y, cz), 'wood');
    }
    const top = baseY + trunkH;
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        for (let y = -2; y <= 2; y++) {
          const shape = Math.abs(x) + Math.abs(z) + Math.abs(y);
          if (shape > 6 || (Math.abs(x) === 3 && Math.abs(z) === 3)) continue;
          this.voxels.set(keyOf(cx + x, top + y, cz + z), 'leaves');
        }
      }
    }
    this.voxels.set(keyOf(cx, top + 3, cz), 'leaves');
    this.voxels.set(keyOf(cx + 2, baseY, cz + 2), 'marker');
  }

  inBounds(gx, gz) {
    const half = this.size / 2;
    return gx >= -half && gx <= half && gz >= -half && gz <= half;
  }

  // Integer-voxel solidity test. Below y=0 is bedrock (always solid).
  isSolidVoxel(gx, gy, gz) {
    if (gy < 0) return true;
    const id = this.voxels.get(keyOf(gx, gy, gz));
    return !!id && id !== 'water' && id !== 'wildflower' && id !== 'rose' && id !== 'ember';
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
      const materialOptions = { color: blockDef.color };
      if (id === 'water') {
        materialOptions.transparent = true;
        materialOptions.opacity = 0.42;
        materialOptions.depthWrite = false;
      }
      if (id === 'leaves') {
        materialOptions.transparent = true;
        materialOptions.opacity = 0.9;
      }
      if (id === 'wildflower' || id === 'rose') {
        materialOptions.emissive = new THREE.Color(blockDef.color).multiplyScalar(0.12);
      }
      if (id === 'ember') {
        materialOptions.emissive = new THREE.Color(blockDef.color).multiplyScalar(0.7);
      }
      const material = new THREE.MeshLambertMaterial(materialOptions);
      const mesh = new THREE.InstancedMesh(this.sharedGeometry, material, positions.length);

      positions.forEach((p, i) => {
        dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
        if (id === 'wildflower' || id === 'rose') {
          dummy.position.y = p[1] + 0.28;
          dummy.scale.set(0.28, 0.56, 0.28);
        } else if (id === 'ember') {
          dummy.position.y = p[1] + 0.16;
          dummy.scale.set(0.5, 0.32, 0.5);
        } else if (id === 'marker') {
          dummy.position.y = p[1] + 0.34;
          dummy.scale.set(0.38, 0.68, 0.18);
        } else if (id === 'water') {
          dummy.position.y = p[1] + 0.42;
          dummy.scale.set(1, 0.84, 1);
        } else {
          dummy.scale.set(1, 1, 1);
        }
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
