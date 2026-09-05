/**
 * The per-notice editor: one popup for one notice's words, look and link.
 * Opened from a row in `BoardEditorApp` or from the board's own Arrange mode —
 * keeping a notice's fields in their own dialog is what lets both of those stay
 * compact.
 *
 * Not a `ConfigWindow` subclass: that base's Save writes to `game.settings`,
 * which does not fit an editor whose result belongs to its caller. This hands
 * the edited notice back through a plain constructor callback instead, the same
 * way the sibling module's slide editor does.
 *
 * Position is deliberately **not** a field here. A notice is placed by dragging
 * it on the board, where you can see what it lands next to; two number boxes for
 * a thing you arrange by eye would be the worse half of the same feature. Tilt
 * *is* here, because a slider next to the notice's own preview is as good as the
 * wheel gesture and easier to find.
 */
import { MODULE_ID, TEMPLATES } from "../constants.js";
import {
  NOTICE_TEMPLATES,
  PINS,
  ROTATION_BOUNDS,
  SIZES,
  clampRotation,
  type Notice,
  type NoticeTemplate,
  type Pin,
  type Size,
} from "../models/board.js";
import { openLink, resolveLink, uuidFromDrop } from "../services/link-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** `<file-picker>` is a custom form-associated element, not a plain `<input>`. */
interface FilePickerElement extends HTMLElement {
  value: string;
}

/**
 * What the caller is handed back.
 *
 * `addAnother` is Save & Add: the notice is finished, and the GM wants a blank
 * one straight after it. Deciding what "another notice" means belongs to the
 * caller, which owns the board — this window only reports which button was
 * pressed.
 */
export type NoticeSubmit = (notice: Notice, addAnother: boolean) => void;

export class NoticeEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  private readonly notice: Notice;
  private readonly isNew: boolean;
  private readonly boardName: string;
  private readonly onSubmit: NoticeSubmit;
  /** Held here rather than read off a control: the link field is a drop target. */
  private link: string;

  // No `id` here: it is set per instance in the constructor. Save & Add closes
  // this window and opens the next one immediately, and two ApplicationV2s
  // sharing an id while one is still tearing down is a race worth not having.
  static DEFAULT_OPTIONS: AnyObject = {
    tag: "form",
    classes: [MODULE_ID, "fqb-config", "standard-form"],
    window: {
      title: "FQB.NoticeEditor.Title",
      icon: "fa-solid fa-scroll",
      resizable: true,
    },
    position: {
      width: 540,
      height: "auto",
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.noticeEditor },
    footer: { template: TEMPLATES.configFooter },
  };

  /**
   * `isNew` drives Save & Add — it is only offered while adding, because "save
   * this and start another" is meaningless when you opened an existing notice to
   * fix a typo in it.
   */
  constructor(
    notice: Notice,
    isNew: boolean,
    boardName: string,
    onSubmit: NoticeSubmit,
    options: AnyObject = {},
  ) {
    super({ id: `${MODULE_ID}-notice-editor-${notice.id}`, ...options });
    this.notice = notice;
    this.isNew = isNew;
    this.boardName = boardName;
    this.onSubmit = onSubmit;
    this.link = notice.link;
  }

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const link = await resolveLink(this.link);
    return {
      ...context,
      ...this.notice,
      // The live value, which a drop may have changed since construction.
      link: this.link,
      resolvedLink: link,
      boardName: this.boardName,
      rotationMin: ROTATION_BOUNDS.min,
      rotationMax: ROTATION_BOUNDS.max,
      // Read by the shared config footer, which renders Save & Add only when a
      // window asks for it. The context prepared here reaches every part.
      canSaveAndAdd: this.isNew,
      // `selected` precomputed per option — Handlebars here has no `eq` helper.
      templates: Object.values(NOTICE_TEMPLATES).map((value) => ({
        value,
        label: `FQB.Template.${value}`,
        selected: value === this.notice.template,
      })),
      pins: Object.values(PINS).map((value) => ({
        value,
        label: `FQB.Pin.${value}`,
        selected: value === this.notice.pin,
      })),
      sizes: Object.values(SIZES).map((value) => ({
        value,
        label: `FQB.Size.${value}`,
        selected: value === this.notice.size,
      })),
    };
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    // The rotation readout is the one control worth updating as it is dragged;
    // re-rendering the window per slider step would be absurd. Rebound each
    // render because the input is a new element every time.
    const slider = root.querySelector<HTMLInputElement>("input[name='rotation']");
    const readout = root.querySelector<HTMLElement>(".fqb-rotation-value");
    if (slider && readout && !slider.dataset["fqbBound"]) {
      slider.dataset["fqbBound"] = "1";
      slider.addEventListener("input", () => {
        readout.textContent = `${slider.value}°`;
      });
    }

    if (root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("submit", (event: Event) => event.preventDefault());

    // Dropping a journal entry (or any document) from a sidebar onto the link
    // field is the fast path — typing a UUID by hand is the fallback, not the
    // intended gesture.
    root.addEventListener("dragover", (event: DragEvent) => {
      if (!(event.target as HTMLElement | null)?.closest?.(".fqb-link-drop")) return;
      event.preventDefault();
    });
    root.addEventListener("drop", (event: DragEvent) => {
      if (!(event.target as HTMLElement | null)?.closest?.(".fqb-link-drop")) return;
      event.preventDefault();
      const uuid = uuidFromDrop(event);
      // A drag carrying something with no UUID is simply not a link; ignoring it
      // beats storing a string `fromUuid` will never resolve.
      if (!uuid) return;
      this.setLink(uuid);
    });

    root.addEventListener("click", (event: Event) => {
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-fqb]",
      ) as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      switch (el.dataset["fqb"]) {
        case "save":
          void this.onSave(false);
          return;
        case "save-and-add":
          void this.onSave(true);
          return;
        case "cancel":
          void this.close();
          return;
        case "clear-link":
          this.setLink("");
          return;
        case "open-link":
          void openLink(this.link);
          return;
      }
    });
  }

  /**
   * Set the link and re-render so the resolved name appears.
   *
   * The rest of the form is read back into the draft first: a re-render rebuilds
   * every control from `this.notice`, so anything typed and not captured would
   * be thrown away by dropping a journal entry onto the window.
   */
  private setLink(uuid: string): void {
    this.capture();
    this.link = uuid;
    void this.render();
  }

  /** Copy what is in the controls back into the draft notice. */
  private capture(): void {
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    const value = (selector: string): string =>
      root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)
        ?.value ?? "";

    this.notice.title = value("input[name='title']");
    this.notice.text = value("textarea[name='text']");
    this.notice.image = root.querySelector<FilePickerElement>("file-picker[name='image']")?.value ?? "";
    this.notice.reward = value("input[name='reward']");
    this.notice.postedBy = value("input[name='postedBy']");
    this.notice.template = value("select[name='template']") as NoticeTemplate;
    this.notice.pin = value("select[name='pin']") as Pin;
    this.notice.size = value("select[name='size']") as Size;
    this.notice.rotation = clampRotation(Number(value("input[name='rotation']")));
    this.notice.hidden =
      root.querySelector<HTMLInputElement>("input[name='hidden']")?.checked === true;
  }

  /**
   * Read the controls back and hand the notice to the caller.
   *
   * The window closes either way, including on Save & Add: the caller responds
   * by opening a fresh editor, so a GM pinning six notices in a row gets six
   * windows in sequence rather than one that quietly changes what it is pointing
   * at.
   */
  private async onSave(addAnother: boolean): Promise<void> {
    if (!this.element) return;
    this.capture();
    const edited: Notice = { ...this.notice, link: this.link.trim() };

    // Close first: the callback may open the next editor, and this one should be
    // gone by then rather than fighting it for the same screen position.
    await this.close();
    this.onSubmit(edited, addAnother);
  }
}
