import * as THREE from 'three';

// Build one limb as a group whose origin is the joint (top of the box), so we
// can swing it from the shoulder/hip like a real arm or leg.
function makeLimb(width, height, depth, color) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -height / 2; // hang below the joint
  group.add(mesh);
  group.userData.material = mat;
  return group;
}

function makeBox(width, height, depth, color, y) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.userData.material = mat;
  return mesh;
}

// Build the blocky humanoid as a group with named parts. Reused by both the
// in-world Character and the Character Creator's live preview.
export function buildCharacterModel(def) {
  const group = new THREE.Group();

  // Body proportions (in blocks). Feet sit at group origin (y = 0).
  const head = makeBox(0.5, 0.5, 0.5, def.head, 1.5);
  const body = makeBox(0.55, 0.6, 0.3, def.body, 1.0);

  const leftArm = makeLimb(0.2, 0.6, 0.2, def.arms);
  const rightArm = makeLimb(0.2, 0.6, 0.2, def.arms);
  leftArm.position.set(-0.375, 1.3, 0);
  rightArm.position.set(0.375, 1.3, 0);

  const leftLeg = makeLimb(0.22, 0.7, 0.22, def.legs);
  const rightLeg = makeLimb(0.22, 0.7, 0.22, def.legs);
  leftLeg.position.set(-0.14, 0.7, 0);
  rightLeg.position.set(0.14, 0.7, 0);

  group.add(head, body, leftArm, rightArm, leftLeg, rightLeg);
  return { group, head, body, leftArm, rightArm, leftLeg, rightLeg };
}

// Recolor a model (the object returned by buildCharacterModel) from a def.
export function colorCharacterModel(parts, def) {
  parts.head.userData.material.color.set(def.head);
  parts.body.userData.material.color.set(def.body);
  parts.leftArm.userData.material.color.set(def.arms);
  parts.rightArm.userData.material.color.set(def.arms);
  parts.leftLeg.userData.material.color.set(def.legs);
  parts.rightLeg.userData.material.color.set(def.legs);
}

export class Character {
  constructor(scene, def) {
    this.scene = scene;
    this.time = 0;

    this.parts = buildCharacterModel(def);
    this.group = this.parts.group;
    this.head = this.parts.head;
    this.body = this.parts.body;
    this.leftArm = this.parts.leftArm;
    this.rightArm = this.parts.rightArm;
    this.leftLeg = this.parts.leftLeg;
    this.rightLeg = this.parts.rightLeg;

    this.scene.add(this.group);
  }

  // Recolor every part from a character definition.
  setColors(def) {
    colorCharacterModel(this.parts, def);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  // Follow the player: stand at their feet, face their yaw, and swing limbs
  // when moving.
  update(player, dt) {
    this.time += dt;

    const p = player.position;
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = player.yaw;

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = speed > 0.5;
    const swing = moving ? Math.sin(this.time * 10) * 0.6 : 0;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing;
    this.rightArm.rotation.x = swing;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
