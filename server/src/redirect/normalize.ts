/**
 * Redirect keys are "host/path" strings, e.g. "go.example.com/flyer".
 * Configured keys and incoming requests both go through normalizeKey, so they can be compared 1:1:
 *
 * - protocol, port, query and hash are ignored
 * - matching is case-insensitive ("go.example.com/Flyer" == "go.example.com/flyer")
 * - trailing slashes are ignored ("a.com/x/" == "a.com/x"); a bare domain becomes "a.com/"
 * - percent-encoding is ignored ("a.com/%C3%BCber" == "a.com/über")
 * - for local testing, 127.0.0.1 and [::1] count as "localhost", and a ".localhost" suffix is
 *   stripped, so http://go.example.com.localhost:6500/flyer matches "go.example.com/flyer"
 *
 * @returns the normalized key, or undefined if the input can't be parsed as a url
 */
export function normalizeKey(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const s = input.trim()
  if (s === "") return undefined

  let url: URL
  try {
    url = new URL(hasProtocol(s) ? s : "http://" + s)
  }
  catch (e) {
    return undefined
  }

  const host = normalizeHost(url.hostname)
  if (host === "") return undefined

  return (host + trimTrailingSlashes(safeDecode(url.pathname))).toLowerCase()
}

/**
 * Only absolute http(s) urls without credentials are accepted as redirect targets
 * (credentials allow deceptive targets like https://trusted.com@evil.com).
 * @returns the target in canonical form (as the URL parser serializes it), or undefined if invalid
 */
export function normalizeTarget(target: unknown): string | undefined {
  if (typeof target !== "string") return undefined
  try {
    const url = new URL(target.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    if (url.username !== "" || url.password !== "") return undefined
    return url.href
  }
  catch (e) {
    return undefined
  }
}


const loopbackHosts = new Set(["127.0.0.1", "[::1]"])

function normalizeHost(host: string) {
  host = host.toLowerCase()
  if (host.endsWith(".")) host = host.slice(0, -1)
  if (loopbackHosts.has(host)) return "localhost"
  if (host.endsWith(".localhost")) return host.slice(0, -".localhost".length)
  return host
}

/** "/a//" -> "/a", "/" stays "/". A loop instead of /\/+$/, which is quadratic on long runs of slashes (request paths are attacker controlled). */
function trimTrailingSlashes(path: string) {
  let end = path.length
  while (end > 1 && path[end - 1] === "/") end--
  return path.slice(0, end)
}

function hasProtocol(s: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(s)
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  }
  catch (e) {
    return s
  }
}
