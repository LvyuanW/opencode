import { base64Decode } from "@opencode-ai/util/encode"
import { slugFromUrl } from "../actions"
import { test, expect } from "../fixtures"
import { createSdk } from "../utils"

test("writer file tree can create a folder", async ({ page, gotoSession }) => {
  await gotoSession()

  const panel = page.locator("#file-tree-panel")
  const tabs = panel.locator('[data-component="tabs"][data-variant="pill"][data-scope="filetree"]')

  await expect(tabs).toBeVisible()

  const all = tabs.getByRole("tab", { name: /all drafts/i }).first()
  await expect(all).toBeVisible()
  await all.click()
  await expect(all).toHaveAttribute("aria-selected", "true")

  const body = tabs.locator('[data-slot="tabs-content"]:not([hidden])').first()
  await expect(body).toBeVisible()

  await body.click({ button: "right", position: { x: 24, y: 220 } })

  const folder = page.getByRole("menuitem", { name: /new folder/i }).first()
  await expect(folder).toBeVisible()
  await folder.click()

  const dlg = page.getByRole("dialog").first()
  await expect(dlg).toBeVisible()

  const name = `e2e-folder-${Date.now()}`
  await dlg.getByLabel(/name/i).fill(name)
  await expect(dlg.getByRole("button", { name: /create/i })).toBeEnabled()
  await dlg.getByRole("button", { name: /create/i }).click()
  await expect(dlg).toHaveCount(0)

  const slug = slugFromUrl(page.url())
  if (!slug) throw new Error("Missing project slug in url")
  const dir = base64Decode(slug)
  const sdk = createSdk(dir)

  await expect
    .poll(async () => {
      const list = await sdk.file.list({ path: "" }).then((x) => x.data ?? [])
      return list.some((item) => item.path === name && item.type === "directory")
    })
    .toBe(true)

  const node = tabs.getByRole("button", { name, exact: true }).first()
  await expect(node).toBeVisible()
})
