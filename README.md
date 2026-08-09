# CyberSpace

A game built around a real network-engineering idea: **network
inconsistency**. The 3D WebGL flight version is the main game. An earlier
2D top-down arcade version still lives in the repo, built from the exact
same fake network topology, but it's no longer linked from the front door.

A sector of space holds ten devices — routers, switches, a firewall, servers,
a satellite uplink, a monitoring node. Each is configured with interfaces,
IP addresses, VRFs, and routing protocols (BGP, OSPF, static routes). Most
interfaces have a real peer on another device, so a calm green link joins
the two. A few interfaces reference a peer that **doesn't actually exist** —
a ghost BGP neighbor, a VRF/subnet mismatch, a neighbor address outside its
own subnet, a dead OSPF adjacency. Those fields glow red and arm a sweeping
laser turret.

You fly a ship between the devices, dodge the red sweeps, and shoot the red
emitters to fix the inconsistencies. You have 5 lives. Fix all of them to
win; touch a beam too many times and it's game over. In the 3D version each
turret sweeps a wide circle-segment arc rather than a thin line — some scan
side to side in a horizontal plane, others sweep up and down in a vertical
one.

In the 3D version, every inconsistency left unfixed also keeps spawning a
**bug** — a small hostile glitch, shaped like the classic software-bug icon,
that homes in on your ship. Only one is ever alive at a time. It costs a
life on contact like the arcs do, but one shot kills it, and fixing the
turret it came from stops that spawn source for good.

## Play it

Fully static, no build step, no npm install for players.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

`index.html` at the repo root immediately redirects to
**[`3d/index.html`](3d/index.html)** — a Three.js/WebGL flight version: fly a
canyon of glowing data towers, each carrying floating glass status cubes for
its interfaces, connected by cable-like links arcing across the canyon
floor's glowing circuit traces.

The original top-down Canvas game is still in the repo at
**[`2d/index.html`](2d/index.html)** and fully playable — it's just not
linked from the root anymore.

Both use classic `<script>` tags (no ES modules, no fetch/CORS dependency),
so they also work opened directly via `file://` in most browsers.

## Controls

**3D** (`3d/index.html`, the main game)

| Key | Action |
| --- | --- |
| `A`/`D` or `←`/`→` | Turn |
| `W`/`S` or `↑`/`↓` | Pitch up/down |
| `Shift` | Thrust (hold to move, release to coast to a stop — the ship sits still otherwise) |
| `Space` or left click | Fire |
| Click a tower | Open its configuration inspector |
| `P` / `Esc` | Pause |
| `Enter` / `R` | Restart from the end screens |

**2D** (`2d/index.html`, still in the repo but no longer linked from the root)

| Key | Action |
| --- | --- |
| `A`/`D` or `←`/`→` | Rotate the ship |
| `W` or `↑` | Thrust |
| `Space` or left click | Fire |
| Click a device | Open its configuration inspector |
| `P` / `Esc` | Pause |
| `Enter` / `R` | Restart from the end screens |

Both versions have a 🔊/🔇 mute button in the bottom-right corner (its state is
remembered across visits via `localStorage`).

## Sound

All sound is synthesized on the fly with the WebAudio API in
[`js/audio.js`](js/audio.js) — no audio files are shipped, matching the
"generate everything, ship no binary assets" approach already used for the
3D textures. It covers firing, explosions, taking a hit, a pitch-shifting
engine hum while thrusting, win/lose stings, and (3D only) bug spawn/kill
cues. Browsers block audio until a user gesture, so it only unlocks once you
click LAUNCH, RESUME, RETRY, or the mute button.

Losing a life (but not the game) sends the ship back to its launch point
with zero velocity rather than letting it carry on from wherever it got hit.

## How the game world is built

Everything playable in both versions is derived from one fixed dataset in
[`js/data.js`](js/data.js) (shared at the repo root): a list of devices,
each with a small set of interface "fields" (LEDs in 2D, floating status
cubes in 3D). A field is either:

- **`iface(... , peer)`** — consistent: it names another device+field as its
  peer, and the engine draws a link between them (a pulsing green laser in
  2D, a glowing cable arc in 3D).
- **`brokenIface(..., issue)`** — inconsistent: no real peer, just a
  human-readable `issue` string. The engine spawns a turret there — a red
  beam that sweeps through a slow drift + faster scan (two combined sine
  waves) and damages the ship on contact.

`buildWorld()` (2D, in [`2d/js/entities.js`](2d/js/entities.js)) and
`buildWorld3D()` (3D, in [`3d/js/entities3d.js`](3d/js/entities3d.js)) are
the single places that turn that shared dataset into live game objects
(both deep-clone it first, so turret hits during a playthrough never leak
into the next one). To build your own scenario — more devices, different
protocols, a harder mix of inconsistencies — you only need to edit
`js/data.js`; the rendering, collision, and win/lose logic in both versions
read from `field.consistent` / `field.peer` generically and don't hard-code
any device names.

### Current dataset

- 16 devices: 2 core routers (BGP AS 65001/65002), 2 distribution switches,
  1 firewall, 8 servers, 1 isolated edge router, 1 satellite uplink, 1
  monitoring node.
- 12 consistent links (both ends agree on subnet, VRF, and peer).
- 5 inconsistencies to hunt: a VRF/subnet mismatch, a BGP neighbor address
  outside its own subnet, two "ghost peer" BGP neighbors that were never
  configured on the other end, and a dead OSPF adjacency.

## Project layout

```
index.html          redirects to 3d/index.html (the main game)
js/data.js           the fake network topology (devices/fields/links/issues) — shared
js/vec.js             2D vector / geometry helpers — used by 2d/
js/audio.js            procedural WebAudio sound engine (SFX) — shared by 2d/ and 3d/

2d/index.html        2D game page shell, canvas, HUD, screens
2d/style.css
2d/js/starfield.js    parallax starfield + nav-grid background
2d/js/entities.js     Device, GreenLink, Turret, Ship, Bullet, Particle, buildWorld()
2d/js/game.js         game loop, input, camera, collisions, HUD, state machine
2d/js/main.js

3d/index.html         3D game page shell, canvas, HUD, screens
3d/style.css
3d/vendor/three.min.js   vendored Three.js r160 (no CDN dependency)
3d/js/flavor.js        cosmetic filler: generated hostnames, real top-10 bash commands, varied IPs
3d/js/textures.js     procedural canvas textures: tower panels, circuit ground, cube faces
3d/js/scene.js        renderer, camera, fog, lighting, starfield, ground plane
3d/js/entities3d.js   Tower, DataCube, GreenLink3D, Turret3D, buildWorld3D()
3d/js/ship.js          Ship3D, Bullet3D, Particle3D
3d/js/bug.js           Bug3D — homes in on the ship, spawned by still-broken turrets
3d/js/game3d.js        game loop, input, chase camera, collisions, HUD, state machine
3d/js/main.js
```

## Roadmap ideas

Natural next steps if this goes further:
- Randomized/procedurally-generated topologies instead of the fixed dataset.
- More protocol flavors (MPLS labels, VLAN trunk mismatches, NAT overlaps).
- Difficulty tiers (more turrets, faster sweeps, tighter beam width).
- Real bloom post-processing in the 3D version for an even stronger glow
  (currently faked with emissive materials + fog, no extra render passes,
  to keep the renderer simple and dependency-free).
