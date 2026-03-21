import { describe, expect, test } from "bun:test"
import type { Agent } from "@opencode-ai/sdk/v2/client"
import { normalizeAgents } from "./utils"

describe("normalizeAgents", () => {
  test("keeps array responses unchanged", () => {
    const list: Agent[] = [{ name: "writer", mode: "primary", permission: [], options: {} }]
    expect(normalizeAgents(list)).toEqual(list)
  })

  test("unwraps object-wrapped agent arrays", () => {
    expect(
      normalizeAgents({
        agents: [{ name: "writer", mode: "primary", permission: [], options: {} } satisfies Agent],
      }),
    ).toEqual([{ name: "writer", mode: "primary", permission: [], options: {} }])
  })

  test("converts legacy keyed maps into arrays", () => {
    expect(
      normalizeAgents({
        build: { name: "build", mode: "primary", permission: [], options: {} } satisfies Agent,
        writer: { name: "writer", mode: "primary", permission: [], options: {} } satisfies Agent,
        nope: "bad",
      }),
    ).toEqual([
      { name: "build", mode: "primary", permission: [], options: {} },
      { name: "writer", mode: "primary", permission: [], options: {} },
    ])
  })
})
