# Dalal Dhoro — দালাল ধরো

A first-person 3D browser game, fully in Bangla, set in Bangladeshi government offices. Get your work done (passport, driving licence, land mutation, customs release) **without paying ghush** and without being cheated by dalals.

## How it plays
- Walk around the office compound and building in first person. Strangers walk up and offer "help". Some are genuine, but most are **dalals**, and a dalal **always** cheats: he runs away, asks for more money, hands you a fake slip, or says "kaj hobe na".
- Every counter has a real queue: you join at the back and wait while the officer serves the people ahead of you (time fast-forwards while you wait, but it still counts). You can't cut in, people block you and tell you off. Dalals work the line offering to skip it, and at corrupt counters their clients walk straight to the front.
- Every step of your work has two counters. Some officers are corrupt, and you can't tell which until they ask for "speed money". You can pay, refuse (they stall you), or call the **ACC hotline 106**.
- Report dalals to the **police** (gate police box or inside by the door). They arrest the dalal on the spot and return your money if he hasn't fled.
- Clues: crooked counters have suspiciously short queues, dalals whisper (৳) at crooked desks, and citizens and the tea seller pass on gossip. The Citizen Charter lists the real fees.
- 4 offices: Passport Office (Agargaon), BRTA (Mirpur), AC Land Office (Savar), Custom House (Chattogram). The office is picked automatically each time you press Play.
- Realistic people come from the Microsoft Rocketbox avatar library (MIT, see assets/people/LICENSE), 14 models (~9 MB) driven by in-code walk and gesture animation. If they fail to load, people are built in code instead, with real proportions: faces, hands, lungi, panjabi, kameez and hijab, police and officer uniforms, and a walk cycle with bending knees and elbows. They turn to look at you and gesture while talking.

## Controls
- Desktop: move the mouse to look around (no clicking needed), **WASD** to walk, **Shift** to run, **E** to talk to whoever is in your crosshair, **1–4** to pick an answer, **N** for the notebook, **Esc** to pause.
- Phone: drag the left side to walk, drag the right side to look, tap (or 💬) to talk.

## Tech
Plain HTML/CSS/JS with no build step. The world uses CC0 photo textures and an HDR sky from [Poly Haven](https://polyhaven.com) (assets/world, ~4 MB), physically based materials and ACES tone mapping. 3D uses [Three.js r128](https://threejs.org) from a CDN, and everything is low-poly and generated in code (no image or model assets).

```
index.html
css/style.css
js/data.js       offices, names, dialogue
js/world.js      layout, collision, 2D floor art (ground texture + minimap), portraits
js/render3d.js   Three.js first-person scene, buildings, vehicles, overlay, look input
js/humans3d.js   procedural human models, animation, dialog portraits
js/rocketbox.js  loads the Rocketbox avatars and poses their skeletons
assets/people/   Rocketbox models + downscaled textures
js/game.js       game logic, AI, dialogue, HUD
```

Run locally: `node dev-server.js`, then open http://localhost:5190.

## License
MIT — see [LICENSE](LICENSE). The 3D people are from Microsoft Rocketbox, also MIT — see [assets/people/LICENSE](assets/people/LICENSE).
