const PORT = "4096"
const PREVIEW = "4173"

type Env = {
  VITE_OPENCODE_SERVER_HOST?: string
  VITE_OPENCODE_SERVER_PORT?: string
  VITE_OPENCODE_SERVER_URL?: string
}

type Loc = Pick<Location, "hostname" | "origin" | "port" | "protocol">

const trim = (value?: string | null) => value?.trim()

const scheme = (loc: Loc, dev: boolean) => {
  if (dev) return "http:"
  if (loc.protocol === "http:" || loc.protocol === "https:") return loc.protocol
  return "http:"
}

const normalize = (value: string) => value.replace(/\/+$/, "")

const origin = (value: string, proto: string) => {
  return normalize(new URL(/^https?:\/\//.test(value) ? value : `${proto}//${value}`).origin)
}

const envUrl = (env: Env, loc: Loc, dev: boolean) => {
  const full = trim(env.VITE_OPENCODE_SERVER_URL)
  if (full) return origin(full, scheme(loc, dev))

  const host = trim(env.VITE_OPENCODE_SERVER_HOST)
  const port = trim(env.VITE_OPENCODE_SERVER_PORT)
  if (!host && !port) return

  const url = new URL(
    host && /^https?:\/\//.test(host)
      ? host
      : `${scheme(loc, dev)}//${
          !host || host === "0.0.0.0" || host === "::" ? loc.hostname || "localhost" : host
        }`,
  )
  if (port) url.port = port
  return normalize(url.origin)
}

export function serverUrls(input: {
  env: Env
  loc: Loc
  dev: boolean
  defaultUrl?: string | null
}) {
  const port = trim(input.env.VITE_OPENCODE_SERVER_PORT) || PORT
  const host = input.loc.hostname || "localhost"
  const stored = trim(input.defaultUrl)
  return [
    envUrl(input.env, input.loc, input.dev),
    stored ? normalize(stored) : undefined,
    input.loc.hostname.includes("opencode.ai") ? `http://localhost:${port}` : undefined,
    input.dev || input.loc.port === PREVIEW ? `http://${host}:${port}` : undefined,
    normalize(input.loc.origin),
  ].filter((value, index, list): value is string => !!value && list.indexOf(value) === index)
}
