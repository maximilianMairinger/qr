import fs from "fs"
import pth from "path"
import { normalizeKey, normalizeTarget } from "./normalize"
import type { RedirectSource } from "./types"


/**
 * Redirects from a JSON file of the shape { "host/path": "https://target.url" }.
 * The file is watched and reloaded on change, so edits apply without a server restart.
 * If an edit leaves the file unparseable, the previously loaded redirects stay active.
 */
export function jsonFileSource(filePath: string): RedirectSource {
  const displayPath = pth.relative("", filePath)
  let redirects = new Map<string, string>()

  function load() {
    let raw: string
    try {
      raw = fs.readFileSync(filePath, "utf8")
    }
    catch (e) {
      redirects = new Map()
      if (e.code === "ENOENT") console.log(`[redirect] ${displayPath} not found, no file based redirects active`)
      else console.error(`[redirect] Unable to read ${displayPath}:`, e.message)
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    }
    catch (e) {
      console.error(`[redirect] ${displayPath} is not valid JSON, keeping the previous ${redirects.size} redirect(s). ${e.message}`)
      return
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      console.error(`[redirect] ${displayPath} must contain an object like { "host/path": "https://target" }, keeping the previous ${redirects.size} redirect(s)`)
      return
    }

    const next = new Map<string, string>()
    for (const [from, to] of Object.entries(parsed)) {
      const key = normalizeKey(from)
      if (key === undefined) {
        console.warn(`[redirect] ${displayPath}: skipping "${from}", not a valid host/path`)
        continue
      }
      const target = normalizeTarget(to)
      if (target === undefined) {
        console.warn(`[redirect] ${displayPath}: skipping "${from}", target must be an absolute http(s) url`)
        continue
      }
      if (next.has(key)) console.warn(`[redirect] ${displayPath}: "${from}" duplicates an earlier entry (both are "${key}"), the later one wins`)
      next.set(key, target)
    }

    redirects = next
    console.log(`[redirect] Loaded ${next.size} redirect(s) from ${displayPath}`)
  }

  load()
  // polling (instead of fs.watch) survives editors that save by replacing the file
  fs.watchFile(filePath, { interval: 1000, persistent: false }, load)

  return {
    name: displayPath,
    lookup: (key) => redirects.get(key)
  }
}
