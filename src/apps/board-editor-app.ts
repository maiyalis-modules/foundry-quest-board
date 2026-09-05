/**
 * The board editor: what a board is called, what it looks like, who may see it,
 * and what is pinned to it.
 *
 * Edits a **draft copy**, not the stored board. Every add / remove / restack /
 * per-notice edit mutates the draft and re-renders; only Save writes it back
 * through `BoardStore`. That is what makes Cancel mean something, and it keeps a
 * half-built board out of a world setting that every client is watching for
 * changes.
 *
 * The list order *is* the stacking order — a notice further down the list hangs
 * over the ones above it. That is the only thing Move Up / Move Down does; where
 * a notice sits on the board is set by dragging it there in the board's own
 * Arrange mode, which is also why Save re-reads those positions rather than
 * writing the draft's (see `onSave`).
 */
import { MODULE_ID, SETTINGS, TEMPLATES } from "../constants.js";
import {
  BOARD_STYLES,
  emptyNotice,
  type Board,
  type BoardStyle,
  type NoticeTemplate,
} from "../models/board.js";
import { BoardStore } from "../stores/board-store.js";
import { BoardApp } from "./board-app.js";
import { NoticeEditorApp } from "./notice-editor-app.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** `<file-picker>` is a custom form-associated element, not a plain `<input>`. */
interface FilePickerElement extends HTMLElement {
  value: string;
}

export class BoardEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  private draft: Board;
  private readonly onSaved: () => void;

  static DEFAULT_OPTIONS: AnyObject = {
    id: `${MODULE_ID}-board-editor`,
    tag: "form",
    classes: [MODULE_ID, "fqb-config", "standard-form"],
    window: {
      title: "FQB.Editor.Title",
      icon: "fa-solid fa-thumbtack",
      resizable: true,
    },
    position: {
      width: 640,
      height: 680,
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.boardEditor },
    footer: { template: TEMPLATES.configFooter },
  };

  constructor(board: Board, onSaved: () => void, options: AnyObject = {}) {
    super(options);
    // Deep-ish copy: the notice objects are replaced wholesale by the notice
    // editor, so copying the array and each notice is enough to keep the stored
    // board untouched until Save.
    this.draft = { ...board, notices: board.notices.map((notice) => ({ ...notice })) };
    this.onSaved = onSaved;
  }

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const last = this.draft.notices.length - 1;
    return {
      ...context,
      name: this.draft.name,
      subtitle: this.draft.subtitle,
      background: this.draft.background,
      playerVisible: this.draft.playerVisible,
      styles: Object.values(BOARD_STYLES).map((value) => ({
        value,
        label: `FQB.BoardStyle.${value}`,
        selected: value === this.draft.style,
      })),
      notices: this.draft.notices.map((notice, index) => ({
        ...notice,
        number: index + 1,
        // Precomputed rather than compared in the template — no `eq` helper here.
        isFirst: index === 0,
        isLast: index === last,
        templateLabel: `FQB.Template.${notice.template}`,
        summary: notice.title || notice.text.split("\n")[0] || "",
        hasLink: notice.link.trim() !== "",
      })),
      empty: this.draft.notices.length === 0,
    };
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    if (root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("submit", (event: Event) => event.preventDefault());

    root.addEventListener("click", (event: Event) => {
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-fqb]",
      ) as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const action = el.dataset["fqb"] ?? "";
      const id = el.dataset["noticeId"] ?? "";
      switch (action) {
        case "save":
          void this.onSave();
          return;
        case "cancel":
          void this.close();
          return;
        case "add-notice":
          this.addNotice();
          return;
        case "edit-notice":
          this.editNotice(id);
          return;
        case "remove-notice":
          this.removeNotice(id);
          return;
        case "toggle-hidden":
          this.toggleHidden(id);
          return;
        case "move-up":
          this.moveNotice(id, -1);
          return;
        case "move-down":
          this.moveNotice(id, 1);
          return;
      }
    });
  }

  /**
   * Copy the board-level controls into the draft.
   *
   * Called before anything that re-renders, because a re-render rebuilds every
   * control from the draft — a name typed and not captured would vanish the
   * moment the GM pinned a notice.
   */
  private capture(): void {
    const root = this.element as HTMLElement | undefined;
    if (!root) return;
    const value = (selector: string): string =>
      root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";

    this.draft.name = value("input[name='name']");
    this.draft.subtitle = value("input[name='subtitle']");
    this.draft.style = value("select[name='style']") as BoardStyle;
    this.draft.background =
      root.querySelector<FilePickerElement>("file-picker[name='background']")?.value ?? "";
    this.draft.playerVisible =
      root.querySelector<HTMLInputElement>("input[name='playerVisible']")?.checked === true;
  }

  private refresh(): void {
    this.capture();
    void this.render();
  }

  private defaultTemplate(): NoticeTemplate {
    return game.settings.get(MODULE_ID, SETTINGS.defaultTemplate) as NoticeTemplate;
  }

  /**
   * Open a blank notice in its own editor.
   *
   * The notice is **not** put into the draft here — it is appended by the submit
   * callback below, so cancelling out of a new notice leaves no empty row behind.
   */
  private addNotice(): void {
    this.capture();
    new NoticeEditorApp(
      emptyNotice(this.draft.notices.length, this.defaultTemplate()),
      true,
      this.draft.name,
      (edited, addAnother) => {
        this.draft.notices.push(edited);
        void this.render();
        if (addAnother) this.addNotice();
      },
    ).render(true);
  }

  private editNotice(id: string): void {
    this.capture();
    const index = this.draft.notices.findIndex((notice) => notice.id === id);
    const notice = this.draft.notices[index];
    if (!notice) return;
    new NoticeEditorApp(notice, false, this.draft.name, (edited) => {
      this.draft.notices[index] = edited;
      void this.render();
    }).render(true);
  }

  private removeNotice(id: string): void {
    this.draft.notices = this.draft.notices.filter((notice) => notice.id !== id);
    this.refresh();
  }

  private toggleHidden(id: string): void {
    const notice = this.draft.notices.find((item) => item.id === id);
    if (!notice) return;
    notice.hidden = !notice.hidden;
    this.refresh();
  }

  private moveNotice(id: string, delta: number): void {
    const from = this.draft.notices.findIndex((notice) => notice.id === id);
    const to = from + delta;
    const notice = this.draft.notices[from];
    if (!notice || to < 0 || to >= this.draft.notices.length) return;
    this.draft.notices.splice(from, 1);
    this.draft.notices.splice(to, 0, notice);
    this.refresh();
  }

  /**
   * Write the draft back to the library.
   *
   * Placement is taken from the **stored** board, not the draft: the GM may have
   * had the board open in Arrange mode the whole time this window was up, and
   * writing the draft's stale coordinates would silently shove every notice back
   * where it was when the editor opened. Everything else — the words, the stock,
   * the order — is the draft's, because that is what this window edits.
   */
  private async onSave(): Promise<void> {
    this.capture();
    const name = this.draft.name.trim();
    if (!name) {
      ui.notifications?.warn(game.i18n.localize("FQB.Notify.NameRequired"));
      return;
    }

    const stored = BoardStore.get(this.draft.id);
    const placed = this.draft.notices.map((notice) => {
      const current = stored?.notices.find((other) => other.id === notice.id);
      if (!current) return notice;
      return { ...notice, x: current.x, y: current.y };
    });

    await BoardStore.save({ ...this.draft, name, notices: placed });
    this.onSaved();
    await this.close();
    // Straight onto the board it just described. Building a board and then
    // hunting for the button that opens it is the one step worth removing.
    BoardApp.open(this.draft.id);
  }
}

