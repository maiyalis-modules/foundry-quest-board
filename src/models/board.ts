/**
 * The saved content: a board is a surface with a look, and a notice is a scrap
 * of paper pinned to it at a position and an angle.
 *
 * Deliberately plain data — a board is JSON in a world setting, never a class.
 * Everything that renders one (`apps/board-app.ts`) reads these fields and
 * nothing else, so a new board style, notice template or pin is a value here
 * plus a CSS rule, not a code path.
 */

/**
 * The surface a board's notices are pinned to. Each becomes a `fqb-board--*`
 * class in module.css and nothing more; a board with its own `background` image
 * keeps the style's frame and pins but replaces the texture behind them.
 */
export const BOARD_STYLES = {
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

export type BoardStyle = (typeof BOARD_STYLES)[keyof typeof BOARD_STYLES];

/** What a single notice is printed on. A `fqb-notice--*` class on the notice. */
export const NOTICE_TEMPLATES = {
  parchment: "parchment",
  /** Heavy black display type, a portrait image well, a bounty at the foot. */
  wanted: "wanted",
  /** A small hand-torn note in a looser hand. */
  note: "note",
  /** A printed flyer with a ruled border. */
  flyer: "flyer",
  /** Cream stock, a seal, and a straight civic tone. */
  official: "official",
  /** Half a napkin, ink bleeding — the rumour someone left on a table. */
  napkin: "napkin",
} as const;

export type NoticeTemplate = (typeof NOTICE_TEMPLATES)[keyof typeof NOTICE_TEMPLATES];

/** What holds a notice to the board. A `fqb-pin--*` class on the notice. */
export const PINS = {
  pin: "pin",
  nail: "nail",
  tape: "tape",
  wax: "wax",
  none: "none",
} as const;

export type Pin = (typeof PINS)[keyof typeof PINS];

/** How much of the board a notice takes up. A `fqb-size--*` class. */
export const SIZES = {
  small: "small",
  medium: "medium",
  large: "large",
} as const;

export type Size = (typeof SIZES)[keyof typeof SIZES];

export interface Notice {
  id: string;
  /** Headline, in the template's display face. */
  title: string;
  /** The notice body. Newlines are preserved; HTML is escaped, never rendered. */
  text: string;
  /** Path to an optional illustration, as the file picker returns it. */
  image: string;
  /** Free text — "100 gold", "A favour owed", "" for none. */
  reward: string;
  /** Free text — who nailed it up. */
  postedBy: string;
  /**
   * Optional UUID of a JournalEntry, a journal page, or a quest document from
   * another module. Purely a pointer: this module never reads what is on the
   * other end beyond its name, so a Forien's Quest Log quest and a plain
   * journal entry behave identically. See `services/link-service.ts`.
   */
  link: string;
  template: NoticeTemplate;
  pin: Pin;
  size: Size;
  /** Position of the notice's centre, as a percentage of the board surface. */
  x: number;
  y: number;
  /** Degrees of tilt. Nothing on a real board hangs straight. */
  rotation: number;
  /** Pinned but not yet shown to players. The GM sees it marked as such. */
  hidden: boolean;
}

export interface Board {
  id: string;
  name: string;
  /** The line on the board's header plaque. Optional. */
  subtitle: string;
  style: BoardStyle;
  /** Optional texture behind the notices, replacing the style's own. */
  background: string;
  /** Whether players may open this board themselves. See `SETTINGS.playersCanBrowse`. */
  playerVisible: boolean;
  notices: Notice[];
  /** Epoch ms of the last save — the library lists most-recently-edited first. */
  updatedAt: number;
}

/** Bounds a notice centre must stay inside, so it cannot be dragged off the board. */
export const POSITION_BOUNDS = { min: 6, max: 94 } as const;
/** Bounds on tilt. Beyond this a notice reads as fallen rather than pinned. */
export const ROTATION_BOUNDS = { min: -20, max: 20 } as const;

export function clampPosition(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(POSITION_BOUNDS.max, Math.max(POSITION_BOUNDS.min, Math.round(value * 10) / 10));
}

export function clampRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ROTATION_BOUNDS.max, Math.max(ROTATION_BOUNDS.min, Math.round(value * 10) / 10));
}

/**
 * Where the next notice lands, and at what angle.
 *
 * Scatter is computed **once, at creation**, and stored — not derived at render
 * time. A board whose notices re-scattered on every render would be a different
 * board every time anyone opened it, and the GM could never say "the one in the
 * top corner". `index` walks a loose four-column grid so a run of new notices
 * spreads out instead of stacking, and the jitter comes off the notice id so two
 * notices landing in the same cell still differ.
 */
export function scatter(index: number, seed: string): { x: number; y: number; rotation: number } {
  const columns = 4;
  const column = index % columns;
  const row = Math.floor(index / columns);
  // Hash the id to a stable triple; any cheap mixing function will do here.
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  const unit = (shift: number): number => (((hash >>> shift) & 0xff) / 255) * 2 - 1;
  return {
    x: clampPosition(16 + column * 23 + unit(0) * 7),
    // Rows wrap down the board and then start overlapping again, which is what a
    // busy board actually looks like.
    y: clampPosition(20 + ((row * 26) % 68) + unit(8) * 6),
    rotation: clampRotation(unit(16) * 7),
  };
}

/** A blank notice, ready for the editor, scattered onto a board of `count` notices. */
export function emptyNotice(
  count = 0,
  template: NoticeTemplate = NOTICE_TEMPLATES.parchment,
  pin: Pin = PINS.pin,
): Notice {
  const id = foundry.utils.randomID();
  const placement = scatter(count, id);
  return {
    id,
    title: "",
    text: "",
    image: "",
    reward: "",
    postedBy: "",
    link: "",
    template,
    pin,
    size: SIZES.medium,
    ...placement,
    hidden: false,
  };
}

/** A blank board with no notices, ready for the editor. */
export function emptyBoard(name: string, style: BoardStyle = BOARD_STYLES.rustic): Board {
  return {
    id: foundry.utils.randomID(),
    name,
    subtitle: "",
    style,
    background: "",
    playerVisible: true,
    notices: [],
    updatedAt: Date.now(),
  };
}

/**
 * Coerce whatever came out of the world setting into a `Board`.
 *
 * The setting is `Array`-typed and hand-editable, and a board saved by an older
 * build can be missing fields a newer one reads. Filling defaults here means
 * every consumer can treat the shape as guaranteed.
 */
export function normalizeBoard(raw: AnyObject): Board {
  const styles = Object.values(BOARD_STYLES) as string[];
  const notices = Array.isArray(raw["notices"]) ? (raw["notices"] as AnyObject[]) : [];
  return {
    id: typeof raw["id"] === "string" ? raw["id"] : foundry.utils.randomID(),
    name: typeof raw["name"] === "string" ? raw["name"] : "",
    subtitle: typeof raw["subtitle"] === "string" ? raw["subtitle"] : "",
    style: styles.includes(raw["style"]) ? (raw["style"] as BoardStyle) : BOARD_STYLES.rustic,
    background: typeof raw["background"] === "string" ? raw["background"] : "",
    // Defaults to visible: a board nobody may look at is the surprising option.
    playerVisible: raw["playerVisible"] !== false,
    notices: notices.map((notice, index) => normalizeNotice(notice, index)),
    updatedAt: typeof raw["updatedAt"] === "number" ? raw["updatedAt"] : 0,
  };
}

function normalizeNotice(raw: AnyObject, index: number): Notice {
  const templates = Object.values(NOTICE_TEMPLATES) as string[];
  const pins = Object.values(PINS) as string[];
  const sizes = Object.values(SIZES) as string[];
  const id = typeof raw["id"] === "string" ? raw["id"] : foundry.utils.randomID();
  // A notice hand-added to the setting arrives with no placement at all; give it
  // one rather than piling every such notice into the same corner.
  const placement = scatter(index, id);
  const str = (key: string): string => (typeof raw[key] === "string" ? raw[key] : "");
  return {
    id,
    title: str("title"),
    text: str("text"),
    image: str("image"),
    reward: str("reward"),
    postedBy: str("postedBy"),
    link: str("link"),
    template: templates.includes(raw["template"])
      ? (raw["template"] as NoticeTemplate)
      : NOTICE_TEMPLATES.parchment,
    pin: pins.includes(raw["pin"]) ? (raw["pin"] as Pin) : PINS.pin,
    size: sizes.includes(raw["size"]) ? (raw["size"] as Size) : SIZES.medium,
    x: typeof raw["x"] === "number" ? clampPosition(raw["x"]) : placement.x,
    y: typeof raw["y"] === "number" ? clampPosition(raw["y"]) : placement.y,
    rotation:
      typeof raw["rotation"] === "number" ? clampRotation(raw["rotation"]) : placement.rotation,
    hidden: raw["hidden"] === true,
  };
}
