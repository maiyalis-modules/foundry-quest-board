/**
 * The board list — the way in, for both audiences.
 *
 * One window, two roles. A GM gets every board and everything you do to one:
 * Open, Show to Players, Edit, Duplicate, Delete. A player gets only the boards
 * marked player-visible, and only Open. Keeping that as one app rather than two
 * means a board row looks the same to everyone at the table, which is what makes
 * "the board by the market" a thing the GM can point at out loud.
 *
 * Opens from the Journal-sidebar button (and the module API), not from Configure
 * Settings: this is the tool you reach for every session, and burying it behind
 * the settings page would put it three clicks away from the table.
 */
import { MODULE_ID, SETTINGS, TEMPLATES } from "../constants.js";
import { emptyBoard, type Board, type BoardStyle } from "../models/board.js";
import { displayed, hide, isGamemaster, show } from "../services/board-service.js";
import { BoardStore } from "../stores/board-store.js";
import { BoardApp } from "./board-app.js";
import { BoardEditorApp } from "./board-editor-app.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BoardLibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: AnyObject = {
    id: `${MODULE_ID}-library`,
    tag: "form",
    classes: [MODULE_ID, "fqb-config", "standard-form"],
    window: {
      title: "FQB.Library.Title",
      icon: "fa-solid fa-thumbtack",
      resizable: true,
    },
    position: {
      width: 560,
      height: 520,
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.library },
  };

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const gm = isGamemaster();
    const boards = BoardStore.listVisible();
    const pushed = displayed()?.boardId ?? "";

    return {
      ...context,
      isGM: gm,
      boards: boards.map((board) => ({
        id: board.id,
        name: board.name,
        subtitle: board.subtitle,
        styleClass: `fqb-swatch--${board.style}`,
        background: board.background,
        // Players are told how many notices they can see, not how many exist —
        // a count that jumps when the GM reveals one is a spoiler by itself.
        count: game.i18n.format("FQB.Library.NoticeCount", {
          count: gm ? board.notices.length : board.notices.filter((n) => !n.hidden).length,
        }),
        hiddenCount: gm ? board.notices.filter((notice) => notice.hidden).length : 0,
        // Only meaningful to a GM: a player has no Hide button to pair it with.
        pushed: gm && board.id === pushed,
        playerVisible: board.playerVisible,
      })),
      empty: boards.length === 0,
      // Players get a different empty line: "none yet" is the GM's problem to
      // fix, while a player is simply being told there is nothing to look at.
      emptyMessage: gm ? "FQB.Library.EmptyGM" : "FQB.Library.EmptyPlayer",
      anyPushed: gm && pushed !== "",
    };
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root || root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("submit", (event: Event) => event.preventDefault());

    root.addEventListener("click", (event: Event) => {
      const el = (event.target as HTMLElement | null)?.closest?.("[data-fqb]") as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const action = el.dataset["fqb"] ?? "";
      const id = el.dataset["boardId"] ?? "";
      switch (action) {
        case "new":
          this.createBoard();
          return;
        case "open":
          this.openBoard(id);
          return;
        case "show":
          void this.showBoard(id);
          return;
        case "hide":
          void hide();
          return;
        case "edit":
          this.editBoard(id);
          return;
        case "duplicate":
          void this.duplicateBoard(id);
          return;
        case "delete":
          void this.deleteBoard(id);
          return;
      }
    });
  }

  private defaultStyle(): BoardStyle {
    return game.settings.get(MODULE_ID, SETTINGS.defaultBoardStyle) as BoardStyle;
  }

  private openEditor(board: Board): void {
    new BoardEditorApp(board, () => void this.render()).render(true);
  }

  private createBoard(): void {
    // Not saved yet — an abandoned editor should leave no trace in the library.
    this.openEditor(emptyBoard(game.i18n.localize("FQB.Library.NewName"), this.defaultStyle()));
  }

  /** Open a board on this client only. Nobody else's screen changes. */
  private openBoard(id: string): void {
    const board = BoardStore.get(id);
    if (!board) return;
    BoardApp.open(board.id);
  }

  private editBoard(id: string): void {
    const board = BoardStore.get(id);
    if (!board) return;
    this.openEditor(board);
  }

  private async duplicateBoard(id: string): Promise<void> {
    const board = BoardStore.get(id);
    if (!board) return;
    // New ids all the way down: two boards sharing a notice id would confuse the
    // editor's find-by-id, and a copy is a separate thing from its original.
    await BoardStore.save({
      ...board,
      id: foundry.utils.randomID(),
      name: game.i18n.format("FQB.Library.CopyName", { name: board.name }),
      notices: board.notices.map((notice) => ({ ...notice, id: foundry.utils.randomID() })),
    });
    void this.render();
  }

  private async deleteBoard(id: string): Promise<void> {
    const board = BoardStore.get(id);
    if (!board) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("FQB.Library.DeleteTitle") },
      content: `<p>${game.i18n.format("FQB.Library.DeleteConfirm", { name: board.name })}</p>`,
      modal: true,
    });
    if (!confirmed) return;
    // Take it down first if it is the one on the table, or every client is left
    // holding a window pointed at a board that no longer exists.
    if (displayed()?.boardId === id) await hide();
    await BoardStore.remove(id);
    void this.render();
  }

  private async showBoard(id: string): Promise<void> {
    const board = BoardStore.get(id);
    if (!board) return;
    if (!board.playerVisible) {
      // Pushing a board the players are not allowed to browse is still allowed —
      // the GM is deliberately showing it to them — but say so, because the flag
      // is easy to forget and this is the moment it matters.
      ui.notifications?.info(game.i18n.localize("FQB.Notify.ShowingHiddenBoard"));
    }
    await show(board);
    // The library stays open: showing a board to the table is often followed by
    // showing a different one, and the board opens as its own window anyway.
    void this.render();
  }
}
