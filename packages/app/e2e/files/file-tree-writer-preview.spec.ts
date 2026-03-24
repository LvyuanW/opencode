import { base64Decode } from "@opencode-ai/util/encode"
import { test, expect } from "../fixtures"
import { slugFromUrl } from "../actions"
import { promptSelector } from "../selectors"
import { createSdk } from "../utils"

test("writer file tree opens drafts in preview mode by default", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "opencode.global.dat:model",
      JSON.stringify({
        recent: [{ providerID: "opencode", modelID: "big-pickle" }],
        user: [],
        variant: {},
      }),
    )
  })

  const id = `preview-${Date.now()}`
  await page.goto("/")

  const box = page.getByRole("textbox", { name: /id/i }).first()
  await expect(box).toBeVisible()
  await box.fill(id)
  await box.press("Enter")

  await expect(page).toHaveURL(/\/session(?:[/?#]|$)/)
  await expect(page.locator(promptSelector)).toBeVisible()

  const slug = slugFromUrl(page.url())
  if (!slug) throw new Error("Missing project slug in url")

  const dir = base64Decode(slug)
  const sdk = createSdk(dir)
  const file = `preview-file-${Date.now()}.md`

  await sdk.file.create({ fileCreateInput: { path: file, type: "file" } })
  await sdk.file.write({
    fileWriteInput: {
      path: file,
      content: "# Draft title\n\nPreview body",
    },
  })

  try {
    const panel = page.locator("#file-tree-panel")
    const tabs = panel.locator('[data-component="tabs"][data-variant="pill"][data-scope="filetree"]')
    await expect(tabs).toBeVisible()

    const all = tabs.getByRole("tab", { name: /all drafts/i }).first()
    await all.click()
    await expect(all).toHaveAttribute("aria-selected", "true")

    const node = panel.getByRole("button", { name: file, exact: true }).first()
    await expect(node).toBeVisible()
    await node.click()

    const tab = page.getByRole("tab", { name: file }).first()
    await expect(tab).toBeVisible()
    await expect(tab).toHaveAttribute("aria-selected", "true")

    const preview = page.locator('[data-component="session-file-preview-shell"]').first()
    await expect(preview).toBeVisible()
    await expect(page.locator('[data-component="session-file-editor"][data-writer-mode="true"]')).toHaveCount(0)
    await expect(preview).toContainText("Draft title")
    await expect(preview).toContainText("Preview body")
  } finally {
    await sdk.file.delete({ path: file }).catch(() => undefined)
  }
})
