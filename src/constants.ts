/** Shared, immutable identifiers for the module. */

export const MODULE_ID = "foundry-quest-board" as const;
export const MODULE_TITLE = "Maiyalis: Quest Board" as const;

/** Prefix used for all console logging so output is easy to filter. */
export const LOG_PREFIX = `${MODULE_TITLE} |` as const;

/**
 * Socket channel name, kept for symmetry with the sibling modules — but nothing
 * emits on it yet and `module.json` declares `"socket": false`. Everything this
 * module needs to say runs GM → table, which the world-setting sync already
 * delivers (see `services/board-service.ts`). Flip `socket` on in `module.json`
 * before the first `game.socket.emit`, or it will be silently dropped.
 */
export const SOCKET_EVENT = `module.${MODULE_ID}` as const;

/** Setting keys, kept in one place to avoid typos across the codebase. */
export const SETTINGS = {
  /** Every board and its notices (GM-authored, outlives a session). */
  boards: "boards",
  /** The board the GM has pushed to the table, or `null`. See `models/display.ts`. */
  display: "display",
  /** Whether to show the launch button in the Journal sidebar. */
  showJournalButton: "showJournalButton",
  /** Board style a newly created board starts with. */
  defaultBoardStyle: "defaultBoardStyle",
  /** Notice template a newly pinned notice starts with. */
  defaultTemplate: "defaultTemplate",
  /**
   * Whether a player closing a pushed board can reopen it from the sidebar.
   * Off means the GM's push is the only way onto a board.
   */
  playersCanBrowse: "playersCanBrowse",
} as const;

/**
 * Settings-menu keys (buttons that open a window instead of a flat control).
 * Foundry gives a module exactly one flat settings category, so preferences
 * live in our own window — see `apps/config-window.ts`.
 */
export const MENUS = {
  /** Opens the Quest Board settings window. */
  questBoardConfig: "questBoardConfigMenu",
} as const;

/** Foundry template paths (served from the module root at runtime). */
export const TEMPLATES = {
  /** The list of boards: open / show / edit / duplicate / delete. */
  library: `modules/${MODULE_ID}/templates/board-library.hbs`,
  /** One board's editor — its name, look, visibility and notice list. */
  boardEditor: `modules/${MODULE_ID}/templates/board-editor.hbs`,
  /** The per-notice popup opened from a row in the board editor. */
  noticeEditor: `modules/${MODULE_ID}/templates/notice-editor.hbs`,
  /** The board itself: the pinned, scattered, physical-looking surface. */
  board: `modules/${MODULE_ID}/templates/board.hbs`,
  /** The close-up of a single notice, opened by clicking one on the board. */
  noticeDetail: `modules/${MODULE_ID}/templates/notice-detail.hbs`,
  /** Body of the settings window. */
  config: `modules/${MODULE_ID}/templates/board-config.hbs`,
  /** Save/Cancel bar, shared by the settings and editor windows. */
  configFooter: `modules/${MODULE_ID}/templates/config-footer.hbs`,
} as const;
