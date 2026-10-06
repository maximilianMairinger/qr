import setup from "./setup"
import pth from "path"
import { connectInBackground } from "./db"
import { redirectMiddleware } from "./redirect/middleware"
import { jsonFileSource } from "./redirect/jsonFileSource"
import { mongoSource } from "./redirect/mongo"


// The app (SPA, see /app) is switched off for now, this server is purely the redirect service.
// Set to "*" to serve it again.
const appIndexUrl: string | null = null

const redirectsFile = pth.join(__dirname, "..", "redirects.json")

// Not awaited: the server starts right away, redirects.json works without the db
const db = connectInBackground({
  url: process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017",
  dbName: process.env.MONGO_DB ?? "qr"
}, {
  // how long an operation waits for an unreachable db before failing (default 30s)
  serverSelectionTimeoutMS: 5000,
  // don't let operations on a stalled (connected but unresponsive) db hang forever (default: no timeout)
  socketTimeoutMS: 20000
})



setup(null, appIndexUrl).then(async (app) => {

  // order is precedence: entries in redirects.json override the db
  app.use(redirectMiddleware([
    jsonFileSource(redirectsFile),
    mongoSource(db)
  ]))

  // app.post("/echo", (req, res) => {
  //   res.send(req.body)
  // })
})
