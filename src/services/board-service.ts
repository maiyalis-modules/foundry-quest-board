/**
 * Pushing a board to the table and taking it down again. Every function here
 * writes the `display` world setting, which is what opens the board on every
 * client — see `models/display.ts` for why the pushed board is state rather
 * than a message, and `module.ts` (`syncBoard`) for the `updateSetting` hook
 * that reacts to it.
 *
 * All of these are GM-only in practice: players cannot write a world setting, so
 * a stray call from a player client fails at Foundry's permission check rather
 * than silently half-working. `isGamemaster()` is what the UI gates on.
 */
import { LOG_PREFIX, MODULE_ID, SETTINGS } from "../constants.js";
import type { Board } from "../models/board.js";
import type { Display } from "../models/display.js";
import { BoardStore } from "../stores/board-store.js";

/** Whether this client may push a board to the table. */
export function isGamemaster(): boolean {
  return game.user?.isGM === true;
}

export const DisplayStore = {
  /** Called from `init`; settings cannot be registered later. */
  register(): void {
    game.settings.register(MODULE_ID, SETTINGS.display, {
      scope: "world",
      config: false,
      type: Object,
      // An empty object rather than null: Foundry's Object-typed settings
      // round-trip that cleanly, and `displayed()` maps it back to null.
      default: {},
    });
  },
} as const;

/** The pushed board's display record, or `null` when nothing is up. */
export function displayed(): Display | null {
  const raw = game.settings.get(MODULE_ID, SETTINGS.display) as AnyObject | null | undefined;
  if (!raw || typeof raw["boardId"] !== "string" || raw["boardId"] === "") return null;
  return raw as unknown as Display;
}

/**
 * The pushed board itself, read fresh from the library, or `null`.
 *
 * Resolved on every call rather than cached: a notice revealed while the table
 * is reading has to reach them, and the board is the live record (see
 * `models/display.ts`). A push whose board was since deleted resolves to null,
 * which closes the window rather than leaving an empty frame up.
 */
export function displayedBoard(): Board | null {
  const display = displayed();
  if (!display) return null;
  return BoardStore.get(display.boardId);
}

async function write(display: Display | null): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.display, display ?? {});
}

/**
 * Put a board in front of the whole table.
 *
 * `revision` is bumped even when the same board is already up, so a player who
 * closed their window gets it back — see `models/display.ts`.
 */
export async function show(board: Board): Promise<void> {
  const previous = displayed();
  console.log(`${LOG_PREFIX} Showing "${board.name}" (${board.notices.length} notice(s)).`);
  await write({ boardId: board.id, revision: (previous?.revision ?? 0) + 1 });
}

/** Take the pushed board down for everyone. */
export async function hide(): Promise<void> {
  if (!displayed()) return;
  await write(null);
}
