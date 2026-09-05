# Maiyalis: Quest Board

Immersive notice boards for Foundry VTT v14. Build as many boards as you have
towns, pin parchment notices, wanted posters, rumours and jobs to them, and open
one in front of the table when the party walks past it.

> There's a weather-beaten notice board beside the market.

System-agnostic — it touches no system data at all.

## Features

- **Many boards, not one quest log.** Sky-Bough Village Notice Board, Goldhorn
  Crossing Job Board, the Adventurers' Guild, the Bent Feather, the Valtiron
  Bounty Office — each with its own notices, opened when the party is standing in
  front of it.
- **Boards that look like the place they are in.** An illustrated *Weathered
  Board* whose notices hang on the planks inside its frame, five drawn-in-CSS
  surfaces (rustic planks, a glazed civic frame, a dark guild wall, a
  smoke-stained tavern, camp canvas), or your own image filling the whole board.
- **Notices on real stock.** Parchment, wanted poster, torn note, printed flyer,
  official posting, napkin scrawl — each with an optional image, a reward and a
  "posted by", held up with a pin, a nail, a strip of tape or a wax seal.
- **Arranged by hand.** Drag notices around the board and scroll the wheel over
  one to tilt it. Nothing hangs straight.
- **Reveal on your schedule.** Pin a notice now and keep it from the players
  until it matters — an unrevealed notice is never sent to their client at all.
- **Show it to the table.** One button opens the board on every player's screen,
  and another takes it down. A player joining mid-scene gets it automatically.
- **Read the whole thing.** Clicking a notice takes it off the board and opens it
  at reading size.
- **Linked to whatever you already use.** A notice can point at a JournalEntry,
  a single journal page, or a quest from another module (Forien's Quest Log and
  friends) — drag it onto the notice and the players get a button through to it.
  This module stays the pinboard; your tracker stays the tracker.

## Usage

The **Quest Boards** button at the top of the Journal sidebar opens the list.
Players see it too, for the boards you have marked player-visible. Preferences
live under *Settings → Configure Settings → Quest Board*.

Building a board:

1. **New Board** — name it, pick a style, optionally give it your own background
   image, and decide whether players may open it themselves.
2. **Pin Notice** — title, text, image, reward, who posted it, and what it's
   printed on. Drop a journal entry onto the **Linked entry** field to connect it.
3. Save, and the board opens. Hit **Arrange** and drag the notices where you want
   them.

At the table, **Show Table** puts the board on every screen; **Take Down** closes
it again.

A small API is exposed for macros:

```js
const api = game.modules.get("foundry-quest-board").api;
api.open();                          // the board list
api.openBoard("The Bent Feather");   // by name or id, this client only
api.show("The Bent Feather");        // push it to the whole table (GM)
api.hide();                          // take it down
api.boards();                        // every board this client may open
api.current();                       // the board on the table, or null
```

## Installation

**From manifest URL**

```
https://github.com/maiyalis-modules/foundry-quest-board/releases/latest/download/module.json
```

**For local development**

Link this repo into your Foundry user data directory so the folder name matches
the module id. A **directory junction** works without elevation on Windows and
keeps the repo in place:

```powershell
New-Item -ItemType Junction `
  -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\foundry-quest-board" `
  -Target "d:\Foundry\foundry-quest-board"
```

## Building

The module is written in **TypeScript** and compiled to `dist/module.js` (what
`module.json` loads). Node.js is not required on the host — the build runs in a
container:

```
docker compose run --rm build   # one-off type-check + build
docker compose up watch         # rebuild dist/module.js on every save
```

The first run installs dependencies into a named Docker volume (`node_modules`
can't be shared with the host because Vite ships platform-specific binaries).

### Hot reload

While a world is running, Foundry live-applies changes with **no page refresh** to:

- `styles/module.css`
- `templates/*.hbs`
- `lang/en.json`

**JavaScript is not hot-swapped.** After `watch` rebuilds `dist/module.js` from a
TypeScript change, **refresh the browser (F5)** to load it.

Almost all of this module's look lives in `styles/module.css` — every notice
template, every pin and most board styles are pure CSS — so most visual work
needs no rebuild at all. `tools/board-preview.html` renders the board against the
real stylesheet in a plain browser, which is the quick way to work on a style
(and to measure where the notices should sit on a new illustrated board).

## Releasing

The tag is the source of truth for the version. Pushing a `v*` tag builds the
module, rewrites `version` / `download` / `manifest` in `module.json` from the
tag, and publishes `module.json` + `module.zip` as a GitHub release:

```
git tag v1.1.1 && git push origin v1.1.1
```

## Layout

```
foundry-quest-board/
  module.json            # manifest (esmodules -> dist/module.js)
  src/                   # TypeScript source (compiled by Vite)
    module.ts            #   entry point (init / ready hooks, sidebar button, API)
    constants.ts         #   ids, settings keys, template paths
    settings.ts          #   game.settings registration
    models/              #   board + notice data shapes, and the pushed board
    stores/              #   every board (a world setting)
    services/            #   showing a board; resolving journal/quest links
    apps/                #   library, editors, settings, the board, the close-up
    types/foundry.d.ts   #   minimal ambient Foundry type shim
  dist/module.js         # build output (git-ignored)
  styles/module.css      # stylesheet — every board style and notice template
  templates/             # Handlebars templates
  assets/boards/         # artwork for the illustrated board styles (WebP)
  lang/en.json           # localization strings
  tools/                 # board-preview.html — a styling harness, not shipped
  docker-compose.yml     # containerized build toolchain
```

## Localization

All user-facing strings live in [lang/en.json](lang/en.json) under the `FQB.`
prefix. Reference them with `game.i18n.localize()` in scripts or `{{localize}}`
in templates.
