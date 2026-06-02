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

export class Character {
  constructor(scene, def) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.time = 0;

    // Body proportions (in blocks). Feet sit at group origin (y = 0).
    this.head = makeBox(0.5, 0.5, 0.5, def.head, 1.5);
    this.body = makeBox(0.55, 0.6, 0.3, def.body, 1.0);

    this.leftArm = makeLimb(0.2, 0.6, 0.2, def.arms);
    this.rightArm = makeLimb(0.2, 0.6, 0.2, def.arms);
    this.leftArm.position.set(-0.375, 1.3, 0);
    this.rightArm.position.set(0.375, 1.3, 0);

    this.leftLeg = makeLimb(0.22, 0.7, 0.22, def.legs);
    this.rightLeg = makeLimb(0.22, 0.7, 0.22, def.legs);
    this.leftLeg.position.set(-0.14, 0.7, 0);
    this.rightLeg.position.set(0.14, 0.7, 0);

    this.group.add(
      this.head,
      this.body,
      this.leftArm,
      this.rightArm,
      this.leftLeg,
      this.rightLeg
    );
    this.scene.add(this.group);
  }

  // Recolor every part from a character definition.
  setColors(def) {
    this.head.userData.material.color.set(def.head);
    this.body.userData.material.color.set(def.body);
    this.leftArm.userData.material.color.set(def.arms);
    this.rightArm.userData.material.color.set(def.arms);
    this.leftLeg.userData.material.color.set(def.legs);
    this.rightLeg.userData.material.color.set(def.legs);
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
