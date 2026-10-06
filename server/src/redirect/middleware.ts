import type { RequestHandler } from "express"
import { normalizeKey } from "./normalize"
import { RedirectSource, SourceUnavailableError } from "./types"
import { sendStatus } from "../setup"


// 307 Temporary Redirect: targets are meant to be changeable (think printed QR codes),
// and browsers cache permanent redirects (301/308) more or less forever.
const redirectStatus = 307

// req.hostname is the raw Host header (minus port). Only accept actual host names / IPv6 literals,
// so a crafted Host like "a.com/x#" can't be parsed into some other key.
const validHostname = /^[a-z0-9._-]+$|^\[[0-9a-f:.]+\]$/i


/**
 * Redirects GET/HEAD requests whose host + path is known to one of the sources.
 * Sources are asked in order, the first hit wins. Unknown keys fall through to the
 * next handler (generic 404). If a source couldn't be asked (e.g. db down), it's a 503
 * instead, since the key might exist there.
 */
export function redirectMiddleware(sources: RedirectSource[]): RequestHandler {
  return async (req, res, next) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") return next()
      if (!req.hostname || !validHostname.test(req.hostname)) return next()

      const key = normalizeKey(req.hostname + req.path)
      if (key === undefined) return next()

      let someSourceUnavailable = false
      for (const source of sources) {
        let target: string | undefined
        try {
          target = await source.lookup(key)
        }
        catch (e) {
          someSourceUnavailable = true
          if (!(e instanceof SourceUnavailableError)) console.error(`[redirect] Lookup of ${JSON.stringify(key)} in ${source.name} failed:`, e?.message)
          continue
        }

        if (target !== undefined) {
          res.redirect(redirectStatus, target)
          return
        }
      }

      if (someSourceUnavailable) sendStatus(res, 503)
      else next()
    }
    catch (e) {
      // never let the promise reject, express 4 doesn't catch that (unhandled rejection = crash)
      next(e)
    }
  }
}
