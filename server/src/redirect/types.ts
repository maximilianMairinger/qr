/**
 * A place redirects can be read from (JSON file, MongoDB, ...).
 * Sources are queried in order, the first one that knows a key wins.
 */
export interface RedirectSource {
  /** Human readable, used in log messages */
  readonly name: string
  /**
   * @param key a normalized key (see normalizeKey in ./normalize)
   * @returns the target url, or undefined if this source has no entry for the key
   * @throws SourceUnavailableError if the source can't answer right now (e.g. db down)
   */
  lookup(key: string): Promise<string | undefined> | string | undefined
}

/** Expected outage (e.g. db not connected yet). Not logged per request, answered with 503. */
export class SourceUnavailableError extends Error {}
