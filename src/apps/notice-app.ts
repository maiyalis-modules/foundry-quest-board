/**
 * The close-up: one notice, taken off the board and read.
 *
 * This is the payoff of the whole module — the board is the browsing gesture,
 * and this is what the player is actually here for. It shows the notice whole
 * (the board only shows its opening), on the same stock, at the same angle it
 * hung at, with its reward, who posted it, and the way through to whatever
 * journal entry or quest it links to.
 *
 * Read-only, for everyone. The GM edits a notice from the board's Arrange mode
 * or the board editor; a window a player has open must not become an editor just
 * because a GM opened the same one.
 */
import { MODULE_ID, TEMPLATES } from "../constants.js";
import type { Notice } from "../models/board.js";
import { isGamemaster } from "../services/board-service.js";
import { openLink, resolveLink } from "../services/link-service.js";
import { BoardStore } from "../stores/board-store.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NoticeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Every open close-up, keyed by `boardId/noticeId`. */
  private static readonly open_: Map<string, NoticeApp> = new Map();

  private readonly boardId: string;
  private readonly noticeId: string;

  static DEFAULT_OPTIONS: AnyObject = {
    tag: "section",
    classes: [MODULE_ID, "fqb-notice-window"],
    window: {
      title: "FQB.Notice.Title",
      icon: "fa-solid fa-scroll",
      resizable: true,
    },
    position: {
      width: 460,
      height: "auto",
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.noticeDetail },
  };

  constructor(boardId: string, noticeId: string, options: AnyObject = {}) {
    super({ id: `${MODULE_ID}-notice-${noticeId}`, ...options });
    this.boardId = boardId;
    this.noticeId = noticeId;
  }

  private static key(boardId: string, noticeId: string): string {
    return `${boardId}/${noticeId}`;
  }

  /** Read a notice, or bring its already-open window forward. */
  static open(boardId: string, noticeId: string): void {
    const key = NoticeApp.key(boardId, noticeId);
    const existing = NoticeApp.open_.get(key);
    if (existing) {
      void existing.render(true);
      return;
    }
    const app = new NoticeApp(boardId, noticeId);
    NoticeApp.open_.set(key, app);
    void app.render(true);
  }

  /**
   * Re-render every open close-up.
   *
   * A GM fixing a typo, or hiding a notice a player is holding, has to reach the
   * window that is open — the same reason the board itself re-renders on a
   * `boards` change (see `apps/board-app.ts`).
   */
  static refreshAll(): void {
    for (const app of NoticeApp.open_.values()) {
      if (app.rendered) void app.render();
    }
  }

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const board = BoardStore.get(this.boardId);
    const notice = board?.notices.find((item) => item.id === this.noticeId) ?? null;

    // Gone, or pulled back out of sight while a player had it open. Both read as
    // "this notice is no longer on the board", which is the honest answer.
    if (!board || !notice || (notice.hidden && !isGamemaster())) {
      return { ...context, missing: true };
    }

    const link = await resolveLink(notice.link);
    return {
      ...context,
      missing: false,
      boardName: board.name,
      title: notice.title,
      // Split rather than passed whole: blank lines are how a GM writes a break
      // in notice text, and a single `{{text}}` would collapse them all. Each
      // paragraph goes through Handlebars' own escaping, so notice text stays
      // text — there is no innerHTML path into this window.
      paragraphs: paragraphsOf(notice),
      image: notice.image,
      reward: notice.reward,
      postedBy: notice.postedBy,
      hasFooter: notice.reward.trim() !== "" || notice.postedBy.trim() !== "",
      templateClass: `fqb-notice--${notice.template}`,
      hidden: notice.hidden,
      isGM: isGamemaster(),
      link,
    };
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root || root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("click", (event: Event) => {
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-fqb]",
      ) as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      switch (el.dataset["fqb"]) {
        case "open-link":
          void openLink(el.dataset["uuid"] ?? "");
          return;
        case "close":
          void this.close();
          return;
      }
    });
  }

  async close(options: AnyObject = {}): Promise<unknown> {
    NoticeApp.open_.delete(NoticeApp.key(this.boardId, this.noticeId));
    const root = this.element as HTMLElement | undefined;
    if (root) delete root.dataset["fqbBound"];
    return super.close(options);
  }
}

function paragraphsOf(notice: Notice): string[] {
  return notice.text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}
