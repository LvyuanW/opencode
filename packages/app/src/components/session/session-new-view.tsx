import { For, Show, createMemo, createSignal } from "solid-js"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { useFile } from "@/context/file"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { writerSkills } from "@/utils/writer-path"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"
const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const sdk = useSDK()
  const file = useFile()
  const language = useLanguage()
  const settings = useSettings()
  const [busy, setBusy] = createSignal(false)
  let dirInput: HTMLInputElement | undefined
  let fileInput: HTMLInputElement | undefined

  const sandboxes = createMemo(() => sync.project?.sandboxes ?? [])
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE])
  const writer = createMemo(() => settings.general.workspaceMode() === "writer")
  const skills = createMemo(() => (sync.data.skill ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)))
  const skillRoot = createMemo(() => writerSkills(sdk.directory))
  const current = createMemo(() => {
    const selection = props.worktree
    if (options().includes(selection)) return selection
    return MAIN_WORKTREE
  })
  const projectRoot = createMemo(() => sync.project?.worktree ?? sdk.directory)
  const isWorktree = createMemo(() => {
    const project = sync.project
    if (!project) return false
    return sdk.directory !== project.worktree
  })

  const label = (value: string) => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main")
      const branch = sync.data.vcs?.branch
      if (branch) return language.t("session.new.worktree.mainWithBranch", { branch })
      return language.t("session.new.worktree.main")
    }

    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create")

    return getFilename(value)
  }

  const rel = (input: string) => {
    const root = skillRoot().replace(/\\/g, "/")
    const value = input.replace(/\\/g, "/")
    if (value === root) return ".skills"
    if (value.startsWith(root + "/")) return `.skills/${value.slice(root.length + 1)}`
    return value
  }

  const safe = (input: string) => {
    const name = input.replace(/\.[^.]+$/, "").trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-")
    return name || "skill"
  }

  const refresh = async () => {
    const [skills, commands] = await Promise.all([sdk.client.app.skills(), sdk.client.command.list()])
    sync.set("skill", skills.data ?? [])
    sync.set("command", commands.data ?? [])
  }

  const upload = async (list: File[], folder: boolean) => {
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
    try {
      await Promise.all(
        list.map(async (item) => {
          const path = folder
            ? `${".skills"}/${(item.webkitRelativePath || item.name).replace(/^\/+/, "")}`
            : `${".skills"}/${safe(item.name)}/SKILL.md`
          await file.write(path, await item.text())
        }),
      )
      await refresh()
      showToast({
        title: language.t("writer.skills.upload.success.title"),
        description: language.t("writer.skills.upload.success.description"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("writer.skills.upload.failed.title"),
        description: error instanceof Error ? error.message : language.t("common.requestFailed"),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-center justify-center text-center">
        <div class="w-full max-w-200 flex flex-col items-center text-center gap-4">
          <div class="flex flex-col items-center">
            <div class="text-20-medium text-text-strong">
              {language.t(writer() ? "session.new.title.writer" : "session.new.title")}
            </div>
          </div>
          <div class="w-full flex flex-col gap-4 items-center">
            <Show
              when={writer()}
              fallback={
                <>
                  <div class="flex items-start justify-center gap-3 min-h-5">
                    <div class="text-12-medium text-text-weak select-text leading-5 min-w-0 max-w-160 break-words text-center">
                      {getDirectory(projectRoot())}
                      <span class="text-text-strong">{getFilename(projectRoot())}</span>
                    </div>
                  </div>
                  <div class="flex items-start justify-center gap-1.5 min-h-5">
                    <Icon name="branch" size="small" class="mt-0.5 shrink-0" />
                    <div class="text-12-medium text-text-weak select-text leading-5 min-w-0 max-w-160 break-words text-center">
                      {label(current())}
                    </div>
                  </div>
                </>
              }
            >
              <div class="flex items-start justify-center gap-3 min-h-5">
                <div class="text-12-medium text-text-weak leading-5 min-w-0 max-w-160 break-words text-center">
                  <span class="text-text-strong">{getFilename(projectRoot())}</span>
                </div>
              </div>
            </Show>
            <Show when={sync.project}>
              {(project) => (
                <div class="flex items-start justify-center gap-3 min-h-5">
                  <div class="text-12-medium text-text-weak leading-5 min-w-0 max-w-160 break-words text-center">
                    {language.t("session.new.lastModified")}&nbsp;
                    <span class="text-text-strong">
                      {DateTime.fromMillis(project().time.updated ?? project().time.created)
                        .setLocale(language.intl())
                        .toRelative()}
                    </span>
                  </div>
                </div>
              )}
            </Show>
            <Show when={writer()}>
              <div class="w-full max-w-180 rounded-[20px] border border-border-base bg-surface-raised-base px-4 py-4 text-left">
                <div class="flex flex-col gap-4">
                  <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div class="flex flex-col gap-1">
                      <div class="text-14-medium text-text-strong">{language.t("writer.skills.title")}</div>
                      <div class="text-12-regular text-text-weak">{language.t("writer.skills.description")}</div>
                      <div class="text-11-regular text-text-subtle">
                        {language.t("writer.skills.root", { path: ".skills" })}
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <Button size="small" variant="secondary" disabled={busy()} onClick={() => dirInput?.click()}>
                        {busy() ? language.t("writer.skills.uploading") : language.t("writer.skills.upload.folder")}
                      </Button>
                      <Button size="small" variant="ghost" disabled={busy()} onClick={() => fileInput?.click()}>
                        {language.t("writer.skills.upload.file")}
                      </Button>
                    </div>
                  </div>
                  <Show
                    when={skills().length > 0}
                    fallback={<div class="rounded-xl bg-surface-base px-3 py-3 text-12-regular text-text-weak">{language.t("writer.skills.empty")}</div>}
                  >
                    <div class="flex flex-col gap-2">
                      <For each={skills()}>
                        {(skill) => (
                          <div class="rounded-xl bg-surface-base px-3 py-3 flex flex-col gap-1.5">
                            <div class="flex items-center gap-2">
                              <Icon name="brain" size="small" class="shrink-0 text-icon-info-active" />
                              <div class="text-13-medium text-text-strong">/{skill.name}</div>
                            </div>
                            <Show when={skill.description}>
                              <div class="text-12-regular text-text-weak">{skill.description}</div>
                            </Show>
                            <div class="text-11-regular text-text-subtle">{rel(skill.location)}</div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
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
                    void upload(list, true)
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
                    void upload(list, false)
                    e.currentTarget.value = ""
                  }}
                />
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
