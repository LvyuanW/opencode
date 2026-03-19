import { For, Show, createMemo, createSignal } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { getDirectory } from "@opencode-ai/util/path"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { writerSkills } from "@/utils/writer-path"

const root = ".skills"

export function DialogWriterSkills() {
  const sync = useSync()
  const sdk = useSDK()
  const file = useFile()
  const language = useLanguage()
  const [busy, setBusy] = createSignal(false)
  let dirInput: HTMLInputElement | undefined
  let fileInput: HTMLInputElement | undefined

  const skills = createMemo(() => (sync.data.skill ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)))
  const base = createMemo(() => writerSkills(sdk.directory).replace(/\\/g, "/"))

  const rel = (input: string) => {
    const value = input.replace(/\\/g, "/")
    if (value === base()) return root
    if (value.startsWith(base() + "/")) return `${root}/${value.slice(base().length + 1)}`
    return value
  }

  const safe = (input: string) => {
    const name = input.replace(/\.[^.]+$/, "").trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-")
    return name || "skill"
  }

  const refresh = () =>
    Promise.all([sdk.client.app.skills(), sdk.client.command.list()]).then(([skills, commands]) => {
      sync.set("skill", skills.data ?? [])
      sync.set("command", commands.data ?? [])
    })

  const fail = (title: string, error: unknown) =>
    showToast({
      variant: "error",
      title,
      description: error instanceof Error ? error.message : language.t("common.requestFailed"),
    })

  const upload = (list: File[], folder: boolean) => {
    if (list.length === 0 || busy()) return

    const has = folder
      ? list.some((item) => (item.webkitRelativePath || item.name).split("/").at(-1) === "SKILL.md")
      : true
    if (!has) {
      showToast({
        title: language.t("writer.skills.upload.invalid.title"),
        description: language.t("writer.skills.upload.invalid.description"),
      })
      return
    }

    setBusy(true)
    void Promise.all(
      list.map(async (item) => {
        const path = folder
          ? `${root}/${(item.webkitRelativePath || item.name).replace(/^\/+/, "")}`
          : `${root}/${safe(item.name)}/SKILL.md`
        await file.write(path, await item.text())
      }),
    )
      .then(refresh)
      .then(() => {
        showToast({
          title: language.t("writer.skills.upload.success.title"),
          description: language.t("writer.skills.upload.success.description"),
        })
      })
      .catch((error) => fail(language.t("writer.skills.upload.failed.title"), error))
      .finally(() => setBusy(false))
  }

  const drop = (input: { location: string }) => {
    if (busy()) return
    const path = rel(input.location)
    const dir = getDirectory(path)
    const target = dir && dir !== "." && dir !== root ? dir : path

    setBusy(true)
    void file
      .remove(target)
      .then(refresh)
      .then(() => {
        showToast({
          title: language.t("writer.skills.delete.success.title"),
          description: language.t("writer.skills.delete.success.description"),
        })
      })
      .catch((error) => fail(language.t("writer.skills.delete.failed.title"), error))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={language.t("writer.skills.title")} class="w-full max-w-[640px] mx-auto">
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <div class="flex flex-col gap-1">
          <div class="text-12-regular text-text-weak">{language.t("writer.skills.description")}</div>
          <div class="text-11-regular text-text-subtle">{language.t("writer.skills.root", { path: root })}</div>
        </div>
        <div class="flex items-center justify-end gap-2">
          <Button size="small" variant="secondary" disabled={busy()} onClick={() => dirInput?.click()}>
            {busy() ? language.t("writer.skills.uploading") : language.t("writer.skills.upload.folder")}
          </Button>
          <Button size="small" variant="ghost" disabled={busy()} onClick={() => fileInput?.click()}>
            {language.t("writer.skills.upload.file")}
          </Button>
        </div>
        <Show
          when={skills().length > 0}
          fallback={
            <div class="rounded-xl bg-surface-base px-3 py-3 text-12-regular text-text-weak">
              {language.t("writer.skills.empty")}
            </div>
          }
        >
          <div class="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-3">
            <For each={skills()}>
              {(skill) => (
                <div class="rounded-xl bg-surface-base px-3 py-3 flex items-start gap-3">
                  <Icon name="brain" size="small" class="mt-0.5 shrink-0 text-icon-info-active" />
                  <div class="min-w-0 flex-1 flex flex-col gap-1">
                    <div class="text-13-medium text-text-strong break-words">{skill.name}</div>
                    <Show when={skill.description}>
                      <div class="text-12-regular text-text-weak break-words">{skill.description}</div>
                    </Show>
                    <div class="text-11-regular text-text-subtle break-all">{rel(skill.location)}</div>
                  </div>
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    class="shrink-0"
                    disabled={busy()}
                    onClick={() => drop(skill)}
                    aria-label={language.t("common.delete")}
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
        <input
          ref={(el) => {
            dirInput = el
            el.setAttribute("webkitdirectory", "")
            el.setAttribute("directory", "")
          }}
          type="file"
          multiple
          class="hidden"
          onChange={(e) => {
            const list = Array.from(e.currentTarget.files ?? [])
            upload(list, true)
            e.currentTarget.value = ""
          }}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".md,.markdown,text/markdown,text/plain"
          class="hidden"
          onChange={(e) => {
            const list = Array.from(e.currentTarget.files ?? [])
            upload(list, false)
            e.currentTarget.value = ""
          }}
        />
      </div>
    </Dialog>
  )
}
