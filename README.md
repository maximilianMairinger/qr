# Qr

Qr code gen Site + redirect service with simple analytics.

## Redirects

For now the server is purely a redirect service, the app (SPA) is not served (see `appIndexUrl` in `server/src/server.ts`).

Every GET/HEAD request is looked up by its `host/path` (e.g. `go.example.com/flyer`). Known keys are answered with a `307` (temporary, so targets can change later) to their target. Unknown keys get a plain `404`, or a `503` if the db couldn't be asked. Sources, in order of precedence:

1. `server/redirects.json`, reloaded on save (no restart needed):

   ```json
   { "go.example.com/flyer": "https://example.com/some/long/url" }
   ```

2. MongoDB, collection `redirects` with docs `{ from: "go.example.com/flyer", to: "https://..." }`. Connection via `MONGO_URL` (default `mongodb://127.0.0.1:27017`) and `MONGO_DB` (default `qr`). The server connects in the background and keeps retrying, so it never waits for the db on startup.

Keys ignore protocol, port, query, trailing slashes and case. In the db, `from` must be stored in that normalized form (lowercase, no protocol, no trailing slash); docs that aren't are logged at startup. `saveRedirect(db, from, to)` in `server/src/redirect/mongo.ts` writes entries in the right format.

Testing locally (dev server on port 6500):

- `127.0.0.1` and `[::1]` count as `localhost`, so a key `localhost/test` answers http://127.0.0.1:6500/test
- a `.localhost` suffix is stripped, so http://go.example.com.localhost:6500/flyer is treated as `go.example.com/flyer` (works in Chrome, Firefox and curl)
- or set the host explicitly: `curl -I -H "Host: go.example.com" http://127.0.0.1:6500/flyer`

Deployment:

- Behind a reverse proxy, the original `Host` header has to be passed on (nginx: `proxy_set_header Host $host;`), otherwise every request looks like it's for the proxy's upstream host.
- `server/redirects.json` is deployed as part of `server/`, so edit it in git. Edits made directly on the server are overwritten by the next deploy.

## Contribute

The frontend / client is referred as app. The backend as server.

### Development env

#### Develop app

The source of the app can be found in `/app` and the serviceWorker's in `/serviceWorker`.

```
 $ npm run devApp
```

Builds the app on save & spins up a live (notifies client to reload on change) repl server, whose source can be found in `/replServer/src`.

#### Develop server

Source found in `/server/src`.

```
 $ npm run devServer
```

Builds the server & replApp on save. The source of the replApp can be found under `/replApp`. No live reloading available, since its the prod server.

#### Develop server & app

```
 $ npm run dev
```

Watches production server & app and builds them on save. No live reloading avalible, since its the prod server.

### Deploy

#### Build scripts

Build everything for production

```
 $ npm run build
```

#### Start

Start the server with default options

```
 $ npm start
```

Since this is a [npm-run-script](https://docs.npmjs.com/cli/run-script), cli options must be escaped in order to distinguish them from npm options. Simply prefix all options with **one** `--` like so: 

```
 $ npm start --  --port 1234 --outageReciliance strong
```

##### CLI options

Here is a list of all recognised cli options:

> TODO