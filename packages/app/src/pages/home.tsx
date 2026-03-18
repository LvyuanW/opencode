import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { getFilename } from "@opencode-ai/util/path"

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const settings = useSettings()
  const homedir = createMemo(() => sync.data.path.home)
  const writer = createMemo(() => settings.general.workspaceMode() === "writer")
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })

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
      } else if (result) {
        openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
  }

  return (
    <div data-component="home-page" data-writer-mode={writer() ? "true" : "false"} class="mx-auto mt-24 w-full max-w-4xl px-4 md:mt-28">
      <Show
        when={writer()}
        fallback={<Logo class="md:w-xl opacity-12" />}
      >
        <div data-component="writer-home-hero" class="mx-auto max-w-3xl text-center">
          <div data-component="writer-home-kicker" class="text-12-medium uppercase tracking-[0.18em] text-text-weak">
            Mantur Editor
          </div>
          <div data-component="writer-home-title" class="mt-4 text-text-strong">
            {language.t("session.new.title.writer")}
          </div>
          <div data-component="writer-home-subtitle" class="mx-auto mt-3 max-w-xl text-14-regular text-text-base">
            {language.t("home.empty.description")}
          </div>
        </div>
      </Show>
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
