import express from "express"
import bodyParser from "body-parser"
import xrray from "xrray"; xrray(Array);
import * as MongoDB from "mongodb";
const MongoClient = MongoDB.MongoClient
import pth from "path"
import fs from "fs"
import { STATUS_CODES } from "http"
import detectPort from "detect-port"
import ws, { WebSocketServer, WebSocket } from "ws"
import keyIndex from "key-index"
import { ResablePromise } from "more-proms"

const defaultPortStart = 3050

export type App = express.Express & { 
  port: number, 
  getWebSocketServer: (url: `/${string}`) => WebSocketServer,
  ws: (url: `/${string}`, cb: (ws: WebSocket & {on: WebSocket["addEventListener"], off: WebSocket["removeEventListener"]}, req: any) => void) => void,
}


export type SendFileProxyFunc = (file: string, ext: string, fileName: string) => string | void | null

/**
 * @param indexUrl route the app's index.html is served on, null to not serve it
 * @param publicPath folder served statically, null to not serve any files
 */
export function configureExpressApp(indexUrl: string | null, publicPath: string | null, sendFileProxy?: Promise<SendFileProxyFunc> | SendFileProxyFunc, callAtStart?: (app: express.Express) => express.Express | void) {
  if (indexUrl !== null && indexUrl !== "*") if (!indexUrl.startsWith("/")) indexUrl = "/" + indexUrl

  let app = express() as express.Express & { 
    port: number, 
    getWebSocketServer: (url: `/${string}`) => WebSocketServer,
    ws: (url: `/${string}`, cb: (ws: WebSocket & {on: WebSocket["addEventListener"], off: WebSocket["removeEventListener"]}, req: any) => void) => void,
  }

  app.disable("x-powered-by")

  const returnAppPromise = new ResablePromise()
  
  
  

  if (callAtStart) {
    let q = callAtStart(app)
    if (q !== undefined && q !== null) app = q as any
  }
  app.use(bodyParser.urlencoded({extended: false}))
  app.use(bodyParser.json())


  let sendFileProxyLoaded: Function = (res: any) => (path: string) => {
    res.old_sendFile(pth.join(pth.resolve(""), path))
  }
  if (sendFileProxy) {
    (async () => {
      let proxy = await sendFileProxy
      sendFileProxyLoaded = (res: any) => (path: string) => {
        let file = fs.readFileSync(path).toString()
        let extName = pth.extname(path)
        let end = proxy(file, pth.extname(path), pth.basename(path, extName))
        if (end === undefined) res.send(file)
        else if (end === null) res.status(400).end()
        else res.send(end)
      }
    })()
  }

  if (publicPath !== null) app.use(express.static(pth.join(pth.resolve(""), publicPath), {index: false}))



  //@ts-ignore
  app.old_get = app.get
  //@ts-ignore
  app.get = (url: string, cb: (req: any, res: any, next) => void) => {
    // app.get(name) is also express' settings getter, which express itself calls on every request
    // (e.g. "trust proxy fn", "etag fn"). Registering a route for those leaked memory on every request.
    //@ts-ignore
    if (cb === undefined) return app.old_get(url)
    //@ts-ignore
    app.old_get(url, (req, res, next) => {
      res.old_sendFile = res.sendFile
      res.sendFile = sendFileProxyLoaded(res)
      cb(req, res, next)
    })
  }

  let prt = process.env.port
  let _port: Promise<number>
  if (prt === undefined) {
    _port = (detectPort(defaultPortStart) as Promise<number>)
    _port.then((port) => {console.log("No port given, using fallback - Serving on http://127.0.0.1:" + port)}) as Promise<number>
  }
  else _port = Promise.resolve(+prt);
  

  // @ts-ignore
  const webSocketServerMap = keyIndex((url: `/${string}`) => new WebSocketServer({ noServer: true, path: url }))
  app.getWebSocketServer = webSocketServerMap;
  

  (async () => {
    app.port = await _port
    const port = app.port
  
    
    const expressServer = app.listen(port)
    app.ws = (url: `/${string}`, cb: (ws: WebSocket & {on: WebSocket["addEventListener"], off: WebSocket["removeEventListener"]}, req: any) => void) => {
      const websocketServer = webSocketServerMap(url)
      // @ts-ignore
      websocketServer.on("connection", (ws, req) => {
        cb(ws, req)
      })
    }
  
    expressServer.on("upgrade", (request, socket, head) => {
      const url = request.url.split("?")[0] as `/${string}`
      // Only upgrade on registered paths. Creating a server for whatever path is requested let anyone
      // pile up WebSocketServers (memory) and accepted-but-unhandled sockets.
      if (!webSocketServerMap.has(url)) {
        socket.destroy()
        return
      }
      // @ts-ignore
      webSocketServerMap(url).handleUpgrade(request, socket, head, (websocket) => {
        webSocketServerMap(url).emit("connection", websocket, request);
      });
    });
  
  })().then(async () => {
    await returnAppPromise.res(app)
    // everything after user land code

    if (indexUrl !== null) app.get(indexUrl, (req, res) => {
      res.sendFile("public/index.html")
    });

    // generic responses only, never leak details (e.g. stack traces) to the client
    app.use((req, res) => {
      sendStatus(res, 404)
    })
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const status = err?.status >= 400 && err?.status < 500 ? err.status : 500
      if (status >= 500) console.error(err)
      if (res.headersSent) return next(err)
      sendStatus(res, status)
    })
  })


  return returnAppPromise as any as Promise<typeof app>
}

export function sendStatus(res: express.Response, status: number) {
  res.status(status).type("text/plain").send(STATUS_CODES[status] ?? "Error")
}

export type DBConfig = {
  url: string,
  dbName: string
}

/** Single connection attempt, rejects if the db isn't reachable */
export async function connectToDB(dbName_DBConfig: string | DBConfig, clientOptions: MongoDB.MongoClientOptions = {}): Promise<MongoDB.Db> {
  const dbConfig = typeof dbName_DBConfig === "string" ? { dbName: dbName_DBConfig, url: "mongodb://127.0.0.1:27017" } : dbName_DBConfig
  const client = await MongoClient.connect(dbConfig.url, { useUnifiedTopology: true, ...clientOptions })
  return client.db(dbConfig.dbName)
}


const publicPath = "./public"

/**
 * @param indexUrl route the app (SPA) is served on, null to not serve the app (nor anything from public/) at all
 */
export default function (dbName_DBConfig?: undefined | null, indexUrl?: string | null): Promise<App>;
export default function (dbName_DBConfig: string | DBConfig, indexUrl?: string | null): Promise<{ db: MongoDB.Db, app: App }>
export default function (dbName_DBConfig?: string | null | undefined | DBConfig, indexUrl: string | null = "*"): any {
  return configureExpressApp(indexUrl, indexUrl === null ? null : publicPath).then((app) => {
    if (dbName_DBConfig) {
      const prom = new Promise((res) => {
        connectToDB(dbName_DBConfig).then(async (db) => {
          res({db, app: await app})
        }).catch(async (e) => {
          console.error("Unable to connect to MongoDB")
          console.error(e)

          res({app: await app})
        })
      })

      return prom
    }
    else {
      return app
    }
  })
}

