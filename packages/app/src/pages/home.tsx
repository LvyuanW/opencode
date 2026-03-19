import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Logo } from "@opencode-ai/ui/logo"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { writerUser } from "@/utils/writer-path"

export default function Home() {
  const sync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const settings = useSettings()
  const [id, setId] = createSignal("")
  const [err, setErr] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const homedir = createMemo(() => sync.data.path.home)
  const writer = createMemo(() => settings.general.workspaceMode() === "writer")
  const landing = createMemo(() => writer() && platform.platform === "web")
  const root = createMemo(
    () => sync.data.path.worktree || sync.data.path.directory || server.projects.last() || sync.data.project[0]?.worktree || "",
  )
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })
  const hero = () => (
    <div data-component="writer-home-hero" class="mx-auto text-center">
      <div class="flex items-center justify-center gap-4">
        <div class="h-px w-12 bg-border-weaker-base" />
        <div data-component="writer-home-kicker" class="uppercase text-text-weak">
          Mantur Editor
        </div>
        <div class="h-px w-12 bg-border-weaker-base" />
      </div>
      <div
        data-component="writer-home-title"
        class="mt-5 text-[clamp(1.8rem,4.6vw,3.1rem)] font-medium leading-[1.06] tracking-[-0.03em] text-text-strong"
      >
        {language.t("session.new.title.writer")}
      </div>
    </div>
  )

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory)
        }
        return
      }
      if (!result) return
      openProject(result)
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
      return
    }

    dialog.show(
      () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
      () => resolve(null),
    )
  }

  const enter = async () => {
    if (busy()) return

    const value = id().trim()
    if (!value) {
      setErr(language.t("writer.home.required"))
      return
    }

    const dir = root()
    if (!dir) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: language.t("writer.home.unavailable"),
      })
      return
    }

    const next = writerUser(dir, value)
    setBusy(true)
    await globalSDK
      .createClient({
        directory: next,
        throwOnError: true,
      })
      .file.list({ path: "" })
      .then(() => {
        for (const project of layout.projects.list()) {
          layout.projects.close(project.worktree)
        }
        layout.projects.open(next)
        server.projects.touch(next)
        navigate(`/${base64Encode(next)}/session`)
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : language.t("writer.home.unavailable"),
        })
      })
      .finally(() => setBusy(false))
  }

  if (landing()) {
    return (
      <div
        data-component="writer-home-page"
        class="mx-auto flex size-full max-w-4xl flex-col items-center justify-center px-6"
      >
        <div class="w-full max-w-lg">
          {hero()}
          <div class="mx-auto mt-10 max-w-md">
            <TextField
              autofocus
              value={id()}
              label="ID"
              placeholder={language.t("writer.home.placeholder")}
              error={err()}
              disabled={busy()}
              onChange={(value) => {
                setId(value)
                if (err()) setErr("")
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key !== "Enter" || event.isComposing) return
                event.preventDefault()
                void enter()
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-component="home-page"
      data-writer-mode={writer() ? "true" : "false"}
      class="mx-auto mt-24 w-full max-w-4xl px-4 md:mt-28"
    >
      <Switch>
        <Match when={writer()}>
          {hero()}
        </Match>
        <Match when={true}>
          <Logo class="md:w-xl opacity-12" />
        </Match>
      </Switch>
      <Switch>
        <Match when={sync.data.project.length > 0}>
          <div class="mt-14 w-full flex flex-col gap-4">
            <div class="flex gap-2 items-center justify-between pl-3">
              <div class="text-14-medium text-text-strong">{language.t("home.recentProjects")}</div>
              <Button icon="folder-add-left" size="normal" class="pl-2 pr-3" onClick={chooseProject}>
                {language.t("command.project.open")}
              </Button>
            </div>
            <ul data-component="writer-home-list" class="flex flex-col gap-3">
              <For each={recent()}>
                {(project) => (
                  <Button
                    size="large"
                    variant="ghost"
                    class="text-left justify-between px-4 py-4"
                    onClick={() => openProject(project.worktree)}
                  >
                    <div class="min-w-0 flex flex-col items-start gap-1">
                      <span class={writer() ? "text-14-medium text-text-strong" : "text-14-mono text-text-strong"}>
                        {writer()
                          ? project.name || getFilename(project.worktree)
                          : project.worktree.replace(homedir(), "~")}
                      </span>
                      <Show when={writer()}>
                        <div class="text-12-regular text-text-weak truncate max-w-full">
                          {project.worktree.replace(homedir(), "~")}
                        </div>
                      </Show>
                    </div>
                    <div class="text-14-regular text-text-weak shrink-0">
                      {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                    </div>
                  </Button>
                )}
              </For>
            </ul>
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-20 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="large" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
            </div>
            <Button class="px-3 mt-1" onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
