/**
 * The module's settings window, opened from the one button Foundry gives us in
 * Configure Settings. Holds preferences only — the boards themselves live in
 * `BoardLibraryApp`, which opens from the Journal sidebar. A tool you reach
 * every session does not belong buried behind a checkbox you set once.
 */
import { MODULE_ID, SETTINGS, TEMPLATES } from "../constants.js";
import { NOTICE_TEMPLATES } from "../models/board.js";
import {
  PROCEDURAL_STYLES,
  THEMES,
  firstStyleOf,
  themeLabel,
  themeOf,
} from "../models/board-styles.js";
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
    // The stored default is a style key; the select is over themes, so compare
    // by theme — whichever variant is stored, its theme is what shows selected.
    const theme = themeOf(String(game.settings.get(MODULE_ID, SETTINGS.defaultBoardStyle)));
    const template = game.settings.get(MODULE_ID, SETTINGS.defaultTemplate);
    return {
      ...context,
      showJournalButton: ConfigWindow.flag(SETTINGS.showJournalButton),
      playersCanBrowse: ConfigWindow.flag(SETTINGS.playersCanBrowse),
      // Precomputed `selected` per option: Handlebars here has no `eq` helper
      // (see AGENTS.md), so a template cannot compare inside the loop. Labels
      // are resolved here rather than in the template because a theme's name
      // may fall back to its slug — see `themeLabel`.
      proceduralStyles: Object.values(PROCEDURAL_STYLES).map((value) => ({
        value,
        label: themeLabel(value),
        selected: value === theme,
      })),
      themes: THEMES.map((entry) => ({
        value: firstStyleOf(entry.key),
        label: themeLabel(entry.key),
        selected: entry.key === theme,
      })),
      templates: Object.values(NOTICE_TEMPLATES).map((value) => ({
        value,
        label: `FQB.Template.${value}`,
        selected: value === template,
      })),
    };
  }
}
