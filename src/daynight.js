import * as THREE from 'three';

const NIGHT = new THREE.Color('#0b1026');
const FOG_NEAR = 30;
const FOG_FAR = 70;

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
  }
}
