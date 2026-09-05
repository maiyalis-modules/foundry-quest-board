/**
 * The pushed board: what the GM has put in front of the table right now.
 *
 * **This is state, not a message.** It lives in a world setting rather than
 * travelling over the socket because opening a board is something the whole
 * table does together: a world setting reaches everyone, survives a reload, and
 * catches up a player who joins after the board went up — none of which a
 * targeted emit does. The sibling Cinematic Slideshow module keeps its live show
 * the same way.
 *
 * Unlike that module, this one stores a **reference** (`boardId`) rather than a
 * snapshot of the content. A slideshow on screen is a performance the table is
 * already watching and must not be reshuffled mid-show; a notice board is a
 * place the table is standing in front of, and a notice the GM reveals while
 * they are reading should appear on it. So `apps/board-app.ts` re-reads the
 * board from the store on every render, and reacts to the `boards` setting
 * changing as well as this one.
 */

export interface Display {
  /** The board every client should have open. */
  boardId: string;
  /**
   * Bumped every time the GM pushes a board, including the same board twice.
   *
   * Without it, "show this board again" after a player closed their window
   * would write an identical value, Foundry would fire no `updateSetting`, and
   * nothing would reopen — which reads at the table as the button being broken.
   */
  revision: number;
}
