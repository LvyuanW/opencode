import { describe, expect, test } from "bun:test"
import { createFileTreeStore } from "./tree-store"

function node(path: string) {
  return {
    name: path.split("/").pop() ?? path,
    path,
    absolute: path,
    type: "file" as const,
    ignored: false,
  }
}

describe("file tree store", () => {
  test("re-runs forced refresh after pending list settles", async () => {
    let calls = 0
    let release = () => {}
    const list = (_: string) => {
      calls += 1
      if (calls === 1) {
        return new Promise<ReturnType<typeof node>[]>((resolve) => {
          release = () => resolve([])
        })
      }
      return Promise.resolve([node("draft.md")])
    }

    const store = createFileTreeStore({
      scope: () => "/tmp/work",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list,
      onError: () => {},
    })

    const first = store.listDir("")
    const forceA = store.listDir("", { force: true })
    const forceB = store.listDir("", { force: true })

    expect(calls).toBe(1)

    release()
    await Promise.all([first, forceA, forceB])

    expect(calls).toBe(2)
    expect(store.children("").map((item) => item.path)).toEqual(["draft.md"])
  })
})
