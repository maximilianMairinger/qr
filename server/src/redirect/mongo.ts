import type { Db, ObjectId } from "mongodb"
import type { LazyDb } from "../db"
import { normalizeKey, normalizeTarget } from "./normalize"
import { RedirectSource, SourceUnavailableError } from "./types"


export const redirectCollectionName = "redirects"

export type RedirectDoc = {
  _id?: ObjectId
  /** normalized key, e.g. "go.example.com/flyer" (see normalizeKey) */
  from: string
  /** absolute http(s) url */
  to: string
  createdAt?: Date
}

const maxKeyLength = 2048
const maxTargetLength = 8192
// Bounds how long a request waits on a stalled db (the driver itself may wait much longer)
const lookupTimeoutMs = 3000

const redirects = (db: Db) => db.collection<RedirectDoc>(redirectCollectionName)


/**
 * Redirects from the "redirects" collection. Queried per request, so changes in the db apply immediately.
 */
export function mongoSource(lazyDb: LazyDb): RedirectSource {
  lazyDb.connected.then((db) => {
    ensureIndexes(db).catch((e) => {
      console.warn(`[redirect] Unable to ensure unique index on ${redirectCollectionName}.from:`, e.message)
    })
    warnAboutUnmatchableDocs(db)
  })

  let outage = false

  return {
    name: "mongodb",
    async lookup(key) {
      const db = await lazyDb.get()
      if (!db) throw new SourceUnavailableError("Not connected to MongoDB")

      let doc: Pick<RedirectDoc, "to"> | null
      try {
        doc = await withTimeout(redirects(db).findOne({ from: key }, { projection: { _id: 0, to: 1 } }), lookupTimeoutMs)
      }
      catch (e) {
        // log once per outage, not per request
        if (!outage) console.error(`[redirect] MongoDB lookups failing (${e.message}), keys not in redirects.json get 503 until it recovers`)
        outage = true
        throw new SourceUnavailableError(e.message)
      }
      if (outage) console.log("[redirect] MongoDB lookups work again")
      outage = false

      if (!doc) return undefined
      const target = normalizeTarget(doc.to)
      if (target === undefined) {
        console.warn(`[redirect] mongodb: ignoring ${JSON.stringify(key)}, target must be an absolute http(s) url`)
        return undefined
      }
      return target
    }
  }
}


export class RedirectInputError extends Error {}

/**
 * Saves a new redirect, normalized so lookups find it. Not used yet (no editing in the MVP).
 *
 * @param from host/path, e.g. "go.example.com/flyer" (a protocol is tolerated, query and hash are rejected since they're never matched)
 * @param to absolute http(s) url
 * @throws RedirectInputError on invalid input or if `from` already exists
 */
export async function saveRedirect(db: Db, from: string, to: string): Promise<RedirectDoc> {
  const key = normalizeKey(from)
  if (key === undefined || key.length > maxKeyLength) throw new RedirectInputError(`Invalid link, expected host/path like "go.example.com/flyer"`)
  if (/[?#]/.test(from)) throw new RedirectInputError("Query (?) and hash (#) are ignored for matching, leave them out of the link")

  const target = normalizeTarget(to)
  if (target === undefined || target.length > maxTargetLength) throw new RedirectInputError("Invalid target, expected an absolute http(s) url")

  // without the unique index, two saves of the same key could both go through
  await ensureIndexes(db)

  const doc: RedirectDoc = { from: key, to: target, createdAt: new Date() }
  try {
    await redirects(db).insertOne(doc)
  }
  catch (e) {
    if (e.code === 11000) throw new RedirectInputError(`"${key}" already exists`)
    throw e
  }
  return doc
}


function withTimeout<T>(prom: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((res, rej) => {
    timer = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)
  })
  return Promise.race([prom, timeout]).finally(() => clearTimeout(timer))
}


const ensuredIndexes = new WeakMap<Db, Promise<unknown>>()

/** Once per db, retried if it failed */
function ensureIndexes(db: Db) {
  let prom = ensuredIndexes.get(db)
  if (!prom) {
    // lookups go by `from`, and one key must never map to two targets
    prom = redirects(db).createIndex({ from: 1 }, { unique: true })
    prom.catch(() => ensuredIndexes.delete(db))
    ensuredIndexes.set(db, prom)
  }
  return prom
}

/**
 * Docs are matched by exact `from`, so a hand-written entry like "https://Go.example.com/flyer/" would
 * silently never match. Point those out once at startup.
 */
async function warnAboutUnmatchableDocs(db: Db) {
  try {
    const docs = await redirects(db).find({}, { projection: { from: 1 } }).toArray()
    for (const { _id, from } of docs) {
      const key = normalizeKey(from)
      if (key === from) continue
      if (key === undefined) console.warn(`[redirect] mongodb: doc ${_id} has an invalid "from" (${JSON.stringify(from)}), it will never match`)
      else console.warn(`[redirect] mongodb: doc ${_id} will never match, "from" must be normalized: ${JSON.stringify(from)} -> ${JSON.stringify(key)}`)
    }
  }
  catch (e) {
    console.warn(`[redirect] Unable to check ${redirectCollectionName} for unmatchable docs:`, e.message)
  }
}
