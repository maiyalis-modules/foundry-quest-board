/**
 * Maiyalis: Quest Board — module entry point.
 *
 * Wires the board tools into FoundryVTT's lifecycle hooks. The content model
 * lives in `models/`, persistence in `stores/`, the pushed board in
 * `services/board-service.ts`, journal linking in `services/link-service.ts`,
 * and the windows in `apps/`; this file only bootstraps, keeps every client's
 * open boards in sync with shared state, and exposes a small public API on the
 * module.
 */
import { BoardApp } from "./apps/board-app.js";
import { BoardLibraryApp } from "./apps/board-library-app.js";
import { NoticeApp } from "./apps/notice-app.js";
import { LOG_PREFIX, MODULE_ID, SETTINGS } from "./constants.js";
import type { Board } from "./models/board.js";
import {
  DisplayStore,
  displayed,
  displayedBoard,
  hide,
  isGamemaster,
  show,
} from "./services/board-service.js";
import { registerSettings } from "./settings.js";
import { BoardStore } from "./stores/board-store.js";

/** The shape of the public API exposed at `game.modules.get(MODULE_ID).api`. */
export interface QuestBoardApi {
  /** Open the board list. */
  open(): void;
  /** Open one board on this client only, by id or by exact name. */
  openBoard(idOrName: string): void;
  /** Push a board to every client (GM only), by id or by exact name. */
  show(idOrName: string): Promise<void>;
  /** Take the pushed board down for everyone (GM only). */
  hide(): Promise<void>;
  /** Every board this client may open. */
  boards(): Board[];
  /** The board currently pushed to the table, or `null`. */
  current(): Board | null;
}

let library: BoardLibraryApp;

/**
 * Resolve a board by id first, then by exact name — what every API call takes.
 *
 * `openBoard` searches only what this client may browse, so a macro is not a way
 * around the player-visible flag. `show` searches everything, because it is
 * GM-only and pushing a board the players cannot browse is a legitimate thing to
 * do deliberately. Neither is a security boundary — a world setting is readable
 * by every client — but the flag should at least mean what it says.
 */
function findBoard(idOrName: string, boards: Board[]): Board | null {
  return (
    boards.find((board) => board.id === idOrName) ??
    boards.find((board) => board.name === idOrName) ??
    null
  );
}

/**
 * Open the pushed board on this client, and close it when the GM takes it down.
 *
 * The same sync on every client, off the `display` world setting — a player who
 * joins mid-scene gets the board with the world rather than needing it pushed
 * again. `revision` is what makes a *repeat* push reopen a window the player had
 * closed; see `models/display.ts`.
 */
let lastRevision = -1;
let lastBoardId = "";

function syncDisplay(): void {
  const display = displayed();
  if (!display) {
    if (lastBoardId) BoardApp.dismiss(lastBoardId);
    lastBoardId = "";
    lastRevision = -1;
    return;
  }

  // A board pushed and then deleted resolves to nothing; treat it as taken down
  // rather than leaving an empty frame up.
  if (!displayedBoard()) {
    if (lastBoardId) BoardApp.dismiss(lastBoardId);
    lastBoardId = "";
    return;
  }

  if (display.boardId !== lastBoardId && lastBoardId) BoardApp.dismiss(lastBoardId);
  // Only on a genuinely new push. Without this guard every unrelated write to
  // the setting would re-raise a board the player had deliberately closed.
  if (display.revision !== lastRevision || display.boardId !== lastBoardId) {
    BoardApp.open(display.boardId, "overlay");
  }
  lastBoardId = display.boardId;
  lastRevision = display.revision;
}

function openLibrary(): void {
  void library.render(true);
}

/** Whether this client has any way in at all — a GM always does. */
function canBrowse(): boolean {
  if (isGamemaster()) return true;
  if (game.settings.get(MODULE_ID, SETTINGS.playersCanBrowse) === false) return false;
  return BoardStore.listVisible().length > 0;
}

Hooks.once("init", () => {
  console.log(`${LOG_PREFIX} Initializing.`);
  BoardStore.register();
  DisplayStore.register();
  registerSettings();
  library = new BoardLibraryApp();
});

Hooks.once("ready", () => {
  const api: QuestBoardApi = {
    open: () => openLibrary(),
    openBoard: (idOrName: string) => {
      const board = findBoard(idOrName, BoardStore.listVisible());
      if (!board) {
        ui.notifications?.warn(game.i18n.format("FQB.Notify.NoSuchBoard", { name: idOrName }));
        return;
      }
      BoardApp.open(board.id);
    },
    show: async (idOrName: string) => {
      const board = findBoard(idOrName, BoardStore.list());
      if (!board) {
        ui.notifications?.warn(game.i18n.format("FQB.Notify.NoSuchBoard", { name: idOrName }));
        return;
      }
      await show(board);
    },
    hide: () => hide(),
    boards: () => BoardStore.listVisible(),
    current: () => displayedBoard(),
  };

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;

  // A player joining after the GM put a board up gets it immediately; this is
  // the whole reason the pushed board is a world setting rather than a socket
  // message — there is nothing to replay to a late arrival.
  syncDisplay();

  console.log(`${LOG_PREFIX} Ready. ${BoardStore.list().length} board(s).`);
});

// Keep every client in sync: when the GM writes either setting, Foundry fires
// `updateSetting` on all clients.
Hooks.on("updateSetting", (setting: { key?: string } | undefined) => {
  if (setting?.key === `${MODULE_ID}.${SETTINGS.boards}`) {
    // The library is world state a second GM can change from another client — a
    // board appearing, renaming, or vanishing should land without reopening the
    // window. Open boards and notices refresh too, because a notice revealed
    // mid-scene has to reach the players already standing at the board (see
    // `models/display.ts` for why this module syncs by reference).
    if (library?.rendered) void library.render();
    BoardApp.refreshAll();
    NoticeApp.refreshAll();
    // A board deleted while it was the pushed one leaves the display setting
    // pointing at nothing; re-run the sync so the window closes.
    syncDisplay();
    return;
  }
  if (setting?.key !== `${MODULE_ID}.${SETTINGS.display}`) return;
  syncDisplay();
  if (library?.rendered) void library.render();
});

// The overlay's controls sit below the scene navigation, whose height changes
// when it re-renders, collapses or expands — none of which re-renders the board.
// Re-measure on each, or the controls end up either behind the navigation or
// floating well below where it now ends.
for (const hook of ["renderSceneNavigation", "collapseSceneNavigation", "canvasReady"]) {
  Hooks.on(hook, () => BoardApp.reflowOverlays());
}

// Add the launch button to the Journal sidebar's header controls, unless
// disabled. Shown to players too — a player with a board they may browse should
// be able to walk back up to it without asking the GM to push it again.
Hooks.on("renderJournalDirectory", (_app: unknown, html: HTMLElement | JQuery) => {
  if (game.settings.get(MODULE_ID, SETTINGS.showJournalButton) === false) return;
  if (!canBrowse()) return;

  const root = html instanceof HTMLElement ? html : (html as JQuery)[0];
  if (!root || root.querySelector(`.${MODULE_ID}-launch-row`)) return;

  const row = document.createElement("div");
  row.className = `flexrow ${MODULE_ID}-launch-row`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-launch`;
  button.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${game.i18n.localize("FQB.LaunchButton")}`;
  const tooltip = game.i18n.localize("FQB.LaunchTooltip");
  button.dataset["tooltip"] = tooltip;
  button.setAttribute("aria-label", tooltip);
  button.addEventListener("click", () => openLibrary());

  row.append(button);

  const header = root.querySelector(".directory-header") ?? root;
  header.prepend(row);
});
