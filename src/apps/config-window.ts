/**
 * Shared base for the module's own settings windows.
 *
 * Foundry v14 gives every module exactly one flat category in Configure
 * Settings — `SettingsConfig` extends `CategoryBrowser`, with no notion of a
 * sub-tab. So a group of settings gets its own `ApplicationV2`, opened from a
 * button in that category, and this class holds what those windows have in
 * common: the delegated click dispatch, and saving a set of controls back to
 * `game.settings`. Mirrors the sibling modules' `ConfigWindow`.
 *
 * A subclass supplies `PARTS`, a window title, an id, and {@link settingKeys}.
 */
import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfigWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  // Typed loosely on purpose: Foundry merges DEFAULT_OPTIONS along the
  // inheritance chain, so a subclass supplies only the keys it changes — which
  // an inferred literal type would reject as an incomplete override.
  static DEFAULT_OPTIONS: AnyObject = {
    // A form element so the controls pick up Foundry's settings styling. Nothing
    // is submitted through the form plumbing — see `_onRender`.
    tag: "form",
    // `standard-form` is what supplies `.tab.active { display: flex }` for any
    // tabbed subclass; the base `.tab[data-tab]:not(.active) { display: none }`
    // rule does the hiding. That pair is why no window here needs tab CSS.
    classes: [MODULE_ID, "fqb-config", "standard-form"],
    window: {
      resizable: true,
    },
    position: {
      width: 560,
      height: "auto",
    },
  };

  /**
   * Keys of the settings this window edits. The `name` attribute of each control
   * in the templates is its key, which is how {@link onSave} reads them back
   * without a per-field list. Checkboxes and selects are both understood.
   */
  protected settingKeys: readonly string[] = [];

  /** Read a boolean setting without caring whether it has ever been written. */
  protected static flag(key: string): boolean {
    return game.settings.get(MODULE_ID, key) === true;
  }

  _onRender(context: AnyObject, options: AnyObject): void {
    super._onRender?.(context, options);
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    // One delegated listener bound once — ApplicationV2's built-in `actions`
    // dispatch has proven unreliable in this Foundry build (see AGENTS.md).
    if (root.dataset["fqbBound"]) return;
    root.dataset["fqbBound"] = "1";

    root.addEventListener("submit", (event: Event) => event.preventDefault());

    root.addEventListener("click", (event: Event) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.("[data-fqb]") as HTMLElement | null;
      if (!el || !root.contains(el)) return;
      const action = el.dataset["fqb"] ?? "";
      if (action === "save") void this.onSave();
      else if (action === "cancel") void this.close();
      else this.onAction(action, el);
    });
  }

  /**
   * Handle a `data-fqb` action beyond the built-in save/cancel. Does nothing
   * unless a subclass needs it.
   */
  protected onAction(_action: string, _el: HTMLElement): void {}

  /**
   * Persist {@link settingKeys}. Unchanged settings are skipped, because writing
   * one fires its `onChange` — there is no reason to re-render anything just
   * because someone opened this window and pressed Save.
   */
  private async onSave(): Promise<void> {
    const root = this.element as HTMLElement | undefined;
    if (!root) return;

    for (const key of this.settingKeys) {
      const control = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name='${key}']`);
      if (!control) continue;
      // A checkbox reports through `checked`; everything else (a select, so far)
      // through `value`. Compared against what is stored so an unchanged control
      // is skipped, not rewritten.
      const value =
        control instanceof HTMLInputElement && control.type === "checkbox"
          ? control.checked
          : control.value;
      if (value === game.settings.get(MODULE_ID, key)) continue;
      await game.settings.set(MODULE_ID, key, value);
    }

    ui.notifications?.info(game.i18n.localize("FQB.Config.Saved"));
    await this.close();
  }
}
