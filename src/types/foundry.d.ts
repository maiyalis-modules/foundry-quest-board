/**
 * Minimal ambient declarations for the FoundryVTT globals this module touches.
 *
 * This is a deliberately small shim so the project type-checks and builds without
 * pulling in the full community type packages. When you want richer typings,
 * install `fvtt-types` (https://github.com/League-of-Foundry-Developers/foundry-vtt-types)
 * and delete this file.
 *
 * Add to it rather than reaching for `any` when you touch a new Foundry global.
 */

export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyObject = Record<string, any>;

  /** Loose stand-in for jQuery — some classic Foundry hooks still pass it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type JQuery = any;

  /** Foundry's global hook dispatcher. */
  const Hooks: {
    on(hook: string, fn: (...args: any[]) => unknown): number;
    once(hook: string, fn: (...args: any[]) => unknown): number;
    off(hook: string, fn: number | ((...args: any[]) => unknown)): void;
    call(hook: string, ...args: any[]): boolean;
    callAll(hook: string, ...args: any[]): boolean;
  };

  /** The active game instance. Only ready after the `ready` hook fires. */
  const game: {
    modules: Map<string, { active: boolean; api?: unknown } & AnyObject>;
    settings: {
      register(namespace: string, key: string, data: AnyObject): void;
      registerMenu(namespace: string, key: string, data: AnyObject): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
    socket?: {
      on(event: string, fn: (...args: any[]) => void): void;
      emit(event: string, ...args: any[]): void;
    };
    user?: { id: string; isGM: boolean; name: string } & AnyObject;
    users?: AnyObject;
    journal?: AnyObject;
    /** The active game system. This module is system-agnostic; only logged. */
    system?: { id: string; version?: string } & AnyObject;
    i18n: {
      localize(key: string): string;
      format(key: string, data?: AnyObject): string;
    };
  } & AnyObject;

  const CONFIG: AnyObject;
  const ui: AnyObject & {
    notifications?: { info(m: string): void; warn(m: string): void; error(m: string): void };
  };

  /**
   * Resolve a document UUID. This is the whole of the Journal/quest integration:
   * a notice stores a UUID string and nothing else, so anything Foundry can
   * address — a JournalEntry, one of its pages, another module's quest document
   * — resolves through the same call. See `services/link-service.ts`.
   */
  function fromUuid(uuid: string): Promise<AnyObject | null>;

  /** The Foundry client-side API namespace (ApplicationV2 lives here). */
  const foundry: {
    applications: {
      api: {
        ApplicationV2: any;
        HandlebarsApplicationMixin: <T>(base: T) => T;
        DialogV2: any;
      };
      /** Every open ApplicationV2, keyed by id (the v1 `ui.windows` successor). */
      instances: Map<string, AnyObject>;
    } & AnyObject;
    utils: {
      /** 16-character document-style id; what every board and notice is keyed by. */
      randomID(length?: number): string;
    } & AnyObject;
  } & AnyObject;
}
