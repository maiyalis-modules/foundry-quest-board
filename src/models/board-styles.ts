/**
 * What a board can look like: the procedural styles drawn in CSS, and the
 * illustrated boards shipped as artwork.
 *
 * A board stores one string, `style`. For a procedural style that is its key
 * (`"rustic"`); for an illustrated board it is the file's stem
 * (`"aetherpunk-2"`), which is `<theme>-<variant>`. The editor presents that as
 * two choices — a theme, then a variant — but the model never needs to know:
 * one string, resolved here into whichever kind it names.
 *
 * The illustrated catalog is **generated, not written**. `tools/build-catalog.mjs`
 * scans `assets/boards/` on every build and emits `generated/board-catalog.json`;
 * adding a board is dropping a file in that folder. Nothing in `src/` lists
 * them, and nothing in `styles/` does either — an illustrated board's geometry
 * is applied inline from its catalog entry (see `apps/board-app.ts`), so there
 * is no per-board CSS rule to forget.
 */
import catalog from "../generated/board-catalog.json";

/** The surfaces drawn in CSS. Each is a `fqb-board--*` rule in module.css. */
export const PROCEDURAL_STYLES = {
  /** Rough planks, rope and twine — a village noticeboard by the market. */
  rustic: "rustic",
  /** Framed, glazed and tidy: a municipal board with official postings. */
  civic: "civic",
  /** Dark timber and iron, hung with bounties and contracts. */
  guild: "guild",
  /** A smoke-stained tavern wall of napkins and scrawled advertisements. */
  tavern: "tavern",
  /** Canvas and lashed poles — a caravan or camp board. */
  camp: "camp",
  /** No texture at all, for a board that is entirely its own background image. */
  plain: "plain",
} as const;

export type ProceduralStyle = (typeof PROCEDURAL_STYLES)[keyof typeof PROCEDURAL_STYLES];

/** How far the pinnable panel sits in from each edge of the artwork, in percent. */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One illustrated board, as `tools/build-catalog.mjs` describes it. */
export interface ArtBoard {
  /** `<theme>-<variant>`; what `Board.style` stores. */
  key: string;
  theme: string;
  variant: number;
  /** File name within `assets/boards/`. */
  file: string;
  width: number;
  height: number;
  inset: Inset;
}

/** A theme and its variants, in variant order. */
export interface Theme {
  key: string;
  boards: ArtBoard[];
}

export const ART_BOARDS: readonly ArtBoard[] = catalog.boards;

/** Every illustrated theme, alphabetical, each with its variants in order. */
export const THEMES: readonly Theme[] = (() => {
  const byTheme = new Map<string, ArtBoard[]>();
  for (const board of ART_BOARDS) {
    const list = byTheme.get(board.theme) ?? [];
    list.push(board);
    byTheme.set(board.theme, list);
  }
  return [...byTheme.entries()].map(([key, boards]) => ({ key, boards }));
})();

const ART_BY_KEY: ReadonlyMap<string, ArtBoard> = new Map(
  ART_BOARDS.map((board) => [board.key, board]),
);

const THEME_BY_KEY: ReadonlyMap<string, Theme> = new Map(THEMES.map((theme) => [theme.key, theme]));

/**
 * Keys a board may have been saved with that no longer exist.
 *
 * `weathered1` was the first illustrated board, hard-coded before the catalog
 * existed. Its file is now `weathered-board-1.webp` like every other.
 */
const ALIASES: Readonly<Record<string, string>> = {
  weathered1: "weathered-board-1",
};

/** What a new board starts as: the original weathered board if it is still shipped. */
export const DEFAULT_STYLE: string =
  ART_BY_KEY.has("weathered-board-1")
    ? "weathered-board-1"
    : (ART_BOARDS[0]?.key ?? PROCEDURAL_STYLES.rustic);

export type ResolvedStyle =
  | { kind: "procedural"; style: ProceduralStyle }
  | { kind: "art"; board: ArtBoard };

export function isProceduralStyle(key: string): key is ProceduralStyle {
  return (Object.values(PROCEDURAL_STYLES) as string[]).includes(key);
}

/** The board behind a style key, or `null` for a key nothing answers to. */
export function resolveStyle(key: string): ResolvedStyle | null {
  if (isProceduralStyle(key)) return { kind: "procedural", style: key };
  const board = ART_BY_KEY.get(key);
  return board ? { kind: "art", board } : null;
}

/**
 * Coerce whatever a board was saved with into a style that exists.
 *
 * A renamed file, a hand-edited setting, a board from before the catalog — all
 * come through here. The fallback is the default rather than the first
 * procedural style, because "my board came back looking like plain planks" is
 * a worse surprise than "my board came back as the default board".
 */
export function normalizeStyle(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_STYLE;
  if (resolveStyle(raw)) return raw;
  const alias = ALIASES[raw];
  return alias && resolveStyle(alias) ? alias : DEFAULT_STYLE;
}

/** The theme key a style belongs to: the procedural key itself, or the art board's theme. */
export function themeOf(key: string): string {
  const resolved = resolveStyle(key);
  if (!resolved) return themeOf(DEFAULT_STYLE);
  return resolved.kind === "art" ? resolved.board.theme : resolved.style;
}

/** The variants of a theme, or an empty list for a procedural style. */
export function variantsOf(themeKey: string): readonly ArtBoard[] {
  return THEME_BY_KEY.get(themeKey)?.boards ?? [];
}

/**
 * The style key a theme choice lands on: the procedural key, or the theme's
 * first variant. What the editor stores the moment a theme is picked, before a
 * variant has been.
 */
export function firstStyleOf(themeKey: string): string {
  if (isProceduralStyle(themeKey)) return themeKey;
  return variantsOf(themeKey)[0]?.key ?? DEFAULT_STYLE;
}

/**
 * The localization key for a theme's name.
 *
 * Every shipped theme has a string under `FQB.Theme.*`. A theme added to the
 * folder before anyone adds its string still needs a name, so `themeLabel`
 * falls back to the slug in title case rather than showing the raw key.
 */
export function themeLabelKey(themeKey: string): string {
  return isProceduralStyle(themeKey) ? `FQB.BoardStyle.${themeKey}` : `FQB.Theme.${themeKey}`;
}

export function themeLabel(themeKey: string): string {
  const key = themeLabelKey(themeKey);
  if (game.i18n.has(key)) return game.i18n.localize(key);
  return themeKey
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** URL of an illustrated board's artwork, as the browser fetches it. */
export function artUrl(board: ArtBoard, moduleId: string): string {
  return `modules/${moduleId}/assets/boards/${board.file}`;
}

/**
 * The inline style that places an illustrated board's artwork and panel.
 *
 * These are the same custom properties a procedural style would get from a CSS
 * rule; an illustrated board just carries its own numbers. Emitted as one
 * string for the template's `style` attribute — every value is a number or a
 * file name of `[a-z0-9-]`, so there is nothing here that needs quoting.
 */
export function artInlineStyle(board: ArtBoard, moduleId: string): string {
  const { inset } = board;
  const ratio = (board.width / board.height).toFixed(4);
  return [
    `--fqb-art-ratio:${ratio}`,
    `--fqb-pin-top:${inset.top}%`,
    `--fqb-pin-right:${inset.right}%`,
    `--fqb-pin-bottom:${inset.bottom}%`,
    `--fqb-pin-left:${inset.left}%`,
    `background-image:url(${artUrl(board, moduleId)})`,
  ].join(";");
}
