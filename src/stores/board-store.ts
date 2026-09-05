/**
 * Every board and its notices, persisted in a world setting.
 *
 * World-scoped because boards are GM-authored content that outlives an evening
 * and every client has to be able to read one — and because only a GM can write
 * a world setting, which is exactly the permission this content wants. The
 * pushed board is a *separate* setting (see `services/board-service.ts`) so
 * closing a board does not rewrite the library, and editing a notice does not
 * have to re-push anything.
 */
import { MODULE_ID, SETTINGS } from "../constants.js";
import { normalizeBoard, type Board, type Notice } from "../models/board.js";

export const BoardStore = {
  /** Called from `init`; settings cannot be registered later. */
  register(): void {
    game.settings.register(MODULE_ID, SETTINGS.boards, {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  },

  /** Every saved board, most recently edited first. */
  list(): Board[] {
    const raw = game.settings.get(MODULE_ID, SETTINGS.boards);
    const rows = Array.isArray(raw) ? (raw as AnyObject[]) : [];
    return rows.map(normalizeBoard).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** The boards a given client may open. A GM sees all of them. */
  listVisible(): Board[] {
    if (game.user?.isGM === true) return this.list();
    return this.list().filter((board) => board.playerVisible);
  },

  get(id: string): Board | null {
    return this.list().find((board) => board.id === id) ?? null;
  },

  /** Insert or replace by id, stamping `updatedAt`. */
  async save(board: Board): Promise<void> {
    const boards = this.list().filter((other) => other.id !== board.id);
    boards.push({ ...board, updatedAt: Date.now() });
    await game.settings.set(MODULE_ID, SETTINGS.boards, boards);
  },

  async remove(id: string): Promise<void> {
    const boards = this.list().filter((board) => board.id !== id);
    await game.settings.set(MODULE_ID, SETTINGS.boards, boards);
  },

  /**
   * Replace one notice in place, leaving the rest of the board alone.
   *
   * This exists for the two things that edit a notice from *outside* the board
   * editor — dragging it into place, and revealing a hidden one — where writing
   * a whole board back from a stale copy would silently undo whatever else
   * changed since it was read. Re-reading here keeps that window as small as a
   * world setting allows.
   */
  async updateNotice(boardId: string, noticeId: string, patch: Partial<Notice>): Promise<void> {
    const board = this.get(boardId);
    if (!board) return;
    const index = board.notices.findIndex((notice) => notice.id === noticeId);
    const notice = board.notices[index];
    if (!notice) return;
    const notices = [...board.notices];
    notices[index] = { ...notice, ...patch };
    await this.save({ ...board, notices });
  },
} as const;
