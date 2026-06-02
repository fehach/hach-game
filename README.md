# Hach Game

A Minecraft-style voxel game built together by the Hach family. Runs in your web browser using [Three.js](https://threejs.org/).

## Run it

```bash
npm install
npm run dev
```

Then your browser opens at `http://localhost:5173`. Click **Play** and start exploring!

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look around | Mouse |
| Jump | `Space` |
| Break block | Left click |
| Place block | Right click |
| Pick block | `1`-`8` or scroll |
| See yourself (3rd person) | `V` |
| Save / Load your world | `O` / `L` |
| Mute sound | `M` |
| Release mouse | `Esc` |

Your world **auto-saves** as you play and **auto-loads** next time you open the game. The sky also moves through a **day/night cycle**.

## For the kids: change the game without coding!

Open the files in the `config/` folder with any text editor. Change a value, save, and refresh the game.

- **`config/blocks.json`** — block names and colors. Try changing `grass` color to `#ff00ff` for pink grass!
- **`config/worlds.json`** — world themes. Change `defaultWorld` to `"desert"` or `"snow"` to start in a different place. `hilliness` (0 to 1) makes the land flatter or bumpier.
- **`config/characters.json`** — character colors (used in a later update).

## Project status

- [x] **Phase 1** — Walk and explore a generated world
- [x] **Phase 2** — Build and break blocks
- [x] **Phase 3** — Pick between multiple world themes (in-game menu)
- [x] **Phase 4** — Custom characters (pick on menu, press V for third-person)
- [x] **Phase 5** — Save/load, sounds, day/night

## How it works (for grown-ups)

- `src/world.js` — generates terrain from smooth value-noise and renders it with `InstancedMesh` for speed.
- `src/player.js` — first-person camera, movement, gravity, and box collision against the terrain.
- `src/main.js` — sets up the scene, lighting, menu, and game loop.
