import { base64Decode } from "@opencode-ai/util/encode"
import { slugFromUrl } from "../actions"
import { test, expect } from "../fixtures"
import { promptSelector } from "../selectors"
import { createSdk } from "../utils"

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

test("smoke @mention inserts file pill token", async ({ page, withProject }) => {
  await withProject(async ({ gotoSession }) => {
    await gotoSession()

    const slug = slugFromUrl(page.url())
    if (!slug) throw new Error("Missing project slug in url")

    const dir = base64Decode(slug)
    const sdk = createSdk(dir)
    const file = `mention-file-${Date.now()}.txt`
    const pattern = new RegExp(escape(file))

    await sdk.file.create({ fileCreateInput: { path: file, type: "file" } })

    await page.locator(promptSelector).click()
    await page.keyboard.type(`@${file}`)

    const suggestion = page.getByRole("button", { name: pattern }).first()
    await expect(suggestion).toBeVisible()
    await suggestion.hover()

    await page.keyboard.press("Tab")

    const pill = page.locator(`${promptSelector} [data-type="file"]`).first()
    await expect(pill).toBeVisible()
    await expect(pill).toHaveAttribute("data-path", file)

    await page.keyboard.type(" ok")
    await expect(page.locator(promptSelector)).toContainText("ok")
  })
})
