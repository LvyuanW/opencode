/// <reference path="./sst.config.d.ts" />

export default $config({
  app(input) {
    const stage = input?.stage
    return {
      name: "opencode",
      removal: stage === "production" ? "retain" : "remove",
      protect: stage === "production",
      home: "cloudflare",
      providers: {
        stripe: {
          apiKey: process.env.STRIPE_SECRET_KEY!,
        },
        planetscale: "0.4.1",
      },
    }
  },
  async run() {
    await import("./infra/app.js")
    await import("./infra/console.js")
    await import("./infra/enterprise.js")
  },
})
