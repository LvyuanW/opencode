import { describe, expect, test } from "bun:test"
import { serverUrls } from "./server-url"

const env = (value: Record<string, string> = {}) =>
  ({
    VITE_OPENCODE_SERVER_HOST: "",
    VITE_OPENCODE_SERVER_PORT: "",
    VITE_OPENCODE_SERVER_URL: "",
    ...value,
  })

const loc = (value: Partial<Location> = {}): Location =>
  ({
    hostname: "localhost",
    origin: "http://localhost:4173",
    port: "4173",
    protocol: "http:",
    ...value,
  }) as Location

describe("serverUrls", () => {
  test("uses the backend port during local preview", () => {
    expect(
      serverUrls({
        env: env(),
        loc: loc(),
        dev: false,
      }),
    ).toEqual(["http://localhost:4096", "http://localhost:4173"])
  })

  test("prefers an explicit production server url", () => {
    expect(
      serverUrls({
        env: env({ VITE_OPENCODE_SERVER_URL: "https://api.example.com/" }),
        loc: loc({ origin: "https://writer.example.com", protocol: "https:", port: "" }),
        dev: false,
        defaultUrl: "http://localhost:4096",
      }),
    ).toEqual(["https://api.example.com", "http://localhost:4096", "https://writer.example.com"])
  })

  test("builds a url from host and port env values", () => {
    expect(
      serverUrls({
        env: env({
          VITE_OPENCODE_SERVER_HOST: "api.example.com",
          VITE_OPENCODE_SERVER_PORT: "8443",
        }),
        loc: loc({ origin: "https://writer.example.com", protocol: "https:", port: "" }),
        dev: false,
      }),
    ).toEqual(["https://api.example.com:8443", "https://writer.example.com"])
  })

  test("uses the current host when only a port override is set", () => {
    expect(
      serverUrls({
        env: env({ VITE_OPENCODE_SERVER_PORT: "4096" }),
        loc: loc({ hostname: "writer.example.com", origin: "https://writer.example.com", protocol: "https:", port: "" }),
        dev: false,
      }),
    ).toEqual(["https://writer.example.com:4096", "https://writer.example.com"])
  })

  test("keeps the dev backend first", () => {
    expect(
      serverUrls({
        env: env({ VITE_OPENCODE_SERVER_PORT: "4100" }),
        loc: loc({ hostname: "172.33.109.187", origin: "http://172.33.109.187:3000", port: "3000" }),
        dev: true,
      }),
    ).toEqual(["http://172.33.109.187:4100", "http://172.33.109.187:3000"])
  })
})
