# Maiyalis: Quest Board — Agent guide

> This is the canonical instruction file for all coding agents. Update this
> file when shared guidance changes. `CLAUDE.md` imports it for Claude Code;
> Codex reads `AGENTS.md` directly. Do not duplicate shared instructions in
> agent-specific files.

A FoundryVTT **v14** module — package/module id **`foundry-quest-board`**, title
"Maiyalis: Quest Board". Written in TypeScript, compiled to `dist/module.js`
(what `module.json` loads). A GM builds notice boards — a village noticeboard, a
guild wall of bounties, a tavern's scrawled napkins — pins notices to them, and
shows one to the table for the players to browse and read.

**System-agnostic, and genuinely so** — nothing here reads system data, an actor,
or a token. Keep it that way: a system-specific feature belongs in one of the
sibling modules, not here.

**It is a pinboard, not a quest tracker.** A notice stores a UUID and nothing
else, and this module never reads what is on the other end beyond its name (see
"Journal linking" below). Resist every request to grow objectives, completion
state, rewards-on-accept, or a party log. Whatever the user already runs to track
quests keeps tracking them; this is the thing you look at before you pick one.

## Build — read this first

**Node.js is NOT installed on the host, and Python isn't either.** The build runs
in Docker. Do not run `npm` / `node` / `tsc` / `vite` directly on the host — they
won't exist.

```
docker compose run --rm build     # one-off type-check + build (tsc --noEmit && vite build)
docker compose up watch           # rebuild dist/module.js on every save
```

- First run installs deps into a **named Docker volume**
  (`quest-board-node-modules`), not the host — Vite ships platform-specific
  binaries that a Windows `node_modules` can't run in the Linux container.
  `package-lock.json` still persists to the host.
- The host `node_modules/` folder is an empty mount-point artifact; ignore it.
- **Never add a `restart:` policy** to `docker-compose.yml` (keep `restart: "no"`).
  These are manual, developer-invoked containers. Don't change Docker Desktop settings.
- To validate JSON without Node, use PowerShell: `Get-Content -Raw file.json | ConvertFrom-Json`.

### Hot reload

While a world runs, Foundry live-applies (no refresh): `styles/module.css`,
`templates/*.hbs`, `lang/*.json`. **JavaScript is not hot-swapped** — after `watch`
rebuilds `dist/module.js`, **press F5** in the browser.

Nearly all of this module's character lives in `styles/module.css` — every board
style, notice template and pin is a CSS rule — so most visual work needs no
rebuild at all.

## Layout

```
src/
  module.ts            entry point — Hooks.once("init"|"ready"), the Journal
                        sidebar button, syncDisplay(), and the public API at
                        game.modules.get(MODULE_ID).api
  constants.ts          MODULE_ID, MODULE_TITLE, LOG_PREFIX, SOCKET_EVENT,
                        SETTINGS, MENUS, TEMPLATES
  settings.ts           game.settings registration (preferences only — the two
                        content settings register from the code that owns them)
  models/
    board.ts            Board / Notice, plus BOARD_STYLES, NOTICE_TEMPLATES,
                        PINS, SIZES, the scatter placer and the normalizers
                        that make a hand-edited setting safe
    display.ts          the pushed board — see "Showing a board" below
  stores/
    board-store.ts      every board (a world setting): list/get/save/remove,
                        plus updateNotice() for one-field writes
  services/
    board-service.ts    show / hide — each a write to the display world setting
    link-service.ts     the whole Journal/quest integration: resolve, open,
                        and read a UUID off a sidebar drag
  apps/
    config-window.ts    shared base for settings windows (delegated clicks)
    quest-board-config.ts  the settings window (preferences)
    board-library-app.ts   the way in, for GMs and players alike
    board-editor-app.ts    one board: its look, its visibility, its notice list
    notice-editor-app.ts   one notice: words, stock, pin, tilt, link
    board-app.ts           the board surface — browsing, and GM Arrange mode
    notice-app.ts          the close-up: one notice, read
  types/foundry.d.ts     minimal ambient Foundry type shim
dist/module.js          build output (git-ignored)
module.json             manifest — esmodules -> dist/module.js
styles/ templates/ lang/   served from the repo root as-is
```

## Conventions

- **Module id matches the repo folder name** (`foundry-quest-board`). Use it for
  the Foundry junction target and anywhere else the id is required.
- **Settings**: add a key to `SETTINGS` in `constants.ts`, then register it —
  preferences in `settings.ts`, content settings from the code that owns them
  (`BoardStore.register()`, `DisplayStore.register()`), all called during the
  `init` hook (settings cannot be registered later). Settings-menu windows (not
  flat controls) go in `MENUS`.
- **Templates**: add the path to `TEMPLATES` in `constants.ts` and point a part
  at it. `HandlebarsApplicationMixin` fetches and compiles a part template on
  first render, so there is no preload step to register it in. Every part must
  render **exactly one** root element — always, including the "nothing to show"
  branch, and counting conditional blocks that are siblings. A GM-only section
  beside the main one is the trap: it renders fine for players and throws
  "Template part must render a single HTML element" only for the GM, which
  reads like a permissions bug. Wrap the whole body in one unconditional
  element and put `{{#if isGM}}` *inside* it (see `templates/board.hbs`).
- **Types**: there is no full Foundry type package — `src/types/foundry.d.ts` is
  a deliberately minimal shim. When you touch a new Foundry global, **add it to
  the shim** rather than reaching for `any` everywhere.
- **Localization**: every user-facing string lives in `lang/en.json` under the
  `FQB.` prefix — `game.i18n.localize("FQB.…")` in TS, `{{localize "FQB.…"}}` in
  templates. Do not hardcode display strings.
- **A board style, a notice template and a pin are data, not code paths.** All
  three are values in `models/board.ts` that become a CSS class
  (`fqb-board--*`, `fqb-notice--*`, `fqb-pin--*`). Adding one is an entry in the
  const object, a `FQB.BoardStyle.*` / `FQB.Template.*` / `FQB.Pin.*` string, and
  a rule in module.css — never a branch in `BoardApp`.
- **Gradients first; artwork only for whole boards.** Every notice template and
  every pin is layered CSS gradients and clip-paths, and must stay that way — a
  new pin head is not worth a download. The one exception is a **board style
  built on a bundled illustration** (`assets/boards/`), which is a thing you
  genuinely cannot draw in CSS. Ship those as WebP; the source PNGs are
  megabytes and this is a module people install.

## Art boards

An art board is an illustration of a real board — a frame, and a panel inside it
that notices are pinned to. It is still just a `BOARD_STYLES` value and a CSS
rule; `BoardApp` cannot tell one from a gradient. Three boxes make that work,
and `templates/board.hbs` documents them:

```
surface   fills the window body; for an art style it is the wall behind
art       the board; procedural fills the surface, art letterboxes to its ratio
pinnable  the panel inside the frame — notice positions are % of THIS box
```

They collapse to the same rectangle for a procedural style, so there is one
structure rather than two. The art style's own CSS rule supplies the lot as
custom properties: `--fqb-art-ratio` and the four `--fqb-pin-*` insets.
**No JavaScript measures anything.**

How much of the surface the board may take is a separate pair, `--fqb-fill-w` /
`--fqb-fill-h`, defaulting to 100 each. They are **bare numbers, not lengths**,
so both kinds of style can consume them the way each needs: a procedural board
takes them as a percentage of the surface, an art board multiplies them by `cq`
units to letterbox inside the same box. That is what lets the overlay set the
geometry once — 90 / 95, anchored to the bottom — without knowing which kind of
board it has.

- **Adding one is two CSS edits plus the const value and the string** — the
  "art boards" block in module.css spells it out. Getting the insets right is
  the whole job: measure the panel in the file, divide by the file's dimensions,
  then pull each edge in slightly.
- **`tools/board-preview.html` is how you check them** without launching
  Foundry — a static copy of the board markup against the real stylesheet, with
  a headless-screenshot one-liner in its header comment. It renders the wide,
  narrow, procedural and custom-background cases side by side, which is exactly
  the set that catches a bad inset.
- **Notices scale with the board, not with the window.** They are sized in
  `cqw` against `.fqb-board__pinnable` (clamped at both ends), because the board
  is a picture you step closer to — a notice fixed at 185px while the board
  doubled would read as a sticker on a photograph. Padding inside a notice is in
  `em`, **never a percentage**: percentage padding resolves against the
  containing block, so it scaled with the panel and left a small notice as
  almost pure margin.
- **A custom `background` image wins over all of it.** `fqb-board--custom` on
  the surface resets the ratio and the insets, so a GM's own art fills the
  surface edge to edge and the whole thing is pinnable again. It must stay last
  among those rules — same specificity, source order decides.
- **Positions survive a style change.** They are percentages of the pinnable
  box, so switching a board from gradient to art keeps the arrangement and just
  confines it to the panel. There is no migration to write.

## Showing a board

- **The pushed board is state, not a message.** `Display` lives in the `display`
  **world setting**, and every client reacts off the `updateSetting` hook
  (`syncDisplay()` in `module.ts`). A world setting reaches everyone, survives a
  reload, and catches up a player who joins after the board went up — none of
  which a socket emit does. This is why `module.json` declares `"socket": false`
  and nothing emits. If that ever changes, turn `socket` on in the manifest
  *before* the first emit, or it will be silently dropped.
- **It stores a reference, not a snapshot** — the opposite of the sibling
  Cinematic Slideshow, and deliberately so. A slideshow on screen is a
  performance that must not be reshuffled mid-show; a board is a *place the party
  is standing in front of*, and a notice the GM reveals while they are reading
  has to appear. So `BoardApp` re-reads the board from the store on every render,
  and `module.ts` re-renders every open board on a `boards` change as well as a
  `display` change.
- **`revision` is what makes a repeat push work.** Showing the same board twice
  would otherwise write an identical value, fire no `updateSetting`, and reopen
  nothing for the player who had closed it — which reads at the table as a broken
  button. `syncDisplay` tracks the last revision it acted on so unrelated writes
  don't re-raise a board someone deliberately closed.
- **Two presentations, one app.** `BoardApp` takes a `Presentation`:
  - `window` — a framed, resizable Foundry window. What opening a board yourself
    gives you. A board you are building, or reading on your own while the scene
    carries on, should be movable and should not take the table hostage.
  - `overlay` — frameless, covering the playable area, the board floating over
    the live canvas. What Show Table produces, for everyone including the GM.

  `open()` closes and reopens a board that is already up in the *other*
  presentation, which is how the GM's own window follows the table the moment
  they press Show Table. Instances are keyed by board id in a static map, so two
  towns' boards can be open at once — and `close()` only evicts itself from that
  map (`get(id) === this`), or a presentation swap whose close had to await a
  pending rotation would evict its own replacement.
- **The overlay is mounted into `#interface`, not pinned to the viewport.** That
  element is already the box Foundry lays the canvas out in, so `inset: 0` means
  "the playable area" with no hard-coded sidebar or control-bar widths, and a UI
  module that moves them moves the board too. `mountOverlay()` re-asserts the
  parent on every render, because a re-render can hand back a fresh element and
  one left in the default UI layer sits over the sidebar. Ginzzzu's portraits
  hang their layer in the same place; `z-index: 1` matches them, deliberately low
  so Foundry's navigation, controls and token HUD stay above the board.
- **The overlay board stands on the bottom edge**, 90% of the playable area's
  width and at most 95% of its height, aspect preserved. All the leftover height
  goes above it, which is where the controls and the Arrange hint live. Which of
  the two limits binds depends on the client's proportions — a squarer window is
  width-limited, a wide one height-limited — so do not assume there is any free
  band at the top: on a 2560-wide client with the sidebar collapsed the board is
  nearly full height and the controls sit over its roof.
- **The overlay's chrome is a stack in the top left**, controls above the board's
  name. Top left because the top right is where a game system tends to float its
  own bar — Daggerheart's rest buttons, in the case this was built against — and
  that is the one collision this module can avoid unilaterally. `order: -1` on
  `.fqb-board__controls` puts them above the name without a second markup path;
  a window keeps the ordinary "name first, buttons on the end" header. The
  controls and the close button share the `.fqb-board__controls` wrapper so the
  overlay moves them as one cluster.
- **The overlay's controls are positioned off measured Foundry UI, never
  constants.** `clearTopUi()` measures `#scene-navigation` and `#ui-left` (with
  older ids as fallbacks) and writes `--fqb-overlay-top` / `--fqb-overlay-left`.
  It has to: the overlay sits *under* Foundry's chrome by design, so anything at
  the top covers the control bar rather than the reverse, and `#interface` spans
  the full width *behind* the scene tools, so the title plaque starts underneath
  them. Both are compared as viewport rectangles, so it does not matter where in
  the DOM those elements live, and both are capped at a fraction of the area —
  controls overlapping the navigation is a far better failure than controls
  pushed off the screen. Scene navigation collapses and re-renders without
  re-rendering this app, which is why `module.ts` re-measures on
  `renderSceneNavigation`, `collapseSceneNavigation` and `canvasReady`.
- **Only the pinnable panel takes clicks in the overlay.** `.fqb-overlay` is
  `pointer-events: none` and the panel re-enables it. The frame, the transparent
  surround and the scrim all let clicks through to the map — otherwise the GM
  could not touch the canvas without taking the board down. Notices live inside
  the panel, so every one of them stays clickable.
- **A texture belongs on `.fqb-board__art`, never on the surface.** The surface
  is the wall the board hangs on; the overlay drops it so the canvas shows
  through, and anything painted there would be dropped with it.
- **Hidden means not rendered, not encrypted.** A notice with `hidden: true` is
  filtered out of a player's context in `BoardApp._prepareContext`, so it never
  reaches their DOM — do not "hide" a notice in CSS, a player can read their own
  DOM. But the `boards` world setting is sent to every client, so a determined
  player can read an unrevealed notice out of `game.settings`. That is true of
  every sibling module's world state too. Treat unrevealed as "not part of the
  board yet", not as a secret.

## Editing model

- **The board editor edits a draft copy.** `BoardEditorApp` clones the board in
  its constructor and mutates that; only Save writes through `BoardStore`. That
  is what makes Cancel mean something, and it keeps a half-built board out of a
  world setting every client is watching.
- **…except placement, which the draft never owns.** Save re-reads `x`/`y` from
  the stored board, because the GM may have been dragging notices around in
  Arrange mode the whole time the editor was open, and writing the draft's stale
  coordinates would silently shove every notice back. Tilt *is* the draft's, since
  the notice editor has a slider for it.
- **Position is set by dragging, not by typing.** There is no x/y control in the
  notice editor on purpose: two number boxes for a thing you arrange by eye is
  the worse half of the same feature.
- **The notice editor hands its result back through a callback**, not through
  `game.settings` — which is why it is a plain `ApplicationV2` rather than a
  `ConfigWindow` subclass. The `ConfigWindow` Save is specifically "write these
  named controls to these setting keys".
- **`updateNotice` exists for writes from outside the editor** — a drag, a
  reveal. It re-reads the board first, so a one-field write can't clobber
  whatever else changed while the window was open.

## Journal linking

- A notice's `link` is **a UUID string and nothing more**. `link-service.ts` is
  the only file that touches it: `resolveLink` for a name, `openLink` to open it,
  `uuidFromDrop` to read one off a sidebar drag.
- That is what makes a **JournalEntry, a journal page, and another module's quest
  document all work identically** without this module knowing about any of them.
  A journal *page* is the one special case — it has no useful sheet of its own,
  so it opens its parent entry scrolled to that page.
- **Every path tolerates a dangling UUID.** A GM deletes a journal entry
  eventually; a notice pointing at nothing reads as a notice with no link, and
  only the GM is told it is broken.

## Foundry gotchas

- **ApplicationV2 UI**: the built-in `actions` click dispatch has proven
  unreliable in this Foundry build. Prefer one delegated click listener attached
  in `_onRender` that reads a `data-fqb` attribute via `closest()`. Guard the
  binding with a `data-fqb-bound` flag on the root so re-renders do not stack
  listeners — and **clear that flag when the app closes** if the app can be
  re-shown (see `BoardApp.close`), or the next render leaves it inert.
- **Handlebars**: no `{{else if}}` and no `eq` helper here — precompute booleans
  in `_prepareContext` (that is why every select context carries a `selected`
  flag per option) and use nested `{{#if}}`/`{{else}}`.
- **Module settings get exactly one flat category.** `SettingsConfig` extends
  `CategoryBrowser` and maps a namespace to a single category — there is no
  native sub-tab. Preferences therefore live in our own `ApplicationV2`
  (`apps/config-window.ts` is the shared base) and register `config: false`, or
  they would show up in both places.
- **World state**: only GMs can write world-scoped settings; all clients can
  read. That is the whole permission model here — `isGamemaster()` gates the UI,
  and Foundry's own check is the backstop. It is also why a player's board window
  is read-only in every branch.
- **Don't re-render mid-drag.** `BoardApp.refreshAll()` skips a window with a
  drag in progress, and the drag writes to the element's own style rather than
  through a render — a world-setting write per pointer event would both lag the
  pointer and flood every other client. Wheel-rotation is coalesced for the same
  reason (`queueRotation`), and flushed on close so a half-finished nudge isn't
  dropped.
- **Hand-edited JSON** (`lang/`): save **UTF-8 without a BOM**. The Foundry
  loader chokes on a BOM, and `Set-Content -Encoding utf8` in PowerShell adds
  one — use
  `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`.
- **Line endings**: this repo is **LF end to end**, in the index and in the
  working tree, pinned by `.gitattributes` (`* text=auto eol=lf`). Keep it that
  way and write new files LF. `core.autocrlf` is true on this machine, which is
  how the sibling Utility Suite repo became a per-file mix of CRLF and LF —
  there, git normalizes on commit so `git diff` looks clean while the working
  tree is the damaged copy. The `.gitattributes` here is what stops that.
  Detect with
  `l=$(wc -l < f); c=$(tr -cd '\r' < f | wc -c)` — a count of 0 is LF.
  **Never use `cat -A` for this**: the Git Bash build here strips CR before
  printing and reports every file as LF.

## Dev environment

- A directory **junction** links this repo into Foundry:
  `%LOCALAPPDATA%\FoundryVTT\Data\modules\foundry-quest-board` -> the repo root.
  Foundry serves the built `dist/module.js` and the root assets directly.
- **Version numbers are not semver.** They are
  `<campaign>.<session>.<iteration>` — the campaign the module shipped for, the
  session within it, and the iteration within that session counting from zero.
  `v1.1.0` is "campaign 1, session 1, first cut". Every Maiyalis module shares
  this scheme, which is why this one starts at 1.1.0 rather than at 0.x. Do not
  reason about a bump as major/minor/patch, and do not infer a breaking change
  from a leading-digit change.
- **Releases are tag-driven.** `git tag v1.1.1 && git push origin v1.1.1` runs
  `.github/workflows/release.yml`, which builds, rewrites version / download /
  manifest in `module.json` from the tag, and publishes `module.json` +
  `module.zip`. The tag is the source of truth — do not hand-edit `version` in
  `module.json` or `package.json` expecting it to matter to a release.
- Sibling modules **Maiyalis: Target Helper** (`../daggerheart-target-helper`),
  **Maiyalis: Spotlight Helper** (`../daggerheart-spotlight-tracker`),
  **Maiyalis: Utility Suite** (`../foundry-utility-suite`), **Maiyalis:
  Narrative Tools** (`../foundry-narrative-tools`), and **Maiyalis: Cinematic
  Slideshow** (`../foundry-cinematic-slideshow`) use the same Docker toolchain
  and are good references for patterns — ApplicationV2 windows, delegated-click
  dispatch, and GM-authoritative world-setting sync are all worked out there.
  Cinematic Slideshow is the closest relative: this module's library, editor and
  config windows are the same shapes, and the differences (reference instead of
  snapshot, window instead of overlay) are the ones documented above.
