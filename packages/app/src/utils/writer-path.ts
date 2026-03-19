import { uuid } from "./uuid"

export const WRITER_USERS = ".writer-users"
export const WRITER_SKILLS = ".skills"

let cached: string | undefined

const norm = (input: string) => input.replace(/\\/g, "/")

const trim = (input: string) => {
  const value = norm(input)
  if (value === "/") return value
  if (value === "//") return value
  if (/^[A-Za-z]:\/$/.test(value)) return value
  return value.replace(/\/+$/, "")
}

const join = (base: string, ...parts: string[]) => {
  const root = trim(base)
  const tail = parts.map((item) => trim(item).replace(/^\/+/, "")).filter(Boolean)
  if (!root) return tail.join("/")
  if (tail.length === 0) return root
  return `${root}/${tail.join("/")}`
}

export function writerBase(input: string) {
  const value = trim(input)
  const mark = `/${WRITER_USERS}/`
  const idx = value.indexOf(mark)
  if (idx === -1) return value
  const base = value.slice(0, idx)
  if (!base) return "/"
  return trim(base)
}

export function writerWorkspace(input: string) {
  const value = trim(input)
  const mark = `/${WRITER_USERS}/`
  const idx = value.indexOf(mark)
  if (idx === -1) return ""
  const tail = value.slice(idx + mark.length).split("/")[0] ?? ""
  if (!tail) return ""
  try {
    return decodeURIComponent(tail)
  } catch {
    return tail
  }
}

export function writerUser(input: string, id: string) {
  const value = encodeURIComponent(id.trim())
  if (!value) return writerBase(input)
  return join(writerBase(input), WRITER_USERS, value)
}

export function writerVisitor() {
  if (cached) return cached
  const key = "opencode.writer.visitor.v1"
  try {
    const store = globalThis.localStorage
    const value = store?.getItem(key)?.trim()
    if (value) {
      cached = value
      return value
    }
    const next = uuid()
    cached = next
    store?.setItem(key, next)
    return next
  } catch {
    const next = uuid()
    cached = next
    return next
  }
}

export function writerSkills(input: string) {
  return join(input, WRITER_SKILLS)
}
