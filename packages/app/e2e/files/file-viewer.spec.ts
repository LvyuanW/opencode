import { test, expect } from "../fixtures"
import { promptSelector } from "../selectors"
import { modKey } from "../utils"

test("smoke file viewer renders real file content", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.locator(promptSelector).click()
  await page.keyboard.type("/open")

  const command = page.locator('[data-slash-id="file.open"]').first()
  await expect(command).toBeVisible()
  await page.keyboard.press("Enter")

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder(/search files/i) })
    .first()
  await expect(dialog).toBeVisible()

  const input = dialog.getByRole("textbox").first()
  await input.fill("package.json")

  const items = dialog.locator('[data-slot="list-item"][data-key^="file:"]')
  let index = -1
  await expect
    .poll(
      async () => {
        const keys = await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key") ?? ""))
        index = keys.findIndex((key) => /packages[\\/]+app[\\/]+package\.json$/i.test(key.replace(/^file:/, "")))
        return index >= 0
      },
      { timeout: 30_000 },
    )
    .toBe(true)

  const item = items.nth(index)
  await expect(item).toBeVisible()
  await item.click()

  await expect(dialog).toHaveCount(0)

  const tab = page.getByRole("tab", { name: "package.json" })
  await expect(tab).toBeVisible()
  await tab.click()

  const viewer = page.locator('[data-component="file"][data-mode="text"]').first()
  await expect(viewer).toBeVisible()
  await expect(viewer.getByText(/"name"\s*:\s*"@opencode-ai\/app"/)).toBeVisible()
})

test("cmd+f opens text viewer search while prompt is focused", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.locator(promptSelector).click()
  await page.keyboard.type("/open")

  const command = page.locator('[data-slash-id="file.open"]').first()
  await expect(command).toBeVisible()
  await page.keyboard.press("Enter")

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder(/search files/i) })
    .first()
  await expect(dialog).toBeVisible()

  const input = dialog.getByRole("textbox").first()
  await input.fill("package.json")

  const items = dialog.locator('[data-slot="list-item"][data-key^="file:"]')
  let index = -1
  await expect
    .poll(
      async () => {
        const keys = await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key") ?? ""))
        index = keys.findIndex((key) => /packages[\\/]+app[\\/]+package\.json$/i.test(key.replace(/^file:/, "")))
        return index >= 0
      },
      { timeout: 30_000 },
    )
    .toBe(true)

  const item = items.nth(index)
  await expect(item).toBeVisible()
  await item.click()

  await expect(dialog).toHaveCount(0)

  const tab = page.getByRole("tab", { name: "package.json" })
  await expect(tab).toBeVisible()
  await tab.click()

  const viewer = page.locator('[data-component="file"][data-mode="text"]').first()
  await expect(viewer).toBeVisible()

  await page.locator(promptSelector).click()
  await page.keyboard.press(`${modKey}+f`)

  const findInput = page.getByPlaceholder("Find")
  await expect(findInput).toBeVisible()
  await expect(findInput).toBeFocused()
})

test("cmd+f opens text viewer search while prompt is not focused", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.locator(promptSelector).click()
  await page.keyboard.type("/open")

  const command = page.locator('[data-slash-id="file.open"]').first()
  await expect(command).toBeVisible()
  await page.keyboard.press("Enter")

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder(/search files/i) })
    .first()
  await expect(dialog).toBeVisible()

  const input = dialog.getByRole("textbox").first()
  await input.fill("package.json")

  const items = dialog.locator('[data-slot="list-item"][data-key^="file:"]')
  let index = -1
  await expect
    .poll(
      async () => {
        const keys = await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key") ?? ""))
        index = keys.findIndex((key) => /packages[\\/]+app[\\/]+package\.json$/i.test(key.replace(/^file:/, "")))
        return index >= 0
      },
      { timeout: 30_000 },
    )
    .toBe(true)

  const item = items.nth(index)
  await expect(item).toBeVisible()
  await item.click()

  await expect(dialog).toHaveCount(0)

  const tab = page.getByRole("tab", { name: "package.json" })
  await expect(tab).toBeVisible()
  await tab.click()

  const viewer = page.locator('[data-component="file"][data-mode="text"]').first()
  await expect(viewer).toBeVisible()

  await viewer.click()
  await page.keyboard.press(`${modKey}+f`)

  const findInput = page.getByPlaceholder("Find")
  await expect(findInput).toBeVisible()
  await expect(findInput).toBeFocused()
})

test("file viewer keeps inline comment editor clear of the file tree", async ({ page, gotoSession }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await gotoSession()

  await page.locator(promptSelector).click()
  await page.keyboard.type("/open")

  const command = page.locator('[data-slash-id="file.open"]').first()
  await expect(command).toBeVisible()
  await page.keyboard.press("Enter")

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder(/search files/i) })
    .first()
  await expect(dialog).toBeVisible()

  const input = dialog.getByRole("textbox").first()
  await input.fill("package.json")

  const items = dialog.locator('[data-slot="list-item"][data-key^="file:"]')
  let index = -1
  await expect
    .poll(
      async () => {
        const keys = await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key") ?? ""))
        index = keys.findIndex((key) => /packages[\\/]+app[\\/]+package\.json$/i.test(key.replace(/^file:/, "")))
        return index >= 0
      },
      { timeout: 30_000 },
    )
    .toBe(true)

  const item = items.nth(index)
  await expect(item).toBeVisible()
  await item.click()

  await expect(dialog).toHaveCount(0)

  const tab = page.getByRole("tab", { name: "package.json" })
  await expect(tab).toBeVisible()
  await tab.click()

  const viewer = page.locator('[data-component="file"][data-mode="text"]').first()
  await expect(viewer).toBeVisible()

  const line = viewer.locator('[data-line="2"]').first()
  await expect(line).toBeVisible()
  await line.hover()

  const add = viewer.getByRole("button", { name: /^Comment$/ }).first()
  await expect(add).toBeVisible()
  await add.click()

  const pop = viewer.locator('[data-slot="line-comment-popover"][data-inline-body]').first()
  const area = viewer.locator('[data-slot="line-comment-textarea"]').first()
  const tree = page.locator("#file-tree-panel").first()
  await expect(pop).toBeVisible()
  await expect(area).toBeVisible()
  await expect(tree).toBeVisible()

  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([pop.boundingBox(), tree.boundingBox()])
        if (!a || !b) return Number.POSITIVE_INFINITY
        return a.x + a.width - b.x
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(-4)
})
