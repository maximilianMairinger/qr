import type { Db, MongoClientOptions } from "mongodb"
import { connectToDB, DBConfig } from "./setup"


export type LazyDb = {
  /**
   * The db if connected. While a connection attempt is in flight, waits for it.
   * Resolves undefined right away while the db is unreachable (between retries).
   */
  get(): Promise<Db | undefined>
  /** Resolves once, on the first successful connection. Never rejects. */
  connected: Promise<Db>
}


/**
 * Connects in the background, so the server is up immediately whether the db is reachable or not.
 * A failed connect is retried every `retryMs`. Once connected, the driver handles reconnects itself.
 */
export function connectInBackground(config: DBConfig, clientOptions?: MongoClientOptions, retryMs = 10_000): LazyDb {
  let db: Db | undefined
  let attempt: Promise<Db | undefined> | undefined
  let failedBefore = false
  let onConnected: (db: Db) => void
  const connected = new Promise<Db>((res) => { onConnected = res })

  function connect() {
    attempt = connectToDB(config, clientOptions).then((d) => {
      db = d
      attempt = undefined
      console.log(`Connected to MongoDB${failedBefore ? " (after retrying)" : ""}`)
      onConnected(d)
      return d
    }, (e) => {
      attempt = undefined
      if (!failedBefore) console.error(`Unable to connect to MongoDB (${e.message}), retrying every ${retryMs / 1000}s in the background`)
      failedBefore = true
      setTimeout(connect, retryMs).unref()
      return undefined
    })
  }
  connect()

  return {
    get: async () => db ?? attempt,
    connected
  }
}
