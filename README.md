# Depth Miner

A 2D caving game about descending into a shaft that remembers everything you did to it.

No build step, no dependencies — plain ES modules, HTML canvas and `localStorage`. Open `index.html` over HTTP and play.

## The idea

You mine downward through six biomes. Each one is stranger than the last and changes how the world behaves:

| Depth | Biome | What changes |
| --- | --- | --- |
| 0 m | Limestone Hollows | Ordinary rock, ordinary gravity |
| 60 m | Crystal Hollows | The rock is springy — hard landings bounce you back up |
| 145 m | Fungal Deep | Low gravity, thick drag, and oxygen starts to matter |
| 250 m | Magma Veins | Heavy gravity, lava pools, lamp oil burns twice as fast |
| 380 m | Static Strata | Gravity stutters up and down on its own |
| 520 m | The Hollow Below | Near-weightless, and every so often gravity inverts entirely |

## The persistence twist

Nothing resets between runs:

- **Every tile you break or place is saved.** Your shafts, ladders, platforms and torches are still there next run — including the ones that killed you.
- **Dying drops everything.** Your ore stays at the exact spot you fell, as a set of remains you have to walk back down to and collect.
- **Other miners died here first.** Twenty-two sets of procedurally seeded remains are scattered through the depths, each with a name, an epitaph, the gear they left behind and a little loot. They read as environmental storytelling — and as a warning about how deep you are.
- **Outposts grow while you are away.** Plant an outpost core (30 stone + 12 iron) and it levels up on real elapsed time and completed runs, unlocking refuelling, oxygen, field medicine, salvage drones that stockpile ore for you, and finally a beacon link that lets you travel between outposts.

## Resources and risk

- **Fuel** feeds your lamp. As it drains, your light radius shrinks until you are effectively blind. Lumen crystals in the walls top it up.
- **Oxygen** only matters below 145 m and drains faster the deeper you go. At zero it kills quickly. Air canisters (`Q`) buy you seventy seconds of panic.
- **Ore** is worth more the deeper it comes from — copper is worth 5, voidglass 280. Sell at the surface station and spend on lamp, pick, tank, plating and burn-regulator upgrades.

Go deeper for the good ore; die and it all stays down there until you come back for it.

## Controls

| | |
| --- | --- |
| `A` / `D` | Move |
| `W` / `Space` | Jump (also climbs ladders, with `S` to descend) |
| Left click | Mine rock, strike creatures |
| Right click | Place the selected build |
| `1`–`4` | Platform · Ladder · Torch · Outpost core |
| `E` | Use the surface station or an outpost |
| `Q` | Crack an air canister |
| `H` / `Esc` | Field manual · pause and run stats |

## Running it locally

ES modules need a real HTTP origin, so `file://` will not work:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push. The site is entirely static — the whole game is the five files in `js/` plus `index.html` and `styles.css`.

Pages has to be switched on once by hand, because the workflow token is not allowed to create the Pages site: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that, every push deploys, and the game lives at `https://<user>.github.io/2dGame/`.

## Layout

```
index.html      canvas, HUD and the modal panels
styles.css      HUD, panels, title screen
js/util.js      RNG, value noise, colour helpers
js/tiles.js     tile table, ore values, biome definitions
js/world.js     procedural generation + the sparse map of persisted edits
js/save.js      localStorage schema, and the miners who died before you
js/entities.js  creatures, particles, the AABB tile collision solver
js/game.js      loop, player, mining, building, outposts, rendering, UI
```

Your save lives under the `depthminer.save.v1` key in `localStorage`. "Collapse the mine" on the title screen wipes it.
