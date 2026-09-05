/**
 * Registers the module's settings with Foundry. Must be called during the `init`
 * hook (settings cannot be registered later).
 *
 * The two content settings — the board library and the pushed board — register
 * themselves from the code that owns them (`BoardStore`, `DisplayStore`), beside
 * the code that reads and writes them. What is left here is the preferences, all
 * `config: false` and edited from `QuestBoardConfig` instead of Foundry's flat
 * settings list, the same way the sibling modules organize theirs.
 *
 * No menu opens the library window: the Journal-sidebar button (see module.ts)
 * and `game.modules.get(MODULE_ID).api.open()` already cover that, and a
 * settings entry would be a third, redundant way in.
 */
import { QuestBoardConfig } from "./apps/quest-board-config.js";
import { MENUS, MODULE_ID, SETTINGS } from "./constants.js";
import { BOARD_STYLES, NOTICE_TEMPLATES } from "./models/board.js";

export function registerSettings(): void {
  // Shows/hides the Journal-sidebar launch button (see module.ts).
  game.settings.register(MODULE_ID, SETTINGS.showJournalButton, {
    name: "FQB.Settings.ShowJournalButtonName",
    hint: "FQB.Settings.ShowJournalButtonHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  // Whether a player may open a player-visible board on their own, or only ever
  // sees the one the GM pushes. World-scoped: it is a decision about how the
  // table runs, not a per-client preference.
  game.settings.register(MODULE_ID, SETTINGS.playersCanBrowse, {
    name: "FQB.Settings.PlayersCanBrowseName",
    hint: "FQB.Settings.PlayersCanBrowseHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  // What a newly created board starts as. World-scoped rather than client:
  // it shapes content the whole table will look at, and only GMs author boards.
  game.settings.register(MODULE_ID, SETTINGS.defaultBoardStyle, {
    name: "FQB.Settings.DefaultBoardStyleName",
    hint: "FQB.Settings.DefaultBoardStyleHint",
    scope: "world",
    config: false,
    type: String,
    choices: Object.fromEntries(
      Object.values(BOARD_STYLES).map((style) => [style, `FQB.BoardStyle.${style}`]),
    ),
    default: BOARD_STYLES.rustic,
  });

  // What a newly pinned notice is printed on.
  game.settings.register(MODULE_ID, SETTINGS.defaultTemplate, {
    name: "FQB.Settings.DefaultTemplateName",
    hint: "FQB.Settings.DefaultTemplateHint",
    scope: "world",
    config: false,
    type: String,
    choices: Object.fromEntries(
      Object.values(NOTICE_TEMPLATES).map((template) => [template, `FQB.Template.${template}`]),
    ),
    default: NOTICE_TEMPLATES.parchment,
  });

  // The one button Foundry gives us in Configure Settings. `restricted: true`
  // keeps it GM-only, which matters because every setting above is
  // world-scoped and only a GM can write one.
  game.settings.registerMenu(MODULE_ID, MENUS.questBoardConfig, {
    name: "FQB.Settings.ConfigMenu.Name",
    label: "FQB.Settings.ConfigMenu.Label",
    hint: "FQB.Settings.ConfigMenu.Hint",
    icon: "fa-solid fa-sliders",
    type: QuestBoardConfig,
    restricted: true,
  });
}
