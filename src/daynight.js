import * as THREE from 'three';

const NIGHT = new THREE.Color('#111827');
const FOG_NEAR = 42;
const FOG_FAR = 95;

// Smoothly cycles the sky color and sunlight between day and night.
export class DayNight {
  constructor(scene, sun, ambient) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;

    this.day = new THREE.Color('#87ceeb');
    this.cycleSeconds = 120; // one full day-night loop
    this.time = this.cycleSeconds * 0.25; // start at mid-morning
    this.enabled = true;

    this._sky = new THREE.Color();
    this.scene.fog = new THREE.Fog(this._sky, FOG_NEAR, FOG_FAR);

    this._buildSkyObjects();
  }

  _buildSkyObjects() {
    this.sunDisk = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#fff0a6' })
    );
    this.scene.add(this.sunDisk);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#dce7ff' })
    );
    this.scene.add(this.moon);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < 140; i++) {
      const angle = i * 2.399;
      const radius = 75 + (i % 17) * 1.4;
      const height = 34 + ((i * 13) % 34);
      starPositions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: '#ffffff',
        size: 0.7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.scene.add(this.stars);

    this.clouds = new THREE.Group();
    const cloudMaterial = new THREE.MeshLambertMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudSeeds = [
      [-22, 28, -18],
      [16, 31, -28],
      [27, 27, 12],
      [-12, 33, 25],
      [4, 30, 18],
    ];

    for (const [cx, cy, cz] of cloudSeeds) {
      const cloud = new THREE.Group();
      const puffs = [
        [0, 0, 0, 7, 1.2, 3],
        [4, 0.4, 0.6, 5, 1.4, 2.5],
        [-4, 0.2, -0.3, 5.5, 1.1, 2.3],
        [0.8, 0.8, -1.5, 4.5, 1.2, 2.8],
      ];
      for (const [x, y, z, sx, sy, sz] of puffs) {
        const puff = new THREE.Mesh(cloudGeo, cloudMaterial);
        puff.position.set(x, y, z);
        puff.scale.set(sx, sy, sz);
        cloud.add(puff);
      }
      cloud.position.set(cx, cy, cz);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
  }

  // Match the daytime sky to the current world theme.
  setDayColor(hex) {
    this.day.set(hex);
  }

  update(dt) {
    if (!this.enabled) return;
    this.time = (this.time + dt) % this.cycleSeconds;

    // Angle of the sun across the sky (one full turn per cycle).
    const angle = (this.time / this.cycleSeconds) * Math.PI * 2;
    const height = Math.sin(angle); // -1 (midnight) .. 1 (noon)

    // Daylight factor 0..1 with a soft dawn/dusk.
    const daylight = THREE.MathUtils.clamp((height + 0.2) / 1.2, 0, 1);

    // Blend sky between night and the theme's day color.
    this._sky.copy(NIGHT).lerp(this.day, daylight);
    this.scene.background = this._sky;
    this.scene.fog.color.copy(this._sky);

    // Move and dim the sun.
    this.sun.position.set(Math.cos(angle) * 60, Math.max(height, -0.3) * 60, 25);
    this.sun.intensity = 0.15 + daylight * 1.05;
    this.ambient.intensity = 0.3 + daylight * 0.4;

    this.sunDisk.position.copy(this.sun.position);
    this.sunDisk.visible = height > -0.05;
    this.sunDisk.material.color.copy(this.day).lerp(new THREE.Color('#fff0a6'), 0.65);

    const moonAngle = angle + Math.PI;
    const moonHeight = Math.sin(moonAngle);
    this.moon.position.set(Math.cos(moonAngle) * 58, Math.max(moonHeight, -0.3) * 58, -25);
    this.moon.visible = moonHeight > -0.05;

    const night = 1 - daylight;
    this.stars.material.opacity = THREE.MathUtils.clamp((night - 0.25) / 0.75, 0, 1);
    this.clouds.position.x = Math.sin(this.time * 0.018) * 3;
    this.clouds.position.z = Math.cos(this.time * 0.014) * 2;
    this.clouds.traverse((child) => {
      if (child.material) child.material.opacity = 0.35 + daylight * 0.42;
    });
  }
}
