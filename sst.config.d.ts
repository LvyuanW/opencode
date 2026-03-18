/* Fallback SST globals for local editing.
 *
 * The full SST platform types are normally generated into .sst/platform/config.d.ts
 * after running `bun sst install` / `bun sst dev`. This lightweight shim keeps the
 * config and infra files typeable in editors even when that generated directory does
 * not exist yet.
 */

type Val = string | number | boolean | null | undefined
type Out = {
  [key: string]: Out | Val
  apply<T>(fn: (value: string | undefined) => T): T
}
type Ctor = new (...args: unknown[]) => Out

declare const $config: <T extends { app(input?: { stage?: string }): unknown; run(): unknown }>(cfg: T) => T
declare const $app: {
  name?: string
  stage?: string
}
declare const $dev: boolean
declare const $resolve: (...args: unknown[]) => Out
declare function $interpolate(parts: TemplateStringsArray, ...args: unknown[]): string

declare const sst: {
  Secret: Ctor
  Linkable: Ctor
  StaticSite: Ctor
  x: {
    DevCommand: Ctor
  }
  cloudflare: {
    Bucket: Ctor
    Kv: Ctor
    StaticSite: Ctor
    Worker: Ctor
    DEFAULT_ACCOUNT_ID: string
    x: {
      Astro: Ctor
      SolidStart: Ctor
    }
  }
}
declare const cloudflare: {
  RegionalHostname: Ctor
}
declare const stripe: {
  WebhookEndpoint: Ctor
  Product: Ctor
  Coupon: Ctor
  Price: Ctor
}
declare const planetscale: {
  getDatabaseOutput: (...args: unknown[]) => Out
  getBranchOutput: (...args: unknown[]) => Out
  Branch: Ctor
  Password: Ctor
}
