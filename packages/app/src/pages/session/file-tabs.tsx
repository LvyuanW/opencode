import { createEffect, createMemo, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import type { FileSearchHandle } from "@opencode-ai/ui/file"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { cloneSelectedLineRange, previewSelectedLines } from "@opencode-ai/ui/pierre/selection-bridge"
import { createLineCommentController } from "@opencode-ai/ui/line-comment-annotations"
import { sampledChecksum } from "@opencode-ai/util/encode"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Tag } from "@opencode-ai/ui/tag"
import { showToast } from "@opencode-ai/ui/toast"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { useComments } from "@/context/comments"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { useSettings } from "@/context/settings"
import { getSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"

function FileCommentMenu(props: {
  moreLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: VoidFunction
  onDelete: VoidFunction
}) {
  return (
    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu gutter={4} placement="bottom-end">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          size="small"
          class="size-6 rounded-md"
          aria-label={props.moreLabel}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={props.onEdit}>
              <DropdownMenu.ItemLabel>{props.editLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={props.onDelete}>
              <DropdownMenu.ItemLabel>{props.deleteLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  )
}

export function FileTabContent(props: { tab: string }) {
  type Mode = "edit" | "preview"
  type Pick = {
    path: string
    selection: FileSelection
    quote: string
    preview: string
  }
  type Pending = {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }

  const file = useFile()
  const comments = useComments()
  const language = useLanguage()
  const prompt = usePrompt()
  const settings = useSettings()
  const fileComponent = useFileComponent()
  const { sessionKey, tabs, view } = useSessionLayout()
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  }).activeFileTab
  const writer = createMemo(() => settings.general.workspaceMode() === "writer")

  let scroll: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let restoreFrame: number | undefined
  let pending: { x: number; y: number } | undefined
  let codeScroll: HTMLElement[] = []
  let find: FileSearchHandle | null = null
  let area: HTMLTextAreaElement | undefined
  let wrap: HTMLDivElement | undefined

  const search = {
    register: (handle: FileSearchHandle | null) => {
      find = handle
    },
  }

  const path = createMemo(() => file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))
  const editable = createMemo(() => {
    const content = state()?.content
    if (!content) return false
    if (content.type !== "text") return false
    return content.encoding !== "base64"
  })
  const selectedLines = createMemo<SelectedLineRange | null>(() => {
    const p = path()
    if (!p) return null
    if (file.ready()) return (file.selectedLines(p) as SelectedLineRange | undefined) ?? null
    return (getSessionHandoff(sessionKey())?.files[p] as SelectedLineRange | undefined) ?? null
  })

  const selectionPreview = (source: string, selection: FileSelection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine,
    })
  }

  const line = (source: string, offset: number) => {
    const text = source.slice(0, Math.max(0, Math.min(offset, source.length)))
    const rows = text.split("\n")
    return {
      line: Math.max(1, rows.length),
      char: rows.at(-1)?.length ?? 0,
    }
  }

  const point = (source: string, lineNo: number, charNo: number) => {
    const rows = source.split("\n")
    if (rows.length === 0) return 0

    const row = Math.max(1, Math.min(lineNo, rows.length)) - 1
    return (
      rows.slice(0, row).reduce((sum, item) => sum + item.length + 1, 0) + Math.min(Math.max(charNo, 0), rows[row].length)
    )
  }

  const snippet = (source: string) => {
    const text = source.replace(/\s+/g, " ").trim() || source.replace(/\n/g, " ").trim()
    if (text.length <= 96) return text
    return `${text.slice(0, 96)}…`
  }

  const bubble = (item: Pick | null) => {
    if (!item || !area || !wrap || typeof window === "undefined") return null

    const end = point(area.value, item.selection.endLine, item.selection.endChar)
    const box = area.getBoundingClientRect()
    const shell = wrap.getBoundingClientRect()
    const host = document.createElement("div")
    const mark = document.createElement("span")
    const style = window.getComputedStyle(area)

    host.style.position = "fixed"
    host.style.top = `${box.top}px`
    host.style.left = `${box.left}px`
    host.style.width = `${area.clientWidth}px`
    host.style.height = `${area.clientHeight}px`
    host.style.padding = style.padding
    host.style.boxSizing = "border-box"
    host.style.whiteSpace = "pre-wrap"
    host.style.overflowWrap = "break-word"
    host.style.wordWrap = "break-word"
    host.style.overflow = "hidden"
    host.style.visibility = "hidden"
    host.style.pointerEvents = "none"
    host.style.fontFamily = style.fontFamily
    host.style.fontSize = style.fontSize
    host.style.fontWeight = style.fontWeight
    host.style.fontStyle = style.fontStyle
    host.style.letterSpacing = style.letterSpacing
    host.style.lineHeight = style.lineHeight
    host.style.textTransform = style.textTransform
    host.style.textIndent = style.textIndent
    host.style.tabSize = style.tabSize
    host.style.textAlign = style.textAlign
    host.style.direction = style.direction
    host.style.setProperty("font-variant-ligatures", style.fontVariantLigatures)

    host.textContent = area.value.slice(0, end)
    mark.textContent = "\u200b"
    host.append(mark)
    document.body.append(host)
    host.scrollTop = area.scrollTop
    host.scrollLeft = area.scrollLeft
    const node = mark.getBoundingClientRect()
    host.remove()

    const below = node.top - shell.top < 56
    return {
      top: Math.max(16, node.top - shell.top + (below ? 28 : -12)),
      left: Math.max(24, Math.min(node.left - shell.left, shell.width - 24)),
      below,
    }
  }

  const readPick = () => {
    const p = path()
    if (!p || !draft()) return null
    if (pane.mode === "preview") return null
    if (!area) return null

    const start = Math.min(area.selectionStart, area.selectionEnd)
    const end = Math.max(area.selectionStart, area.selectionEnd)
    if (start === end) return null

    const quote = area.value.slice(start, end)
    const first = line(area.value, start)
    const last = line(area.value, end)
    return {
      path: p,
      selection: {
        startLine: first.line,
        startChar: first.char,
        endLine: last.line,
        endChar: last.char,
      },
      quote,
      preview: snippet(quote),
    } satisfies Pick
  }

  const samePick = (
    a: Pick | null | undefined,
    b:
      | {
          path: string
          selection?: FileSelection
          quote?: string
        }
      | null
      | undefined,
  ) => {
    if (!a || !b?.selection || typeof b.quote !== "string") return false
    return (
      a.path === b.path &&
      a.quote === b.quote &&
      a.selection.startLine === b.selection.startLine &&
      a.selection.startChar === b.selection.startChar &&
      a.selection.endLine === b.selection.endLine &&
      a.selection.endChar === b.selection.endChar
    )
  }

  const syncPick = () => {
    const item = readPick()
    setPick("current", item)
    setPick("bubble", bubble(item))
  }

  const clearTarget = (p = path()) => {
    prompt.context
      .items()
      .filter((item) => item.type === "file" && item.target && (!p || item.path === p))
      .forEach((item) => prompt.context.remove(item.key))
  }

  const dropTarget = (key: string) => {
    prompt.context.remove(key)
  }

  const focusPrompt = () => {
    requestAnimationFrame(() => {
      const node = document.querySelector('[data-component="prompt-input"]')
      if (!(node instanceof HTMLElement)) return
      node.focus()
    })
  }

  const armTarget = () => {
    const item = pick.current ?? readPick()
    if (!item) {
      showToast({
        variant: "error",
        title: language.t("toast.context.noTextSelection.title"),
        description: language.t("toast.context.noTextSelection.description"),
      })
      return
    }

    prompt.context.add({
      type: "file",
      path: item.path,
      selection: item.selection,
      preview: item.preview,
      quote: item.quote,
      target: true,
      armed: Date.now(),
    })
    setPick("current", item)
    focusPrompt()
    showToast({
      variant: "success",
      title: language.t("toast.context.selectionAdded.title"),
      description: language.t("toast.context.selectionAdded.description"),
    })
  }

  const [queue, setQueue] = createStore({
    items: [] as Pending[],
  })
  const ready = createMemo(() => prompt.ready() && comments.ready())

  const commit = (input: Pending) => {
    const selection = selectionFromLines(input.selection)
    const preview =
      input.preview ??
      (() => {
        if (input.file === path()) return selectionPreview(contents(), selection)
        const source = file.get(input.file)?.content?.content
        if (!source) return undefined
        return selectionPreview(source, selection)
      })()

    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    comments.setActive({ file: input.file, id: saved.id })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
    showToast({
      variant: "success",
      title: language.t("toast.comment.added.title"),
    })
  }

  const addCommentToContext = (input: Pending) => {
    if (ready()) {
      commit(input)
      return
    }

    setQueue("items", (items) => [
      ...items,
      {
        ...input,
        selection: cloneSelectedLineRange(input.selection),
      },
    ])
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    const preview =
      input.file === path() ? selectionPreview(contents(), selectionFromLines(input.selection)) : undefined
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? { preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    selected: null as SelectedLineRange | null,
  })
  const [edit, setEdit] = createStore({
    open: false,
    saving: false,
    value: "",
  })
  const [pane, setPane] = createStore({
    mode: (writer() ? "preview" : "edit") as Mode,
  })
  const [pick, setPick] = createStore({
    current: null as Pick | null,
    bubble: null as { top: number; left: number; below: boolean } | null,
  })

  const dirty = createMemo(() => edit.value !== contents())
  const draft = createMemo(() => writer() && editable())
  const hash = createMemo(() => sampledChecksum(edit.value))
  const targets = createMemo(() => {
    const p = path()
    if (!p) return []
    return prompt.context.items().filter(
      (item) => item.type === "file" && item.target && item.path === p && typeof item.quote === "string",
    )
  })
  const current = createMemo(() => {
    if (!pick.current) return null
    if (targets().some((item) => samePick(pick.current, item))) return null
    return pick.current
  })
  const menu = createMemo(() => pick.bubble)

  const syncSelected = (range: SelectedLineRange | null) => {
    const p = path()
    if (!p) return
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null)
  }

  const activeSelection = () => note.selected ?? selectedLines()

  const commentsUi = createLineCommentController({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    state: {
      opened: () => note.openedComment,
      setOpened: (id) => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: (range) => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: (range) => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected,
    },
    getHoverSelectedRange: activeSelection,
    cancelDraftOnCommentToggle: true,
    clearSelectionOnSelectionEndNull: true,
    onSubmit: ({ comment, selection }) => {
      const p = path()
      if (!p) return
      addCommentToContext({ file: p, selection, comment, origin: "file" })
    },
    onUpdate: ({ id, comment, selection }) => {
      const p = path()
      if (!p) return
      updateCommentInContext({ id, file: p, selection, comment })
    },
    onDelete: (comment) => {
      const p = path()
      if (!p) return
      removeCommentFromContext({ id: comment.id, file: p })
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => (
      <FileCommentMenu
        moreLabel={language.t("common.moreOptions")}
        editLabel={language.t("common.edit")}
        deleteLabel={language.t("common.delete")}
        onEdit={controls.edit}
        onDelete={controls.remove}
      />
    ),
    onDraftPopoverFocusOut: (e: FocusEvent) => {
      const current = e.currentTarget as HTMLDivElement
      const target = e.relatedTarget
      if (target instanceof Node && current.contains(target)) return

      setTimeout(() => {
        if (!document.activeElement || !current.contains(document.activeElement)) {
          setNote("commenting", null)
        }
      }, 0)
    },
  })

  createEffect(() => {
    if (typeof window === "undefined") return

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeFileTab() !== props.tab) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "f") return

      event.preventDefault()
      event.stopPropagation()
      find?.focus()
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, { capture: true }))
  })

  createEffect(() => {
    if (typeof window === "undefined") return

    const onResize = () => setPick("bubble", bubble(pick.current))
    window.addEventListener("resize", onResize)
    onCleanup(() => window.removeEventListener("resize", onResize))
  })

  createEffect(
    on(
      path,
      () => {
        commentsUi.note.reset()
        setEdit({
          open: false,
          saving: false,
          value: "",
        })
        setPane("mode", writer() ? "preview" : "edit")
        setPick("current", null)
        setPick("bubble", null)
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    if (!edit.open || pane.mode === "preview") {
      setPick("bubble", null)
      return
    }
    setPick("bubble", bubble(pick.current))
  })

  createEffect(() => {
    const next = contents()
    if (edit.open && dirty()) return
    if (edit.value === next) return
    setEdit("value", next)
  })

  createEffect(() => {
    if (!draft()) return
    if (!state()?.loaded) return
    if (edit.open) return
    setEdit({
      open: true,
      saving: false,
      value: contents(),
    })
    requestAnimationFrame(() => area?.focus())
  })

  createEffect(() => {
    if (!ready()) return
    const items = queue.items
    if (items.length === 0) return
    setQueue("items", [])
    for (const item of items) commit(item)
  })

  createEffect(() => {
    const focus = comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (activeFileTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    commentsUi.note.openComment(target.id, target.selection, { cancelDraft: true })
    requestAnimationFrame(() => comments.clearFocus())
  })

  const getCodeScroll = () => {
    const el = scroll
    if (!el) return []

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return []

    const root = host.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll("[data-code]")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
    )
  }

  const queueScrollUpdate = (next: { x: number; y: number }) => {
    pending = next
    if (scrollFrame !== undefined) return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined

      const out = pending
      pending = undefined
      if (!out) return

      view().setScroll(props.tab, out)
    })
  }

  const handleCodeScroll = (event: Event) => {
    const el = scroll
    if (!el) return

    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    queueScrollUpdate({
      x: target.scrollLeft,
      y: el.scrollTop,
    })
  }

  const syncCodeScroll = () => {
    const next = getCodeScroll()
    if (next.length === codeScroll.length && next.every((el, i) => el === codeScroll[i])) return

    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    codeScroll = next

    for (const item of codeScroll) {
      item.addEventListener("scroll", handleCodeScroll)
    }
  }

  const restoreScroll = () => {
    const el = scroll
    if (!el) return

    const s = view().scroll(props.tab)
    if (!s) return

    syncCodeScroll()

    if (codeScroll.length > 0) {
      for (const item of codeScroll) {
        if (item.scrollLeft !== s.x) item.scrollLeft = s.x
      }
    }

    if (el.scrollTop !== s.y) el.scrollTop = s.y
    if (codeScroll.length > 0) return
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const queueRestore = () => {
    if (restoreFrame !== undefined) return

    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined
      restoreScroll()
    })
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (codeScroll.length === 0) syncCodeScroll()

    queueScrollUpdate({
      x: codeScroll[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    })
  }

  const cancelCommenting = () => {
    const p = path()
    if (p) file.setSelectedLines(p, null)
    setNote("commenting", null)
  }

  const openEdit = () => {
    if (!editable()) return
    setEdit({
      open: true,
      saving: false,
      value: contents(),
    })
    requestAnimationFrame(() => area?.focus())
  }

  const closeEdit = () => {
    setEdit({
      open: false,
      saving: false,
      value: contents(),
    })
  }

  const save = async () => {
    const p = path()
    if (!p || !editable()) return
    if (!dirty() || edit.saving) return

    setEdit("saving", true)
    try {
      const next = await file.write(p, edit.value)
      setEdit({
        open: writer(),
        saving: false,
        value: next?.content ?? edit.value,
      })
      showToast({
        variant: "success",
        title: language.t("toast.file.saved.title"),
        description: p,
      })
    } catch {
      setEdit("saving", false)
    }
  }

  let prev = {
    loaded: false,
    ready: false,
    active: false,
  }

  createEffect(() => {
    const loaded = !!state()?.loaded
    const ready = file.ready()
    const active = activeFileTab() === props.tab
    const restore = (loaded && !prev.loaded) || (ready && !prev.ready) || (active && loaded && !prev.active)
    prev = { loaded, ready, active }
    if (!restore) return
    queueRestore()
  })

  onCleanup(() => {
    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame)
  })

  const renderFile = (source: string) => (
    <div class="relative overflow-hidden pb-40">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        enableHoverUtility
        selectedLines={activeSelection()}
        commentedLines={commentedLines()}
        onRendered={() => {
          queueRestore()
        }}
        annotations={commentsUi.annotations()}
        renderAnnotation={commentsUi.renderAnnotation}
        renderHoverUtility={commentsUi.renderHoverUtility}
        onLineSelected={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelected(range)
        }}
        onLineNumberSelectionEnd={commentsUi.onLineNumberSelectionEnd}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelectionEnd(range)
        }}
        search={search}
        overflow="scroll"
        class="select-text"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          onLoad: queueRestore,
          onError: (args: { kind: "image" | "audio" | "svg" }) => {
            if (args.kind !== "svg") return
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title"),
            })
          },
        }}
      />
    </div>
  )

  const renderPreview = () => (
    <div
      data-component="session-file-preview-shell"
      data-writer-mode={writer() ? "true" : "false"}
      class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-weak-base bg-background-strong"
    >
      <div data-component="session-file-preview" data-writer-mode={writer() ? "true" : "false"} class="px-5 py-5">
        <div data-component="session-file-preview-body">
          <Markdown text={edit.value} cacheKey={hash()} class="writer-markdown" />
        </div>
      </div>
    </div>
  )

  return (
    <Tabs.Content value={props.tab} class="mt-3 relative h-full flex flex-col">
      <Show when={state()?.loaded}>
        <div
          data-component="session-file-toolbar"
          data-writer-mode={writer() ? "true" : "false"}
          class="px-3 pb-2 flex items-center justify-between gap-3"
        >
          <div
            data-component="session-file-path"
            class="min-w-0 text-12-regular text-text-weak truncate"
          >
            {path()}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Show when={writer() && editable()}>
              <div data-component="session-file-modes" class="flex items-center gap-1 rounded-full border border-border-weaker-base bg-background-base/80 p-1">
                <Button
                  size="small"
                  variant={pane.mode === "edit" ? "secondary" : "ghost"}
                  onClick={() => setPane("mode", "edit")}
                >
                  {language.t("common.edit")}
                </Button>
                <Button
                  size="small"
                  variant={pane.mode === "preview" ? "secondary" : "ghost"}
                  onClick={() => setPane("mode", "preview")}
                >
                  {language.t("session.file.mode.preview")}
                </Button>
              </div>
            </Show>
            <Show when={editable() && !edit.open && !writer()}>
              <Button size="small" variant="secondary" onClick={openEdit}>
                {language.t("common.edit")}
              </Button>
            </Show>
            <Show when={edit.open && !writer()}>
              <Button size="small" variant="ghost" onClick={closeEdit}>
                {language.t("common.cancel")}
              </Button>
            </Show>
            <Show when={edit.open}>
              <Button size="small" disabled={!dirty() || edit.saving} onClick={() => void save()}>
                {edit.saving ? language.t("common.saving") : language.t("common.save")}
              </Button>
            </Show>
          </div>
        </div>
      </Show>
      <Switch>
        <Match when={edit.open}>
          <div
            data-component="session-file-editor-shell"
            data-writer-mode={writer() ? "true" : "false"}
            class="relative min-h-0 flex-1 px-3 pb-3"
          >
            <Show when={writer() && current() && menu()}>
              <div
                data-component="session-file-selection-arm"
                class="pointer-events-none absolute z-20"
                style={{
                  top: `${menu()!.top}px`,
                  left: `${menu()!.left}px`,
                  transform: menu()!.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
                }}
              >
                <Button
                  size="small"
                  variant="secondary"
                  class="pointer-events-auto whitespace-nowrap shadow-lg"
                  onMouseDown={(event: MouseEvent) => event.preventDefault()}
                  onClick={armTarget}
                >
                  {language.t("session.file.selection.arm")}
                </Button>
              </div>
            </Show>
            <Show when={writer() && targets().length > 0}>
              <div class="pointer-events-none absolute inset-x-3 top-0 z-10 flex justify-end">
                <div class="pointer-events-auto mt-1 flex max-w-full flex-col items-end gap-2">
                  <div
                    data-component="session-file-selection-targets"
                    class="flex items-center gap-2 rounded-full border border-border-weak-base bg-background-strong/95 px-3 py-2 shadow-lg backdrop-blur"
                  >
                    <Tag>{language.t("session.file.selection.target")}</Tag>
                    <div class="text-12-regular text-text-strong">{targets().length}</div>
                    <Button size="small" variant="ghost" onClick={() => clearTarget()}>
                      {language.t("session.file.selection.clear")}
                    </Button>
                  </div>
                  <For each={targets()}>
                    {(item, idx) => (
                      <div
                        data-component="session-file-selection-target"
                        class="flex max-w-full items-center gap-2 rounded-full border border-border-weak-base bg-background-strong/95 px-3 py-2 shadow-lg backdrop-blur"
                      >
                        <Tag>{idx() + 1}</Tag>
                        <div
                          data-component="session-file-selection-value"
                          class="max-w-52 truncate text-12-regular text-text-strong"
                        >
                          {item.preview ?? snippet(item.quote ?? "")}
                        </div>
                        <IconButton
                          icon="close-small"
                          variant="ghost"
                          size="small"
                          class="size-6"
                          aria-label={language.t("session.file.selection.clear")}
                          onClick={() => dropTarget(item.key)}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={!writer() || pane.mode !== "preview"}>
              <div ref={(el) => (wrap = el)} class="relative size-full">
                <textarea
                  ref={(el) => (area = el)}
                  data-component="session-file-editor"
                  data-writer-mode={writer() ? "true" : "false"}
                  value={edit.value}
                  spellcheck
                  onInput={(event) => {
                    setEdit("value", event.currentTarget.value)
                    syncPick()
                  }}
                  onScroll={() => setPick("bubble", bubble(pick.current))}
                  onSelect={syncPick}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
                      event.preventDefault()
                      armTarget()
                      return
                    }

                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                      event.preventDefault()
                      void save()
                    }
                  }}
                  class="size-full resize-none rounded-2xl border border-border-weak-base bg-background-strong px-4 py-3 text-14-regular text-text-strong focus:outline-none focus:ring-0"
                />
              </div>
            </Show>
            <Show when={writer() && pane.mode === "preview"}>{renderPreview()}</Show>
          </div>
        </Match>
        <Match when={true}>
          <ScrollView
            class="min-h-0 flex-1"
            viewportRef={(el: HTMLDivElement) => {
              scroll = el
              restoreScroll()
            }}
            onScroll={handleScroll as any}
          >
            <Switch>
              <Match when={state()?.loaded}>{renderFile(contents())}</Match>
              <Match when={state()?.loading}>
                <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
              </Match>
              <Match when={state()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
            </Switch>
          </ScrollView>
        </Match>
      </Switch>
    </Tabs.Content>
  )
}
