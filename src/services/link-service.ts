/**
 * The Journal / quest integration, in its entirety.
 *
 * A notice stores **a UUID and nothing else**. This module never reads what is
 * on the other end beyond its name and never writes to it, which is the whole
 * point: a JournalEntry, a single page of one, or a quest document belonging to
 * Forien's Quest Log or any other tracker all resolve through `fromUuid` and all
 * behave identically here. Quest *tracking* stays the business of whatever the
 * user already runs; this module stays the pinboard in front of it.
 *
 * Everything below tolerates a dangling UUID. A GM deletes a journal entry
 * eventually, and a notice pointing at nothing should read as a notice with no
 * link rather than throw at the table.
 */

/** What the board and the notice close-up need to know about a link. */
export interface ResolvedLink {
  uuid: string;
  /** The document's name, or the raw UUID if it could not be resolved. */
  name: string;
  /** False when the UUID resolves to nothing — a deleted entry, or a typo. */
  valid: boolean;
}

/** Resolve a UUID for display. Never throws; an unresolvable link comes back invalid. */
export async function resolveLink(uuid: string): Promise<ResolvedLink | null> {
  const trimmed = uuid.trim();
  if (!trimmed) return null;
  const document = await lookup(trimmed);
  if (!document) return { uuid: trimmed, name: trimmed, valid: false };
  const name = typeof document["name"] === "string" ? document["name"] : trimmed;
  return { uuid: trimmed, name, valid: true };
}

/**
 * Open whatever a notice links to.
 *
 * A journal *page* has no sheet of its own worth opening — Foundry renders it
 * inside its parent entry's sheet — so a page UUID opens the entry scrolled to
 * that page. Anything else just renders its own sheet, which is what makes an
 * unknown quest document from another module work without this module knowing
 * anything about it.
 */
export async function openLink(uuid: string): Promise<void> {
  const document = await lookup(uuid);
  if (!document) {
    ui.notifications?.warn(game.i18n.format("FQB.Notify.MissingLink", { uuid }));
    return;
  }

  const parent = document["parent"] as AnyObject | undefined;
  if (document["documentName"] === "JournalEntryPage" && parent?.["sheet"]) {
    parent["sheet"].render(true, { pageId: document["id"] });
    return;
  }

  const sheet = document["sheet"] as AnyObject | undefined;
  if (!sheet) {
    ui.notifications?.warn(game.i18n.format("FQB.Notify.UnopenableLink", { uuid }));
    return;
  }
  sheet.render(true);
}

/**
 * Pull a UUID out of a sidebar drag.
 *
 * Foundry puts a JSON payload on the drag event; anything with a `uuid` is
 * something `fromUuid` can address, which is exactly this module's contract.
 * Returns null for a drag carrying something else, so the drop is simply
 * ignored rather than storing a broken link.
 */
export function uuidFromDrop(event: DragEvent): string | null {
  const raw = event.dataTransfer?.getData("text/plain");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as AnyObject;
    const uuid = data["uuid"];
    return typeof uuid === "string" && uuid ? uuid : null;
  } catch {
    return null;
  }
}

/** `fromUuid`, with its rejections turned into a null rather than an unhandled one. */
async function lookup(uuid: string): Promise<AnyObject | null> {
  try {
    return await fromUuid(uuid.trim());
  } catch {
    return null;
  }
}
