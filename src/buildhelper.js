// The "build helper" agent: pre-programmed routines that construct structures
// for the player using the world's bulk block setter. No AI service needed.

export class BuildHelper {
  constructor(world, player) {
    this.world = world;
    this.player = player;
  }

  setWorld(world) {
    this.world = world;
  }

  // Pick a clear spot a few blocks in front of the player to build on.
  _target(distance = 4) {
    const p = this.player.position;
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    const cx = Math.floor(p.x + fx * distance);
    const cz = Math.floor(p.z + fz * distance);
    const base = this.world.surfaceHeight(cx, cz); // first empty y above ground
    return { cx, cz, base };
  }

  buildHouse() {
    const { cx, cz, base } = this._target(5);
    const blocks = [];
    const r = 2; // half-width -> 5x5 footprint
    const wallH = 3;

    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        // Floor.
        blocks.push({ x: cx + x, y: base, z: cz + z, id: 'stone' });
        // Roof.
        blocks.push({ x: cx + x, y: base + wallH + 1, z: cz + z, id: 'wood' });
      }
    }

    // Walls (the outer ring), leaving a 1-wide, 2-tall doorway at the front.
    for (let h = 1; h <= wallH; h++) {
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          const edge = x === -r || x === r || z === -r || z === r;
          if (!edge) continue;
          const isDoor = z === r && x === 0 && h <= 2;
          if (isDoor) continue;
          blocks.push({ x: cx + x, y: base + h, z: cz + z, id: 'wood' });
        }
      }
    }

    this.world.setBlocksBulk(blocks);
    return 'house';
  }

  buildTower() {
    const { cx, cz, base } = this._target(4);
    const blocks = [];
    const height = 12;
    const r = 1; // 3x3

    for (let h = 0; h < height; h++) {
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          const edge = x === -r || x === r || z === -r || z === r;
          if (edge) blocks.push({ x: cx + x, y: base + h, z: cz + z, id: 'stone' });
        }
      }
    }
    // Battlement platform on top.
    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        blocks.push({ x: cx + x, y: base + height, z: cz + z, id: 'stone' });
      }
    }

    this.world.setBlocksBulk(blocks);
    return 'tower';
  }

  plantTree() {
    const { cx, cz, base } = this._target(3);
    const blocks = [];
    const trunkH = 5;

    for (let h = 0; h < trunkH; h++) {
      blocks.push({ x: cx, y: base + h, z: cz, id: 'wood' });
    }
    // Leafy canopy: a small blob around the top of the trunk.
    const top = base + trunkH;
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        for (let y = -1; y <= 1; y++) {
          if (Math.abs(x) === 2 && Math.abs(z) === 2) continue; // round the corners
          blocks.push({ x: cx + x, y: top + y, z: cz + z, id: 'leaves' });
        }
      }
    }
    blocks.push({ x: cx, y: top + 2, z: cz, id: 'leaves' });

    this.world.setBlocksBulk(blocks);
    return 'tree';
  }
}
