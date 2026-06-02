import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { BlockInteraction } from './interaction.js';
import { Character } from './character.js';
import { DayNight } from './daynight.js';
import { sfx } from './sound.js';

import blocksConfig from '../config/blocks.json';
import worldsConfig from '../config/worlds.json';
import charactersConfig from '../config/characters.json';

// ---- Scene setup ----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// ---- Lighting + day/night ----
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(30, 60, 20);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const dayNight = new DayNight(scene, sun, ambient);

// ---- World + Player ----
let currentWorldId = worldsConfig.defaultWorld;
let world = null;
const player = new Player(camera, createWorld(currentWorldId), canvas);
const interaction = new BlockInteraction(scene, world, player, camera, blocksConfig.blocks);

// ---- Character ----
let currentCharacterId = charactersConfig.defaultCharacter;
const character = new Character(scene, charactersConfig.characters[currentCharacterId]);
character.setVisible(false); // hidden until third-person view

function setCharacter(id) {
  currentCharacterId = id;
  character.setColors(charactersConfig.characters[id]);
  updateCharacterPicker();
}

// Generate (or regenerate) a world from a theme id and apply its sky/fog.
function createWorld(worldId) {
  const worldDef = worldsConfig.worlds[worldId];
  dayNight.setDayColor(worldDef.skyColor);

  if (world) world.dispose();
  world = new World(scene, worldDef, blocksConfig.blocks);
  return world;
}

// Switch themes at runtime: rebuild the world and reset the player onto it.
function loadWorld(worldId) {
  currentWorldId = worldId;
  createWorld(worldId);
  player.setWorld(world);
  interaction.setWorld(world);
  updateWorldPicker();
}

if (import.meta.env.DEV) {
  window.hachGame = {
    getWorld: () => world,
    player,
    interaction,
    character,
    dayNight,
    loadWorld,
    setCharacter,
    saveGame: (...a) => saveGame(...a),
    loadGame: (...a) => loadGame(...a),
  };
}

// ---- Menu / pointer lock ----
const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const playButton = document.getElementById('play-button');

playButton.addEventListener('click', () => {
  sfx.resume(); // unlock audio on the first user click
  player.lock();
});

// ---- World picker ----
const picker = document.getElementById('world-picker');
const worldButtons = {};

function buildWorldPicker() {
  for (const [id, def] of Object.entries(worldsConfig.worlds)) {
    const btn = document.createElement('button');
    btn.className = 'world-btn';
    btn.style.setProperty('--sky', def.skyColor);
    const surfaceColor = (blocksConfig.blocks[def.surfaceBlock] || {}).color || '#888';
    btn.innerHTML = `
      <span class="world-swatch" style="background:${surfaceColor}"></span>
      <span class="world-name">${def.name}</span>`;
    btn.addEventListener('click', () => loadWorld(id));
    picker.appendChild(btn);
    worldButtons[id] = btn;
  }
  updateWorldPicker();
}

function updateWorldPicker() {
  for (const [id, btn] of Object.entries(worldButtons)) {
    btn.classList.toggle('selected', id === currentWorldId);
  }
}

buildWorldPicker();

// ---- Character picker ----
const charPicker = document.getElementById('character-picker');
const charButtons = {};

function buildCharacterPicker() {
  for (const [id, def] of Object.entries(charactersConfig.characters)) {
    const btn = document.createElement('button');
    btn.className = 'char-btn';
    btn.innerHTML = `
      <span class="char-figure">
        <span class="char-head" style="background:${def.head}"></span>
        <span class="char-body" style="background:${def.body}"></span>
      </span>
      <span class="char-name">${def.name}</span>`;
    btn.addEventListener('click', () => setCharacter(id));
    charPicker.appendChild(btn);
    charButtons[id] = btn;
  }
  updateCharacterPicker();
}

function updateCharacterPicker() {
  for (const [id, btn] of Object.entries(charButtons)) {
    btn.classList.toggle('selected', id === currentCharacterId);
  }
}

buildCharacterPicker();

// In-game keyboard shortcuts.
document.addEventListener('keydown', (e) => {
  if (!player.locked) return;
  if (e.code === 'KeyV') player.toggleView();
  if (e.code === 'KeyO') saveGame();
  if (e.code === 'KeyL') loadGame();
  if (e.code === 'KeyM') toast(sfx.toggleMute() ? 'Sound off' : 'Sound on');
});

// ---- Save / load ----
const SAVE_KEY = 'hachGameSave';
let autoSaveTimer = 0;

function saveGame(announce = true) {
  const data = {
    worldId: currentWorldId,
    characterId: currentCharacterId,
    edits: world.getEdits(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (announce) {
      sfx.save();
      toast('Saved your world!');
    }
  } catch (err) {
    toast('Could not save your world.');
  }
}

function loadGame(announce = true) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    if (announce) toast('No saved world yet.');
    return false;
  }
  try {
    const data = JSON.parse(raw);
    loadWorld(data.worldId || currentWorldId);
    if (data.characterId) setCharacter(data.characterId);
    if (Array.isArray(data.edits)) world.applyEdits(data.edits);
    if (announce) toast('Loaded your world!');
    return true;
  } catch (err) {
    return false;
  }
}

function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

// ---- Toast messages ----
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

// Auto-load the last build so it is waiting when the game opens.
if (hasSave()) {
  loadGame(false);
  const note = document.getElementById('save-note');
  if (note) note.style.display = 'block';
}

// Save when leaving the page so nothing is lost.
window.addEventListener('beforeunload', () => saveGame(false));

const hud = document.getElementById('hud');

document.addEventListener('pointerlockchange', () => {
  if (player.locked) {
    overlay.classList.add('hidden');
    crosshair.classList.add('active');
    hud.classList.add('active');
  } else {
    overlay.classList.remove('hidden');
    crosshair.classList.remove('active');
    hud.classList.remove('active');
    saveGame(false); // quietly save whenever the player pauses
  }
});

// ---- Resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Game loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp to avoid big jumps
  player.update(dt);
  interaction.update();
  character.update(player, dt);
  character.setVisible(player.thirdPerson);
  dayNight.update(dt);

  // Auto-save roughly every 15 seconds while playing.
  autoSaveTimer += dt;
  if (player.locked && autoSaveTimer > 15) {
    autoSaveTimer = 0;
    saveGame(false);
  }

  renderer.render(scene, camera);
}

animate();
