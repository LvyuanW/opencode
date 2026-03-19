import { base64Decode } from "@opencode-ai/util/encode"
import { slugFromUrl } from "../actions"
import { test, expect } from "../fixtures"
import { promptSelector } from "../selectors"
import { createSdk } from "../utils"

test("writer file tree drops a file on blank panel area to move it to root", async ({ page, withProject }) => {
  await withProject(async ({ gotoSession }) => {
    await gotoSession()

    const panel = page.locator("#file-tree-panel")
    const tabs = panel.locator('[data-component="tabs"][data-variant="pill"][data-scope="filetree"]')
    await expect(tabs).toBeVisible()

    const all = tabs.getByRole("tab", { name: /all drafts/i }).first()
    await all.click()
    await expect(all).toHaveAttribute("aria-selected", "true")

    const slug = slugFromUrl(page.url())
    if (!slug) throw new Error("Missing project slug in url")

    const dir = base64Decode(slug)
    const sdk = createSdk(dir)
    const id = Date.now()
    const folder = `drag-folder-${id}`
    const name = `drag-file-${id}.txt`
    const nested = `${folder}/${name}`

    await sdk.file.create({ fileCreateInput: { path: folder, type: "directory" } })
    await sdk.file.create({ fileCreateInput: { path: nested, type: "file" } })

    const tree = panel.locator('[data-component="filetree"]').first()
    await expect(tree).toBeVisible()

    const folderNode = panel.getByRole("button", { name: folder, exact: true }).first()
    await expect(folderNode).toBeVisible()
    if ((await folderNode.getAttribute("aria-expanded")) === "false") await folderNode.click()
    await expect(folderNode).toHaveAttribute("aria-expanded", "true")

    const fileNode = panel.getByRole("button", { name, exact: true }).first()
    await expect(fileNode).toBeVisible()

    const dt = await page.evaluateHandle((input) => {
      const dt = new DataTransfer()
      dt.setData("application/x-opencode-filetree-path", input.path)
      dt.setData("text/plain", `file:${input.path}`)
      dt.setData("text/uri-list", input.uri)
      return dt
    }, {
      path: nested,
      uri: `file://${nested.replaceAll("\\", "/")}`,
    })

    await tree.dispatchEvent("dragover", { dataTransfer: dt })
    await tree.dispatchEvent("drop", { dataTransfer: dt })

    await expect
      .poll(async () => {
        const [root, child] = await Promise.all([
          sdk.file.list({ path: "" }).then((x) => x.data ?? []),
          sdk.file.list({ path: folder }).then((x) => x.data ?? []),
        ])
        const moved = root.some((item) => item.path === name && item.type === "file")
        const nestedStill = child.some((item) => item.path === nested && item.type === "file")
        return moved && !nestedStill
      })
      .toBe(true)

    await expect(page.locator(`${promptSelector} [data-type="file"]`)).toHaveCount(0)
  })
})
