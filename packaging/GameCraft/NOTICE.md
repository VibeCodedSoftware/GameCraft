# Credits and third-party notices — GameCraft 1.0.0

## Assets included in `asset-library` and `Assets`

* **LowPolyHuman, LowPolyArms, LowPolyTruck, Coin, Gun, Shovel, Sword, Start_Finish** (`Assets`) —
  models supplied by the project owner.
* **DungeonBound_4.blend** (`asset-library/dungeonbound`) — level, wizard character and hearts by the project
  owner. The stone textures (loose and packed in the file) are pixelated, recoloured versions of ambientCG
  **Bricks089** and **PavingStones131** (https://ambientcg.com) — CC0 1.0 Universal (public domain).
* **Backrooms_V10.blend** and the Backrooms textures (`asset-library/backrooms`) — rooms, items and the
  bacteria monster by the project owner. The wallpapers and the grunge/stain map (`wallpapers/`, and the same
  pictures packed in the .blend) were drawn procedurally for GameCraft and are original work under GameCraft's
  license.
* **PublicPixel.ttf** (`asset-library/dungeonbound`) — "Public Pixel" by **GGBotNet**, CC0 1.0 Universal (public
  domain), https://ggbot.net.
* **Universal Animation Library** (`asset-library/animations`) by **Quaternius** — CC0 1.0 Universal
  (public domain), https://quaternius.com. Licence text: `asset-library/animations/UniversalAnimationLibrary-LICENSE.txt`.
* **LowPolyHuman_Animated.glb** (`asset-library/characters`) — the LowPolyHuman model rigged onto the Universal
  Animation Library skeleton with its animations.

## Software

GameCraft is built with:

* **Tauri** (MIT / Apache-2.0) and **WebView2** (Microsoft) — desktop window.
* **three.js** (MIT) — 3D rendering, glTF/FBX/OBJ loaders.
* **React** (MIT) — user interface.
* **fzstd** (MIT) — Zstandard decompression for compressed .blend files.
* Rust crates: `http`, `serde_json`, `percent-encoding`, `dirs` (MIT / Apache-2.0).
