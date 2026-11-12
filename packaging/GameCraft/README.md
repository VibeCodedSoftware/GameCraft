# GameCraft 0.1.0 (Windows x64)

GameCraft is a visual game editor. Place objects in a 3D or 2D scene, set them up with Blender-style lights,
cameras and materials, and give them behavior with Construct-style event sheets or Scratch-style blocks
(the same logic, two views). Press Play to test instantly.

## Run

1. Unzip anywhere (for example `Documents\GameCraft`). Keep the folders next to `GameCraft.exe`.
2. Double-click **GameCraft.exe**.

Requirements: Windows 10 or 11 (64-bit) with the Microsoft Edge **WebView2 Runtime** (included with
Windows 11 and current Windows 10; otherwise install it from Microsoft). A GPU with WebGL 2 support.

The program is not code-signed yet. If Windows SmartScreen shows "Windows protected your PC", choose
**More info → Run anyway**.

## Start

* **Create a new project** from Blank 3D / Blank 2D, or from a template or demo. Every template is a complete,
  editable game with a step-by-step tutorial.
* Projects save automatically to `%LOCALAPPDATA%\CraftApps\GameCraft\projects` (Ctrl+S saves now).
* **Play / Stop**: the Play button or F5. Mouse-look games capture the mouse when you press Play;
  **Esc** releases it, Esc again stops the game.

## Templates and demos

| Template | What it shows |
|---|---|
| Truck Coin Collector | Car behavior, collectibles, timer, finish line |
| 3D Platformer | Animated character, moving platforms, checkpoints |
| 2D Side Scroller | Pixel-art sprites, enemies, lives, parallax |
| Physics Playground | Carry, drop and throw objects with mass |
| Combat Arena | Animated fighters, sword and gun, pathfinding AI |
| Arms Shooter | First person with the LowPolyArms model, hitscan weapons, enemy waves |
| Digging Treasure Hunt | First-person voxel terrain you can dig and build, buried treasure |
| Dungeon Bound | A level made in Blender (.blend) with a wizard character, keys, levers, traps |
| Backrooms | First-person infinite rooms from a .blend, survival, inventory (Tab), building, a monster |

## Your own assets

* **Import** (Assets panel): `.blend` files open directly (no Blender needed) — choose which objects to import.
  Also `.glb/.gltf`, `.fbx`, `.obj` (+ `.mtl`), images, audio and fonts.
* Models placed in the `Assets` folder next to the program appear under Assets › Library.

## Logic

Event sheets and blocks edit the same logic. Logic can be sent to and from **LogicCraft** (the companion
visual-programming app) and exported as JavaScript, Python, Lua, C# or C++.

## Folders

* `GameCraft.exe` — the application.
* `Assets` — your models (shown in the asset library).
* `asset-library` — models, textures, fonts and animations used by the templates.

See `NOTICE.md` for credits and third-party licences.
