# Depth Miner

A 2D caving game about descending into a shaft that remembers everything you did to it.

No build step, no dependencies, no assets — plain ES modules, one HTML canvas, `localStorage`. Every texture, backdrop and sprite is drawn procedurally at load.

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
- **Other miners died here first.** Twenty-six sets of procedurally seeded remains are scattered through the depths, each with a name, an epitaph, the gear they left behind and a little loot. Reading one writes it into your journal.
- **Outposts grow while you are away.** Plant an outpost core (30 stone + 12 iron) and it levels up on real elapsed time and completed runs, unlocking refuelling, oxygen, field medicine, salvage drones that stockpile ore for you, and finally a beacon link that lets you travel between outposts.

## Things to do down there

- **Abandoned camps.** Timbered rooms with plank floors, a ladder, a lit torch and a **supply cache** — ore, lamp oil, sometimes charges and flares, and a note somebody left behind.
- **Relics.** Pedestals below 360 m hold eight permanent upgrades that change how you dive: ore that shines through rock, halved fall damage, a lamp that reaches three metres further, immunity to the Static Strata's gravity stutter, and more. They stay with you forever.
- **Contracts.** The station keeps three on the board — haul ore, survey a depth, clear creatures, recover remains, plant an outpost deep. Claim one and a new one replaces it.
- **Blast charges and flares.** Charges clear a three-metre ball of rock (mind the blast radius — it hurts you too). Flares burn for a minute where they land.
- **Elites.** Rarer, bigger, glowing versions of each creature that hit harder and drop four times the ore. They get more common the deeper you go.
- **A journal** (`J`) tracking relics, a bestiary, the strata you've reached and every epitaph you've read.

## Resources and risk

- **Fuel** feeds your lamp. As it drains, your light radius shrinks until you are effectively blind. Lumen crystals in the walls top it up.
- **Oxygen** only matters below 145 m and drains faster the deeper you go. At zero it kills quickly. Air canisters (`Q`) buy you seventy seconds of panic.
- **Ore** is worth more the deeper it comes from — copper is worth 5, voidglass 280. Sell at the surface station and spend on lamp, pick, tank, plating and burn-regulator upgrades.

Go deeper for the good ore; die and it all stays down there until you come back for it.

## Graphics

- A coloured lightmap sampled per tile and upscaled smoothly, so every light source — lamp, torch, magma, glimmer vein, flare, outpost beacon — throws its own colour, plus an additive bloom pass on top.
- Your headlamp is directional: a soft pool around you and a cone thrown the way you face, both shrinking as the fuel burns down.
- Procedurally generated rock textures with hand-cut chisel marks, ore crystals, edge highlights and a carved back wall behind every open space.
- Parallax cave backdrops per biome — stalactite columns, crystal shards, fungal caps, void shapes — and a starfield with a moon above ground.
- Animated sprites: a walk cycle, a swinging pickaxe with a motion arc, six-legged crawlers, spinning wisps, glowing slugs, translucent wraiths.
- Ambient motes, spore drifts, rising embers, biome tints, screen shake, and a depth gauge showing the strata, your outposts, every set of remains and your deepest dive.

If frames get slow, the game sheds its most expensive effects automatically rather than crawling.

## Controls

| | |
| --- | --- |
| `A` / `D` | Move |
| `W` / `Space` | Jump (also climbs ladders, with `S` to descend) |
| Left click | Mine rock, strike creatures |
| Right click | Use the selected slot — build, or throw |
| `1`–`6` | Platform · Ladder · Torch · Outpost core · Blast charge · Flare |
| `E` | Use the station, an outpost, a supply cache or a pedestal |
| `Q` | Crack an air canister |
| `J` / `H` / `Esc` | Journal · field manual · pause and run stats |

## Running it locally

ES modules need a real HTTP origin, so `file://` will not work:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push. The site is entirely static.

Pages has to be switched on once by hand, because the workflow token is not allowed to create the Pages site: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that, every push deploys, and the game lives at `https://<user>.github.io/2dGame/`.

## Layout

```
index.html        canvas, HUD, depth gauge and the modal panels
styles.css        HUD, panels, title screen
js/util.js        RNG, value noise, colour helpers
js/tiles.js       tile table, ore values, biome definitions
js/world.js       procedural generation, abandoned camps, persisted edits
js/save.js        localStorage schema, and the miners who died before you
js/content.js     relics, contracts, bestiary text, cache loot
js/entities.js    creatures, particles, the AABB tile collision solver
js/render.js      textures, parallax, lightmap, bloom, every sprite
js/game.js        loop, player, mining, building, progression, UI
```

Your save lives under the `depthminer.save.v1` key in `localStorage`. "Collapse the mine" on the title screen wipes it.
