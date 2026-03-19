import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import type { FileDiff, FileNode } from "@opencode-ai/sdk/v2"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Mark } from "@opencode-ai/ui/logo"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { useDialog } from "@opencode-ai/ui/context/dialog"

import FileTree from "@/components/file-tree"
import { SessionContextUsage } from "@/components/session-context-usage"
import { DialogSelectFile } from "@/components/dialog-select-file"
import { SessionContextTab, SortableTab, FileVisual } from "@/components/session"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import { createOpenSessionFileTab, createSessionTabs, getTabReorderIndex, type Sizing } from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { attachmentMime, TEXT_FILE_TYPES } from "@/components/prompt-input/files"

export function SessionSidePanel(props: {
  reviewPanel: () => JSX.Element
  review: boolean
  writer: boolean
  reviewDiffs?: () => FileDiff[]
  reviewCount?: () => number
  reviewHas?: () => boolean
  reviewReady?: () => boolean
  reviewEmpty?: () => string
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
}) {
  const layout = useLayout()
  const sync = useSync()
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const { params, sessionKey, tabs, view } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")

  const reviewKey = (code: string, prose: string) => (props.writer ? prose : code)
  const fileKey = (code: string, prose: string) => (props.writer ? prose : code)
  const previewOpen = createMemo(() => {
    if (!isDesktop()) return false
    if (props.writer) return layout.fileTree.opened() || view().reviewPanel.opened()
    if (!props.review) return layout.fileTree.opened()
    return view().reviewPanel.opened()
  })
  const fileOpen = createMemo(() => isDesktop() && layout.fileTree.opened())
  const open = createMemo(() => previewOpen() || fileOpen())
  const reviewTab = createMemo(() => props.review && isDesktop())
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    if (previewOpen()) return `calc(100% - ${layout.session.width()}px)`
    return `${layout.fileTree.width()}px`
  })
  const treeWidth = createMemo(() => (fileOpen() ? `${layout.fileTree.width()}px` : "0px"))

  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const sessionDiffs = createMemo(() => (params.id ? (sync.data.session_diff[params.id] ?? []) : []))
  const diffs = createMemo(() => props.reviewDiffs?.() ?? sessionDiffs())
  const reviewCount = createMemo(() => props.reviewCount?.() ?? Math.max(info()?.summary?.files ?? 0, sessionDiffs().length))
  const hasReview = createMemo(() => props.reviewHas?.() ?? reviewCount() > 0)
  const diffsReady = createMemo(() => {
    if (props.reviewReady) return props.reviewReady()
    const id = params.id
    if (!id) return true
    if (!hasReview()) return true
    return sync.data.session_diff[id] !== undefined
  })

  const reviewEmptyKey = createMemo(() => {
    if (sync.project && !sync.project.vcs) return reviewKey("session.review.noVcs", "session.revision.unavailable")
    if (sync.data.config.snapshot === false) return reviewKey("session.review.noSnapshot", "session.revision.noSnapshot")
    return reviewKey("session.review.noChanges", "session.revision.noChanges")
  })
  const reviewEmpty = createMemo(() => props.reviewEmpty?.() ?? language.t(reviewEmptyKey()))
  const hidden = createMemo(() => (props.writer ? [".skills"] : undefined))
  const roots = createMemo(() => file.tree.children("").filter((node) => !(props.writer && node.name === ".skills")))
  const [busy, setBusy] = createSignal(false)
  let uploadInput: HTMLInputElement | undefined

  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (p: string) => p.replaceAll("\\\\", "/").replace(/\/+$/, "")

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return roots().length === 0
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (props.writer) {
      layout.fileTree.open()
      view().reviewPanel.open()
      layout.fileTree.setTab("all")
      return
    }
    if (!props.review) {
      layout.fileTree.open()
      layout.fileTree.setTab("all")
      return
    }
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview,
  })
  const contextOpen = tabState.contextOpen
  const openedTabs = tabState.openedTabs
  const activeTab = tabState.activeTab
  const activeFileTab = tabState.activeFileTab

  const fileTreeTab = () => layout.fileTree.tab()

  const setFileTreeTabValue = (value: string) => {
    if (props.writer && value !== "all") return
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const showAllFiles = () => {
    layout.fileTree.open()
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  createEffect(() => {
    if (!props.writer) return
    if (!contextOpen()) return
    tabs().close("context")
  })

  createEffect(() => {
    if (props.writer && fileTreeTab() === "changes") {
      layout.fileTree.setTab("all")
      return
    }
    if (reviewTab()) return
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  })

  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
  })

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const currentTabs = tabs().all()
    const toIndex = getTabReorderIndex(currentTabs, draggable.id.toString(), droppable.id.toString())
    if (toIndex === undefined) return
    tabs().move(draggable.id.toString(), toIndex)
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  const parent = (path: string) => {
    const idx = path.lastIndexOf("/")
    if (idx === -1) return ""
    return path.slice(0, idx)
  }

  const leaf = (path: string) => {
    const idx = path.lastIndexOf("/")
    if (idx === -1) return path
    return path.slice(idx + 1)
  }

  const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)

  const clean = (value: string) => value.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")

  const split = (value: string) => {
    const idx = value.lastIndexOf(".")
    if (idx <= 0) return { head: value, tail: "" }
    return { head: value.slice(0, idx), tail: value.slice(idx) }
  }

  const unique = (value: string, seen: Set<string>) => {
    const part = split(value)
    let next = value
    let idx = 2
    while (seen.has(next)) {
      next = `${part.head}-${idx}${part.tail}`
      idx += 1
    }
    seen.add(next)
    return next
  }

  const upload = (list: File[]) => {
    if (!props.writer || list.length === 0 || busy()) return

    setBusy(true)
    void Promise.all(list.map(async (item) => ({ item, mime: await attachmentMime(item) })))
      .then(async (list) => {
        if (list.some((item) => item.mime !== "text/plain")) {
          showToast({
            variant: "error",
            title: language.t("writer.files.upload.invalid.title"),
            description: language.t("writer.files.upload.invalid.description"),
          })
          return
        }

        await file.tree.list("")
        const seen = new Set(file.tree.children("").map((node) => node.name))
        await Promise.all(
          list.map(async (item) => {
            const path = unique(item.item.name, seen)
            await file.write(path, await item.item.text())
          }),
        )
        await file.tree.refresh("")
        showToast({
          title: language.t("writer.files.upload.success.title"),
          description: language.t("writer.files.upload.success.description", { count: list.length }),
        })
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: language.t("writer.files.upload.failed.title"),
          description: error instanceof Error ? error.message : language.t("common.requestFailed"),
        })
      })
      .finally(() => setBusy(false))
  }

  function DialogCreate(input: { dir: string; type: "file" | "directory" }) {
    const [store, setStore] = createStore({ name: "", busy: false })
    const title = createMemo(() =>
      input.type === "file" ? language.t("session.files.action.newFile") : language.t("session.files.action.newFolder"),
    )
    const placeholder = createMemo(() =>
      input.type === "file"
        ? language.t("session.files.dialog.newFile.placeholder")
        : language.t("session.files.dialog.newFolder.placeholder"),
    )

    const submit = async (event?: SubmitEvent) => {
      event?.preventDefault()
      const value = clean(store.name)
      if (!value) return
      if (value.split("/").some((part) => part === "." || part === ".." || part === "")) {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: language.t("session.files.dialog.invalidName"),
        })
        return
      }
      if (props.writer && value.split("/").some((part) => part === ".skills")) {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: language.t("writer.files.hidden.description"),
        })
        return
      }

      const path = join(input.dir, value)
      setStore("busy", true)
      await file
        .create(path, input.type)
        .then((next) => {
          if (input.type === "file") {
            openTab(file.tab(next))
          }
          if (input.type === "directory") {
            file.tree.expand(next)
          }
          dialog.close()
        })
        .finally(() => {
          setStore("busy", false)
        })
    }

    return (
      <Dialog title={title()} fit>
        <form onSubmit={submit} class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <TextField
            autofocus
            value={store.name}
            label={language.t("session.files.dialog.name")}
            placeholder={placeholder()}
            onChange={(value) => setStore("name", value)}
          />
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" size="large" disabled={store.busy || !clean(store.name)}>
              {language.t("session.files.dialog.create")}
            </Button>
          </div>
        </form>
      </Dialog>
    )
  }

  function DialogDelete(props: { node: FileNode }) {
    const [busy, setBusy] = createStore({ value: false })
    const title = createMemo(() =>
      props.node.type === "file"
        ? language.t("session.files.action.deleteFile")
        : language.t("session.files.action.deleteFolder"),
    )
    const text = createMemo(() =>
      props.node.type === "file"
        ? language.t("session.files.dialog.deleteFile.confirm", { name: props.node.name })
        : language.t("session.files.dialog.deleteFolder.confirm", { name: props.node.name }),
    )

    const remove = async () => {
      setBusy("value", true)
      await file
        .remove(props.node.path)
        .then(() => {
          dialog.close()
        })
        .finally(() => {
          setBusy("value", false)
        })
    }

    return (
      <Dialog title={title()} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="text-14-regular text-text-strong">{text()}</div>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="button" variant="primary" size="large" disabled={busy.value} onClick={remove}>
              {language.t("common.delete")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  const openCreate = (dir: string, type: "file" | "directory") => {
    dialog.show(() => <DialogCreate dir={dir} type={type} />)
  }

  const openDelete = (node: FileNode) => {
    dialog.show(() => <DialogDelete node={node} />)
  }

  const openNodeMenu = (node: FileNode) => {
    const dir = node.type === "directory" ? node.path : parent(node.path)
    return (
      <>
        <ContextMenu.Item onSelect={() => openCreate(dir, "file")}>
          <ContextMenu.ItemLabel>{language.t("session.files.action.newFile")}</ContextMenu.ItemLabel>
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => openCreate(dir, "directory")}>
          <ContextMenu.ItemLabel>{language.t("session.files.action.newFolder")}</ContextMenu.ItemLabel>
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item onSelect={() => openDelete(node)}>
          <ContextMenu.ItemLabel>
            {node.type === "file"
              ? language.t("session.files.action.deleteFile")
              : language.t("session.files.action.deleteFolder")}
          </ContextMenu.ItemLabel>
        </ContextMenu.Item>
      </>
    )
  }

  const moveTreeNode = (from: string, to: string) => {
    const target = join(to, leaf(from))
    if (target === from) return
    void file.move(from, target)
  }

  return (
    <Show when={isDesktop()}>
      <aside
        data-component="session-side-panel"
        data-writer-mode={props.writer ? "true" : "false"}
        id="review-panel"
        aria-label={language.t(reviewKey("session.panel.reviewAndFiles", "session.panel.revisionAndFiles"))}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
        classList={{
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
        }}
        style={{ width: panelWidth() }}
      >
        <div class="size-full flex border-l border-border-weaker-base">
          <div
            aria-hidden={!previewOpen()}
            inert={!previewOpen()}
            class="relative min-w-0 h-full flex-1 overflow-hidden bg-background-base"
            classList={{
              "pointer-events-none": !previewOpen(),
            }}
          >
            <div class="size-full min-w-0 h-full bg-background-base">
              <DragDropProvider
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                collisionDetector={closestCenter}
              >
                <DragDropSensors />
                <ConstrainDragYAxis />
                <Tabs value={activeTab()} onChange={openTab}>
                  <div class="sticky top-0 shrink-0 flex">
                    <Tabs.List
                      ref={(el: HTMLDivElement) => {
                        const stop = createFileTabListSync({ el, contextOpen })
                        onCleanup(stop)
                      }}
                    >
                      <Show when={reviewTab()}>
                        <Tabs.Trigger value="review">
                          <div class="flex items-center gap-1.5">
                            <div>{language.t(reviewKey("session.tab.review", "session.tab.revision"))}</div>
                            <Show when={hasReview()}>
                              <div>{reviewCount()}</div>
                            </Show>
                          </div>
                        </Tabs.Trigger>
                      </Show>
                      <Show when={!props.writer && contextOpen()}>
                        <Tabs.Trigger
                          value="context"
                          closeButton={
                            <TooltipKeybind
                              title={language.t("common.closeTab")}
                              keybind={command.keybind("tab.close")}
                              placement="bottom"
                              gutter={10}
                            >
                              <IconButton
                                icon="close-small"
                                variant="ghost"
                                class="h-5 w-5"
                                onClick={() => tabs().close("context")}
                                aria-label={language.t("common.closeTab")}
                              />
                            </TooltipKeybind>
                          }
                          hideCloseButton
                          onMiddleClick={() => tabs().close("context")}
                        >
                          <div class="flex items-center gap-2">
                            <SessionContextUsage variant="indicator" />
                            <div>{language.t("session.tab.context")}</div>
                          </div>
                        </Tabs.Trigger>
                      </Show>
                      <SortableProvider ids={openedTabs()}>
                        <For each={openedTabs()}>{(tab) => <SortableTab tab={tab} onTabClose={tabs().close} />}</For>
                      </SortableProvider>
                      <Show when={!props.writer}>
                        <div class="bg-background-stronger h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3">
                          <TooltipKeybind
                            title={language.t("command.file.open")}
                            keybind={command.keybind("file.open")}
                            class="flex items-center"
                          >
                            <IconButton
                              icon="plus-small"
                              variant="ghost"
                              iconSize="large"
                              class="!rounded-md"
                              onClick={() =>
                                dialog.show(() => <DialogSelectFile mode="files" onOpenFile={showAllFiles} />)
                              }
                              aria-label={language.t("command.file.open")}
                            />
                          </TooltipKeybind>
                        </div>
                      </Show>
                    </Tabs.List>
                  </div>

                  <Show when={reviewTab()}>
                    <Tabs.Content value="review" class="flex flex-col h-full overflow-hidden contain-strict">
                      <Show when={activeTab() === "review"}>{props.reviewPanel()}</Show>
                    </Tabs.Content>
                  </Show>

                  <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                    <Show when={activeTab() === "empty"}>
                      <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                        <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                          <Mark class="w-14 opacity-10" />
                          <div class="text-14-regular text-text-weak max-w-56">
                            {language.t(fileKey("session.files.selectToOpen", "session.files.selectToOpen.writer"))}
                          </div>
                        </div>
                      </div>
                    </Show>
                  </Tabs.Content>

                  <Show when={!props.writer && contextOpen()}>
                    <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                      <Show when={activeTab() === "context"}>
                        <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                          <SessionContextTab />
                        </div>
                      </Show>
                    </Tabs.Content>
                  </Show>

                  <Show when={activeFileTab()} keyed>
                    {(tab) => <FileTabContent tab={tab} />}
                  </Show>
                </Tabs>
                <DragOverlay>
                  <Show when={store.activeDraggable} keyed>
                    {(tab) => {
                      const path = file.pathFromTab(tab)
                      return (
                        <div data-component="tabs-drag-preview">
                          <Show when={path}>{(p) => <FileVisual active path={p()} />}</Show>
                        </div>
                      )
                    }}
                  </Show>
                </DragOverlay>
              </DragDropProvider>
            </div>
          </div>

          <div
            id="file-tree-panel"
            aria-hidden={!fileOpen()}
            inert={!fileOpen()}
            class="relative min-w-0 h-full shrink-0 overflow-hidden"
            classList={{
              "pointer-events-none": !fileOpen(),
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
                !props.size.active(),
            }}
            style={{ width: treeWidth() }}
          >
            <div
              class="h-full flex flex-col overflow-hidden group/filetree"
              classList={{ "border-l border-border-weaker-base": previewOpen() }}
            >
              <Tabs
                variant="pill"
                value={fileTreeTab()}
                onChange={setFileTreeTabValue}
                class="h-full"
                data-scope="filetree"
              >
                <Tabs.List>
                  <Show when={reviewTab() && !props.writer}>
                    <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                      {reviewCount()}{" "}
                      {language.t(
                        reviewCount() === 1
                          ? reviewKey("session.review.change.one", "session.revision.change.one")
                          : reviewKey("session.review.change.other", "session.revision.change.other"),
                      )}
                    </Tabs.Trigger>
                  </Show>
                  <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                    {language.t(fileKey("session.files.all", "session.files.all.writer"))}
                  </Tabs.Trigger>
                  <Show when={props.writer && fileTreeTab() === "all"}>
                    <input
                      ref={uploadInput}
                      type="file"
                      multiple
                      accept={TEXT_FILE_TYPES.join(",")}
                      class="hidden"
                      onChange={(e) => {
                        const list = Array.from(e.currentTarget.files ?? [])
                        upload(list)
                        e.currentTarget.value = ""
                      }}
                    />
                    <div class="bg-background-stronger h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3">
                      <Tooltip placement="bottom" value={language.t("writer.files.upload")}>
                        <IconButton
                          icon="cloud-upload"
                          variant="ghost"
                          iconSize="large"
                          class="!rounded-md"
                          disabled={busy()}
                          onClick={() => uploadInput?.click()}
                          aria-label={language.t("writer.files.upload")}
                        />
                      </Tooltip>
                    </div>
                  </Show>
                </Tabs.List>
                <Show when={reviewTab() && !props.writer}>
                  <Tabs.Content value="changes" class="h-full bg-background-stronger px-3 py-0">
                    <Switch>
                      <Match when={reviewCount() > 0}>
                        <Show
                          when={diffsReady()}
                          fallback={
                            <div class="px-2 py-2 text-12-regular text-text-weak">
                              {language.t("common.loading")}
                              {language.t("common.loading.ellipsis")}
                            </div>
                          }
                        >
                          <FileTree
                            path=""
                            class="pt-3 min-h-full"
                            allowed={diffFiles()}
                            hidden={hidden()}
                            kinds={kinds()}
                            draggable={false}
                            active={props.activeDiff}
                            onFileClick={(node) => props.focusReviewDiff(node.path)}
                          />
                        </Show>
                      </Match>
                      <Match when={true}>{empty(reviewEmpty())}</Match>
                    </Switch>
                  </Tabs.Content>
                </Show>
                <Tabs.Content value="all" class="h-full bg-background-stronger px-3 py-0">
                  <Show
                    when={props.writer}
                    fallback={
                      <Switch>
                        <Match when={nofiles()}>
                          {empty(language.t(fileKey("session.files.empty", "session.files.empty.writer")))}
                        </Match>
                        <Match when={true}>
                          <FileTree
                            path=""
                            class="pt-3 min-h-full"
                            hidden={hidden()}
                            modified={diffFiles()}
                            kinds={kinds()}
                            onFileClick={(node) => openTab(file.tab(node.path))}
                          />
                        </Match>
                      </Switch>
                    }
                  >
                    <ContextMenu modal={false}>
                      <ContextMenu.Trigger class="block h-full min-h-full">
                        <Switch>
                          <Match when={nofiles()}>
                            {empty(language.t(fileKey("session.files.empty", "session.files.empty.writer")))}
                          </Match>
                          <Match when={true}>
                            <FileTree
                              path=""
                              class="pt-3 min-h-full"
                              hidden={hidden()}
                              modified={diffFiles()}
                              kinds={kinds()}
                              onFileClick={(node) => openTab(file.tab(node.path))}
                              onMove={moveTreeNode}
                              onMenu={openNodeMenu}
                            />
                          </Match>
                        </Switch>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content>
                          <ContextMenu.Item onSelect={() => openCreate("", "file")}>
                            <ContextMenu.ItemLabel>{language.t("session.files.action.newFile")}</ContextMenu.ItemLabel>
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => openCreate("", "directory")}>
                            <ContextMenu.ItemLabel>{language.t("session.files.action.newFolder")}</ContextMenu.ItemLabel>
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu>
                  </Show>
                </Tabs.Content>
              </Tabs>
            </div>
            <Show when={fileOpen()}>
              <div onPointerDown={() => props.size.start()}>
                <ResizeHandle
                  direction="horizontal"
                  edge="start"
                  size={layout.fileTree.width()}
                  min={200}
                  max={480}
                  collapseThreshold={160}
                  onResize={(width) => {
                    props.size.touch()
                    layout.fileTree.resize(width)
                  }}
                  onCollapse={layout.fileTree.close}
                />
              </div>
            </Show>
          </div>
        </div>
      </aside>
    </Show>
  )
}
