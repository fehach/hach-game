import * as THREE from 'three';
import { buildCharacterModel, colorCharacterModel } from './character.js';

const DEFAULT_DEF = {
  name: 'My Character',
  head: '#f1c27d',
  body: '#2a9d8f',
  arms: '#f1c27d',
  legs: '#264653',
};

// A small self-contained 3D preview of a character that spins and recolors
// live as the user edits it.
export class CharacterPreview {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.0, 3.1);
    this.camera.lookAt(0, 0.9, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    this.def = { ...DEFAULT_DEF };
    this.parts = buildCharacterModel(this.def);
    this.scene.add(this.parts.group);

    this.running = false;
    this._loop = this._loop.bind(this);
  }

  set(def) {
    this.def = { ...this.def, ...def };
    colorCharacterModel(this.parts, this.def);
  }

  setColor(part, hex) {
    this.def[part] = hex;
    colorCharacterModel(this.parts, this.def);
  }

  // Match the renderer to the canvas's current displayed size. Must be called
  // once the canvas is visible (it has zero size while the panel is hidden).
  resize() {
    const w = this.canvas.clientWidth || 220;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    this.parts.group.rotation.y += 0.012;
    this.renderer.render(this.scene, this.camera);
  }
}
