/**
 * The board itself: the physical-looking surface, with its notices pinned to it
 * at the positions and angles they were left at.
 *
 * One app, both audiences. Players get the board and can pick up any notice to
 * read it; the GM additionally gets Arrange mode, the notices they have not
 * revealed yet, and the controls for pushing the board to the table.
 *
 * **Two presentations, one app**, because what a board is doing differs:
 *
 * - `window` — a framed, resizable Foundry window. What you get opening a board
 *   yourself. A board you are building, or reading on your own while the scene
 *   carries on, should be movable and should not take the table hostage.
 * - `overlay` — frameless, mounted into `#interface` and covering the playable
 *   area, the board floating over the canvas with no window chrome around it.
 *   What the GM's Show Table produces, for everyone. The artwork carries its own
 *   transparency, so the board reads as a thing standing in the scene rather
 *   than a picture inside a box.
 *
 * Mounting into `#interface` rather than pinning to the viewport is what makes
 * "the playable area" mean the right thing: it is already the box Foundry lays
 * the canvas out in, so the sidebar and the scene controls are excluded without
 * this module hard-coding any of their widths, and a UI module that moves them
 * moves this too. Ginzzzu's portraits hang their layer in the same place.
 *
 * Instances are keyed by board id: a GM comparing two towns' boards side by side
 * is a reasonable thing to want, and two `ApplicationV2`s cannot share an id.
 */
import { MODULE_ID, SETTINGS, TEMPLATES } from "../constants.js";
import {
  clampPosition,
  clampRotation,
  emptyNotice,
  type Notice,
  type NoticeTemplate,
} from "../models/board.js";
import { displayed, hide, isGamemaster, show } from "../services/board-service.js";
import { BoardStore } from "../stores/board-store.js";
import { NoticeApp } from "./notice-app.js";
import { NoticeEditorApp } from "./notice-editor-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How far the pointer must travel before a drag stops counting as a click. */
const DRAG_THRESHOLD_PX = 4;
/** Degrees per wheel notch while arranging. */
const ROTATE_STEP_DEG = 2;
/** How long to let a wheel-rotate settle before writing the world setting. */
const ROTATE_SAVE_DELAY_MS = 400;

/** What a drag in progress needs to remember between pointerdown and pointerup. */
interface DragState {
  noticeId: string;
  element: HTMLElement;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  surfaceWidth: number;
  surfaceHeight: number;
  x: number;
  y: number;
  moved: boolean;
}

/** How a board is being shown. See the class note. */
export type Presentation = "window" | "overlay";

/**
 * Where an overlay board hangs, in preference order.
 *
 * `#interface` is Foundry's own box for the canvas and everything laid over it,
 * which is exactly "the playable area". The fallbacks are for a build that has
 * renamed it: the canvas's own parent is the next best answer, and `body` at
 * least puts the board on screen rather than nowhere.
 */
const OVERLAY_HOSTS = ["#interface", "#board", "body"] as const;

export class BoardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Every open board window, keyed by board id. See the class note. */
  private static readonly open_: Map<string, BoardApp> = new Map();

  private readonly boardId: string;
  private readonly presentation: Presentation;
  /** GM-only: whether clicking a notice moves it instead of reading it. */
  private arranging = false;
  private drag: DragState | null = null;
  /** Pending wheel-rotations, flushed together — see `queueRotation`. */
  private rotations: Map<string, number> = new Map();
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;

  static DEFAULT_OPTIONS: AnyObject = {
    tag: "section",
    classes: [MODULE_ID, "fqb-board-window"],
    window: {
      title: "FQB.Board.Title",
      icon: "fa-solid fa-thumbtack",
      resizable: true,
    },
    position: {
      width: 900,
      height: 660,
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.board },
  };

  constructor(boardId: string, presentation: Presentation = "window", options: AnyObject = {}) {
    const overlay = presentation === "overlay";
    super({
      id: `${MODULE_ID}-board-${boardId}`,
      // No frame and no positioning for an overlay: Foundry must not write a
      // left/top/width/height onto an element whose whole job is to fill the
      // box it has been hung in. Same arrangement as the sibling Cinematic
      // Slideshow's stage.
      ...(overlay
        ? {
            classes: [MODULE_ID, "fqb-board-window", "fqb-overlay"],
            window: { frame: false, positioned: false, title: "FQB.Board.Title" },
            position: { width: "auto", height: "auto" },
          }
        : {}),
      ...options,
    });
    this.boardId = boardId;
    this.presentation = presentation;
  }

  /**
   * Open a board on this client, or bring the already-open one forward.
   *
   * A board already open in the *other* presentation is closed and reopened in
   * the asked-for one — which is what happens to the GM's own window the moment
   * they press Show Table, and it should follow the table rather than leave them
   * looking at a different thing from everyone else.
   */
  static open(boardId: string, presentation: Presentation = "window"): BoardApp | null {
    if (!BoardStore.get(boardId)) return null;
    const existing = BoardApp.open_.get(boardId);
    if (existing) {
      if (existing.presentation === presentation) {
        void existing.render(true);
        return existing;
      }
      // Awaited nowhere: `close()` removes it from the registry synchronously
      // enough for the new instance below to claim the slot, and the two never
      // share a frame on screen because the old one is told to go first.
      void existing.close();
    }
    const app = new BoardApp(boardId, presentation);
    BoardApp.open_.set(boardId, app);
    void app.render(true);
    return app;
  }

  /** Close a board window on this client if it is open. */
  static dismiss(boardId: string): void {
    void BoardApp.open_.get(boardId)?.close();
  }

  /**
   * Re-render every open board.
   *
   * Called when the `boards` setting changes, which is the whole reason the
   * pushed board is a reference rather than a snapshot (see `models/display.ts`):
   * a notice the GM reveals mid-scene has to appear on the boards the players
   * already have open. Skipped for a window mid-drag, or the notice under the
   * pointer would be yanked out from under it by the GM's own save.
   */
  static refreshAll(): void {
    for (const app of BoardApp.open_.values()) {
      if (!app.rendered || app.drag) continue;
      void app.render();
    }
  }

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const board = BoardStore.get(this.boardId);
    const gm = isGamemaster();
    if (!board) return { ...context, missing: true, isGM: gm };

    // Players never receive an unrevealed notice's text at all — filtered here
    // rather than hidden in CSS, because "hidden" has to mean it is not in the
    // player's DOM to go looking through.
    const visible = gm ? board.notices : board.notices.filter((notice) => !notice.hidden);

    return {
      ...context,
      missing: false,
      isGM: gm,
      overlay: this.presentation === "overlay",
      arranging: gm && this.arranging,
      name: board.name,
      subtitle: board.subtitle,
      boardClass: `fqb-board--${board.style}`,
      background: board.background,
      pushed: displayed()?.boardId === board.id,
      empty: visible.length === 0,
      emptyMessage: gm ? "FQB.Board.EmptyGM" : "FQB.Board.EmptyPlayer",
      notices: visible.map((notice, index) => ({
        id: notice.id,
        title: notice.title,
        // The board shows the opening of a notice; the close-up shows all of it.
        // Split on blank lines the same way, so a one-paragraph notice reads
        // identically in both places.
        excerpt: excerptOf(notice),
        image: notice.image,
        reward: notice.reward,
        postedBy: notice.postedBy,
        hasLink: notice.link.trim() !== "",
        templateClass: `fqb-notice--${notice.template}`,
        pinClass: `fqb-pin--${notice.pin}`,
        sizeClass: `fqb-size--${notice.size}`,
        hidden: notice.hidden,
        // Inline because they are per-notice data, not style: a stylesheet
        // cannot know where the GM left this one.
        style: `left:${notice.x}%; top:${notice.y}%; --fqb-rotation:${notice.rotation}deg; z-index:${index + 1};`,
      })),
    };
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    if (this.presentation === "overlay") this.mountOverlay(root);

    // Toggled per render rather than baked into the template's class list: the
    // pointer handlers below are bound once and read this to decide what a
    // press means.
    root.classList.toggle("fqb-arranging", context["arranging"] === true);

    if (root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("click", (event: Event) => this.onClick(event, root));
    root.addEventListener("pointerdown", (event: PointerEvent) => this.onPointerDown(event, root));
    root.addEventListener("pointermove", (event: PointerEvent) => this.onPointerMove(event));
    root.addEventListener("pointerup", (event: PointerEvent) => void this.onPointerUp(event));
    root.addEventListener("pointercancel", (event: PointerEvent) => void this.onPointerUp(event));
    root.addEventListener("wheel", (event: WheelEvent) => this.onWheel(event, root), {
      passive: false,
    });
  }

  /**
   * Hang an overlay board in the playable area.
   *
   * ApplicationV2 renders every app into its own UI layer, which spans the whole
   * viewport — sidebar included. Moving the element into `#interface` instead is
   * what makes the overlay cover the canvas and nothing else, and it costs one
   * `appendChild`: Foundry keeps rendering into the element wherever it lives.
   *
   * Re-asserted on every render rather than done once, because a re-render can
   * hand back a fresh element, and one left in the default layer would sit over
   * the sidebar instead of the map.
   */
  private mountOverlay(root: HTMLElement): void {
    for (const selector of OVERLAY_HOSTS) {
      const host = document.querySelector(selector);
      if (!host) continue;
      if (root.parentElement !== host) host.appendChild(root);
      return;
    }
  }

  private onClick(event: Event, root: HTMLElement): void {
    const el = (event.target as HTMLElement | null)?.closest?.("[data-fqb]") as HTMLElement | null;
    if (!el || !root.contains(el)) return;
    const action = el.dataset["fqb"] ?? "";
    const noticeId = el.dataset["noticeId"] ?? "";
    switch (action) {
      case "read":
        // A drag that ended on the notice it started on still fires a click.
        // Swallow it, or every reposition would pop the close-up open.
        if (this.arranging) return;
        NoticeApp.open(this.boardId, noticeId);
        return;
      case "arrange":
        this.arranging = !this.arranging;
        void this.render();
        return;
      case "add-notice":
        this.addNotice();
        return;
      case "edit-notice":
        this.editNotice(noticeId);
        return;
      case "toggle-hidden":
        void this.toggleHidden(noticeId);
        return;
      case "show":
        void this.showToTable();
        return;
      case "hide":
        void hide();
        return;
      case "close":
        void this.close();
        return;
    }
  }

  /* ------------------------------------------------------------ arranging -- */

  /**
   * Start dragging a notice.
   *
   * The surface's measured box is captured here, once, rather than read on every
   * move: the window is resizable, but it is not being resized mid-drag, and
   * measuring per move would force a layout on every pointer event.
   */
  private onPointerDown(event: PointerEvent, root: HTMLElement): void {
    if (!this.arranging || !isGamemaster() || event.button !== 0) return;
    const element = (event.target as HTMLElement | null)?.closest?.(
      ".fqb-notice",
    ) as HTMLElement | null;
    if (!element || !root.contains(element)) return;
    const noticeId = element.dataset["noticeId"] ?? "";
    const notice = BoardStore.get(this.boardId)?.notices.find((item) => item.id === noticeId);
    // The pinnable panel, not the whole surface: on an art board those are
    // different boxes, and a notice's stored position is a percentage of this
    // one (see `templates/board.hbs`). Measuring the surface here would make the
    // notice drift away from the pointer the further it travelled.
    const panel = root.querySelector<HTMLElement>(".fqb-board__pinnable");
    if (!notice || !panel) return;

    const rect = panel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    // Above every other notice for the duration, so it is not dragged underneath
    // the ones it passes over.
    element.style.zIndex = "999";
    this.drag = {
      noticeId,
      element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: notice.x,
      startY: notice.y,
      surfaceWidth: rect.width,
      surfaceHeight: rect.height,
      x: notice.x,
      y: notice.y,
      moved: false,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    drag.x = clampPosition(drag.startX + (dx / drag.surfaceWidth) * 100);
    drag.y = clampPosition(drag.startY + (dy / drag.surfaceHeight) * 100);
    // Written straight to the element: re-rendering per pointer event would be
    // a world-setting write per frame, and the notice would lag the pointer.
    drag.element.style.left = `${drag.x}%`;
    drag.element.style.top = `${drag.y}%`;
  }

  private async onPointerUp(event: PointerEvent): Promise<void> {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    drag.element.releasePointerCapture?.(drag.pointerId);
    drag.element.style.zIndex = "";
    // A press that never moved is someone clicking a notice while arranging; it
    // has nothing to save, and re-rendering over it would be a visible flicker.
    if (!drag.moved) return;
    await BoardStore.updateNotice(this.boardId, drag.noticeId, { x: drag.x, y: drag.y });
  }

  /**
   * Rotate the notice under the pointer while arranging.
   *
   * The wheel is the only input here that repeats faster than a world-setting
   * write can land, so the visible rotation is applied immediately and the save
   * is coalesced — see `queueRotation`.
   */
  private onWheel(event: WheelEvent, root: HTMLElement): void {
    if (!this.arranging || !isGamemaster()) return;
    const element = (event.target as HTMLElement | null)?.closest?.(
      ".fqb-notice",
    ) as HTMLElement | null;
    if (!element || !root.contains(element)) return;
    const noticeId = element.dataset["noticeId"] ?? "";
    const notice = BoardStore.get(this.boardId)?.notices.find((item) => item.id === noticeId);
    if (!notice) return;

    // The board scrolls under a wheel otherwise, which fights the rotation.
    event.preventDefault();
    const pending = this.rotations.get(noticeId) ?? notice.rotation;
    const rotation = clampRotation(pending + Math.sign(event.deltaY) * ROTATE_STEP_DEG);
    element.style.setProperty("--fqb-rotation", `${rotation}deg`);
    this.queueRotation(noticeId, rotation);
  }

  /**
   * Hold a rotation and write it once the wheel stops.
   *
   * Every notch would otherwise be a separate world-setting write, each one
   * broadcast to every client — a dozen renders across the table for one GM
   * nudging a poster straight.
   */
  private queueRotation(noticeId: string, rotation: number): void {
    this.rotations.set(noticeId, rotation);
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      const pending = [...this.rotations.entries()];
      this.rotations.clear();
      void (async () => {
        for (const [id, value] of pending) {
          await BoardStore.updateNotice(this.boardId, id, { rotation: value });
        }
      })();
    }, ROTATE_SAVE_DELAY_MS);
  }

  /* --------------------------------------------------------------- notices -- */

  /**
   * Pin a new notice to this board.
   *
   * The notice is **not** added here — the editor's submit callback appends it,
   * so cancelling out of a new notice leaves nothing behind. It is scattered
   * onto a free-ish spot from the notice count, which is why the count is read
   * before the editor opens rather than after.
   */
  private addNotice(): void {
    const board = BoardStore.get(this.boardId);
    if (!board) return;
    const notice = emptyNotice(board.notices.length, defaultTemplate());
    new NoticeEditorApp(notice, true, board.name, (edited, addAnother) => {
      void this.appendNotice(edited).then(() => {
        if (addAnother) this.addNotice();
      });
    }).render(true);
  }

  private async appendNotice(notice: Notice): Promise<void> {
    // Re-read rather than closing over the board: the editor was open while the
    // GM may have changed something else, and the last write would win.
    const board = BoardStore.get(this.boardId);
    if (!board) return;
    await BoardStore.save({ ...board, notices: [...board.notices, notice] });
  }

  private editNotice(noticeId: string): void {
    const board = BoardStore.get(this.boardId);
    const notice = board?.notices.find((item) => item.id === noticeId);
    if (!board || !notice) return;
    new NoticeEditorApp(notice, false, board.name, (edited) => {
      void BoardStore.updateNotice(this.boardId, noticeId, edited);
    }).render(true);
  }

  /** Reveal an unrevealed notice to the players, or take one back out of sight. */
  private async toggleHidden(noticeId: string): Promise<void> {
    const notice = BoardStore.get(this.boardId)?.notices.find((item) => item.id === noticeId);
    if (!notice) return;
    await BoardStore.updateNotice(this.boardId, noticeId, { hidden: !notice.hidden });
  }

  private async showToTable(): Promise<void> {
    const board = BoardStore.get(this.boardId);
    if (!board) return;
    // Nothing here reopens this window as an overlay: writing the setting fires
    // `updateSetting`, and `syncDisplay` in module.ts does that for every client
    // including this one. One path onto the table, not two.
    await show(board);
  }

  async close(options: AnyObject = {}): Promise<unknown> {
    // A rotation the GM is still mid-nudge on would otherwise be dropped on the
    // floor when the window goes away.
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
      for (const [id, rotation] of this.rotations) {
        await BoardStore.updateNotice(this.boardId, id, { rotation });
      }
      this.rotations.clear();
    }
    // Only if it is still us. Swapping presentation closes the old instance and
    // registers the new one, and a close that had to await a pending rotation
    // would otherwise come back and evict its own replacement.
    if (BoardApp.open_.get(this.boardId) === this) BoardApp.open_.delete(this.boardId);
    const root = this.element as HTMLElement | undefined;
    // The listeners above are re-bound on the next render, and `_onRender` gates
    // on this flag — clear it or a re-opened board is inert.
    if (root) delete root.dataset["fqbBound"];
    return super.close(options);
  }
}

/** The opening of a notice, for the pinned card. The close-up shows all of it. */
function excerptOf(notice: Notice): string {
  const first = notice.text.split(/\n\s*\n/)[0]?.trim() ?? "";
  if (first.length <= 180) return first;
  return `${first.slice(0, 177).trimEnd()}…`;
}

/** What a newly pinned notice is printed on, per the world preference. */
function defaultTemplate(): NoticeTemplate {
  return game.settings.get(MODULE_ID, SETTINGS.defaultTemplate) as NoticeTemplate;
}
