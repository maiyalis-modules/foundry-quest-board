/**
 * The module's settings window, opened from the one button Foundry gives us in
 * Configure Settings. Holds preferences only — the boards themselves live in
 * `BoardLibraryApp`, which opens from the Journal sidebar. A tool you reach
 * every session does not belong buried behind a checkbox you set once.
 */
import { MODULE_ID, SETTINGS, TEMPLATES } from "../constants.js";
import { BOARD_STYLES, NOTICE_TEMPLATES } from "../models/board.js";
import { ConfigWindow } from "./config-window.js";

export class QuestBoardConfig extends ConfigWindow {
  static override DEFAULT_OPTIONS: AnyObject = {
    id: `${MODULE_ID}-config`,
    window: {
      title: "FQB.Config.Title",
      icon: "fa-solid fa-sliders",
    },
  };

  static PARTS = {
    main: { template: TEMPLATES.config },
    footer: { template: TEMPLATES.configFooter },
  };

  protected override settingKeys = [
    SETTINGS.showJournalButton,
    SETTINGS.playersCanBrowse,
    SETTINGS.defaultBoardStyle,
    SETTINGS.defaultTemplate,
  ] as const;

  async _prepareContext(options: AnyObject): Promise<AnyObject> {
    const context = (await super._prepareContext?.(options)) ?? {};
    const style = game.settings.get(MODULE_ID, SETTINGS.defaultBoardStyle);
    const template = game.settings.get(MODULE_ID, SETTINGS.defaultTemplate);
    return {
      ...context,
      showJournalButton: ConfigWindow.flag(SETTINGS.showJournalButton),
      playersCanBrowse: ConfigWindow.flag(SETTINGS.playersCanBrowse),
      // Precomputed `selected` per option: Handlebars here has no `eq` helper
      // (see AGENTS.md), so a template cannot compare inside the loop.
      styles: Object.values(BOARD_STYLES).map((value) => ({
        value,
        label: `FQB.BoardStyle.${value}`,
        selected: value === style,
      })),
      templates: Object.values(NOTICE_TEMPLATES).map((value) => ({
        value,
        label: `FQB.Template.${value}`,
        selected: value === template,
      })),
    };
  }
}
