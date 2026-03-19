import { test, expect } from "../fixtures"
import { promptSelector } from "../selectors"

test("dropping text/plain file: uri inserts a file pill", async ({ page, gotoSession }) => {
  await gotoSession()

  const prompt = page.locator(promptSelector)
  await prompt.click()

  const path = process.platform === "win32" ? "C:\\opencode-e2e-drop.txt" : "/tmp/opencode-e2e-drop.txt"
  const dt = await page.evaluateHandle((input) => {
    const dt = new DataTransfer()
    dt.setData("text/plain", input.text)
    dt.setData("text/uri-list", input.uri)
    return dt
  }, {
    text: `file:${path}`,
    uri: `file://${path.replaceAll("\\", "/")}`,
  })

  await page.dispatchEvent(promptSelector, "drop", { dataTransfer: dt })

  const pill = page.locator(`${promptSelector} [data-type="file"]`).first()
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute("data-path", path)
})
