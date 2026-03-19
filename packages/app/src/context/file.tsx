import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { useParams } from "@solidjs/router"
import { getFilename } from "@opencode-ai/util/path"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { createPathHelpers } from "./file/path"
import {
  approxBytes,
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  hasFileContent,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"
import { createFileViewCache } from "./file/view-cache"
import { createFileTreeStore } from "./file/tree-store"
import { invalidateFromWatcher } from "./file/watcher"
import {
  selectionFromLines,
  type FileState,
  type FileSelection,
  type FileViewState,
  type SelectedLineRange,
} from "./file/types"

export type { FileSelection, SelectedLineRange, FileViewState, FileState }
export { selectionFromLines }
export {
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

function ensureOk(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Unexpected response")
  }
  if (!("ok" in value)) {
    throw new Error("Unexpected response")
  }
  if (value.ok !== true) {
    throw new Error("Unexpected response")
  }
}

function legacy(error: unknown) {
  const msg = errorMessage(error, "").trim()
  if (!msg) return false
  if (msg === "Unexpected response") return true
  if (/^<!doctype/i.test(msg)) return true
  if (/^<html/i.test(msg)) return true
  if (/^Not Found$/i.test(msg)) return true
  return /^Cannot (GET|POST|PUT|DELETE|PATCH)\b/i.test(msg)
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export const { use: useFile, provider: FileProvider } = createSimpleContext({
  name: "File",
  gate: false,
  init: () => {
    const sdk = useSDK()
    useSync()
    const params = useParams()
    const language = useLanguage()
    const layout = useLayout()

    const scope = createMemo(() => sdk.directory)
    const path = createPathHelpers(scope)
    const tabs = layout.tabs(() => `${params.dir}${params.id ? "/" + params.id : ""}`)

    const inflight = new Map<string, Promise<void>>()
    const [store, setStore] = createStore<{
      file: Record<string, FileState>
    }>({
      file: {},
    })

    const tree = createFileTreeStore({
      scope,
      normalizeDir: path.normalizeDir,
      list: (dir) => sdk.client.file.list({ path: dir }).then((x) => x.data ?? []),
      onError: (message) => {
        showToast({
          variant: "error",
          title: language.t("toast.file.listFailed.title"),
          description: message,
        })
      },
    })

    const evictContent = (keep?: Set<string>) => {
      evictContentLru(keep, (target) => {
        if (!store.file[target]) return
        setStore(
          "file",
          target,
          produce((draft) => {
            draft.content = undefined
            draft.loaded = false
          }),
        )
      })
    }

    createEffect(() => {
      scope()
      inflight.clear()
      resetFileContentLru()
      batch(() => {
        setStore("file", reconcile({}))
        tree.reset()
      })
    })

    const viewCache = createFileViewCache()
    const view = createMemo(() => viewCache.load(scope(), params.id))

    const ensure = (file: string) => {
      if (!file) return
      if (store.file[file]) return
      setStore("file", file, { path: file, name: getFilename(file) })
    }

    const setLoading = (file: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = true
          draft.error = undefined
        }),
      )
    }

    const setLoaded = (file: string, content: FileState["content"]) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loaded = true
          draft.loading = false
          draft.content = content
        }),
      )
    }

    const setLoadError = (file: string, message: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = false
          draft.error = message
        }),
      )
      showToast({
        variant: "error",
        title: language.t("toast.file.loadFailed.title"),
        description: message,
      })
    }

    const load = (input: string, options?: { force?: boolean }) => {
      const file = path.normalize(input)
      if (!file) return Promise.resolve()

      const directory = scope()
      const key = `${directory}\n${file}`
      ensure(file)

      const current = store.file[file]
      if (!options?.force && current?.loaded) return Promise.resolve()

      const pending = inflight.get(key)
      if (pending) return pending

      setLoading(file)

      const promise = sdk.client.file
        .read({ path: file })
        .then((x) => {
          if (scope() !== directory) return
          const content = x.data
          setLoaded(file, content)

          if (!content) return
          touchFileContent(file, approxBytes(content))
          evictContent(new Set([file]))
        })
        .catch((e) => {
          if (scope() !== directory) return
          setLoadError(file, errorMessage(e, language.t("error.chain.unknown")))
        })
        .finally(() => {
          inflight.delete(key)
        })

      inflight.set(key, promise)
      return promise
    }

    const write = (input: string, content: string) => {
      const file = path.normalize(input)
      if (!file) return Promise.resolve()

      ensure(file)

      return sdk.client.file
        .write({ fileWriteInput: { path: file, content } })
        .then((x) => {
          const next =
            x.data && typeof x.data === "object" && "content" in x.data && typeof x.data.content === "string"
              ? x.data
              : { type: "text" as const, content }
          setLoaded(file, next)
          touchFileContent(file, approxBytes(next))
          evictContent(new Set([file]))
          return next
        })
        .catch((e) => {
          const message = errorMessage(e, language.t("error.chain.unknown"))
          showToast({
            variant: "error",
            title: language.t("toast.file.saveFailed.title"),
            description: message,
          })
          throw e
        })
    }

    const search = (query: string, dirs: "true" | "false") =>
      sdk.client.find.files({ query, dirs }).then(
        (x) => (x.data ?? []).map(path.normalize),
        () => [],
      )

    const parent = (file: string) => {
      const clean = file.replace(/\/+$/, "")
      const idx = clean.lastIndexOf("/")
      if (idx === -1) return ""
      return clean.slice(0, idx)
    }

    const hit = (from: string, target: string) => target === from || target.startsWith(from + "/")
    const map = (from: string, to: string, target: string) => {
      if (!hit(from, target)) return target
      return to + target.slice(from.length)
    }

    const refresh = (...list: string[]) => {
      const set = new Set(list.map((x) => path.normalizeDir(x)))
      return Promise.all([...set].map((item) => tree.listDir(item, { force: true }))).then(() => {})
    }

    const seen = async (file: string, type?: "file" | "directory") => {
      await refresh(parent(file))
      const item = tree.node(file)
      if (!item) return false
      if (!type) return true
      return item.type === type
    }

    const gone = async (file: string) => {
      await refresh(parent(file))
      return !tree.node(file)
    }

    const moved = async (from: string, to: string) => {
      await refresh(parent(from), parent(to))
      return !tree.node(from) && !!tree.node(to)
    }

    const ops = {
      create: `
        import { mkdir, stat, writeFile } from "node:fs/promises"
        import path from "node:path"

        const miss = (err) => {
          if (!err || typeof err !== "object" || !("code" in err) || err.code !== "ENOENT") throw err
        }

        const file = process.argv[1]
        const type = process.argv[2]

        await stat(file).then(() => {
          throw new Error(\`Path already exists: \${file}\`)
        }, miss)

        if (type === "directory") {
          await mkdir(file, { recursive: true })
        }

        if (type !== "directory") {
          await mkdir(path.dirname(file), { recursive: true })
          await writeFile(file, "", { flag: "wx" })
        }
      `,
      remove: `
        import { rm } from "node:fs/promises"

        await rm(process.argv[1], { recursive: true, force: false })
      `,
      move: `
        import { cp, mkdir, rename, rm, stat } from "node:fs/promises"
        import path from "node:path"

        const miss = (err) => {
          if (!err || typeof err !== "object" || !("code" in err) || err.code !== "ENOENT") throw err
        }

        const swap = (err) => !!err && typeof err === "object" && "code" in err && err.code === "EXDEV"
        const from = process.argv[1]
        const to = process.argv[2]
        const info = await stat(from)

        await stat(to).then(() => {
          throw new Error(\`Path already exists: \${to}\`)
        }, miss)

        const src = from.replaceAll("\\\\", "/").replace(/\\/+$/, "")
        const dst = to.replaceAll("\\\\", "/").replace(/\\/+$/, "")
        if (info.isDirectory() && (dst === src || dst.startsWith(src + "/"))) {
          throw new Error("Cannot move directory into itself")
        }

        await mkdir(path.dirname(to), { recursive: true })
        await rename(from, to).catch(async (err) => {
          if (!swap(err)) throw err
          await cp(from, to, { recursive: true, errorOnExist: true, force: false })
          await rm(from, { recursive: true, force: false })
        })
      `,
    }

    const run = async (code: string, args: string[], test: () => Promise<boolean>) => {
      const pty = await sdk.client.pty.create({
        command: "bun",
        args: ["-e", code, ...args],
        title: "File",
      })
      const id = pty.data?.id
      if (!id) throw new Error(language.t("error.chain.unknown"))

      const end = Date.now() + 8000
      while (Date.now() < end) {
        if (await test()) return
        const status = await sdk.client.pty
          .get({ ptyID: id })
          .then((x) => x.data?.status)
          .catch(() => "exited")
        if (status !== "running") break
        await wait(120)
      }

      if (await test()) return
      await sdk.client.pty.remove({ ptyID: id }).catch(() => {})
      throw new Error(language.t("error.chain.unknown"))
    }

    const shim = {
      async create(file: string, type: "file" | "directory") {
        if (await seen(file)) throw new Error(`Path already exists: ${file}`)
        await run(ops.create, [file, type], () => seen(file, type))
      },
      async remove(file: string) {
        if (!(await seen(file))) throw new Error(`Path not found: ${file}`)
        await run(ops.remove, [file], () => gone(file))
      },
      async move(from: string, to: string) {
        if (!(await seen(from))) throw new Error(`Path not found: ${from}`)
        if (await seen(to)) throw new Error(`Path already exists: ${to}`)
        await run(ops.move, [from, to], () => moved(from, to))
      },
    }

    const route = (input: Promise<void>, fix: () => Promise<void>) =>
      input.catch(async (error) => {
        if (!legacy(error)) throw error
        await fix()
      })

    const create = (input: string, type: "file" | "directory") => {
      const file = path.normalize(input)
      if (!file) {
        const err = new Error(language.t("error.chain.unknown"))
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err.message,
        })
        return Promise.reject(err)
      }

      return route(
        sdk.client.file.create({ fileCreateInput: { path: file, type } }).then((x) => {
          ensureOk(x.data)
        }),
        () => shim.create(file, type),
      )
        .then(async () => {
          if (type === "file") ensure(file)
          await refresh(parent(file))
          return file
        })
        .catch((e) => {
          const message = errorMessage(e, language.t("error.chain.unknown"))
          showToast({
            variant: "error",
            title: language.t("common.requestFailed"),
            description: message,
          })
          throw e
        })
    }

    const remove = (input: string) => {
      const file = path.normalize(input)
      if (!file) return Promise.resolve()

      return route(
        sdk.client.file.delete({ path: file }).then((x) => {
          ensureOk(x.data)
        }),
        () => shim.remove(file),
      )
        .then(() => {
          const all = tabs.all().slice()
          for (const tab of all) {
            const target = path.pathFromTab(tab)
            if (!target || !hit(file, target)) continue
            tabs.close(tab)
          }

          setStore(
            "file",
            produce((draft) => {
              for (const key of Object.keys(draft)) {
                if (!hit(file, key)) continue
                removeFileContentBytes(key)
                delete draft[key]
              }
            }),
          )

          return refresh(parent(file))
        })
        .catch((e) => {
          const message = errorMessage(e, language.t("error.chain.unknown"))
          showToast({
            variant: "error",
            title: language.t("common.requestFailed"),
            description: message,
          })
          throw e
        })
    }

    const move = (fromInput: string, toInput: string) => {
      const from = path.normalize(fromInput)
      const to = path.normalize(toInput)
      if (!from || !to || from === to) return Promise.resolve()

      return route(
        sdk.client.file.move({ fileMoveInput: { from, to } }).then((x) => {
          ensureOk(x.data)
        }),
        () => shim.move(from, to),
      )
        .then(() => {
          const active = tabs.active()
          const all = tabs.all().map((tab) => {
            const target = path.pathFromTab(tab)
            if (!target) return tab
            return path.tab(map(from, to, target))
          })
          const next: string[] = []
          const seen = new Set<string>()
          for (const tab of all) {
            if (seen.has(tab)) continue
            seen.add(tab)
            next.push(tab)
          }
          tabs.setAll(next)

          if (active) {
            const target = path.pathFromTab(active)
            if (target) tabs.setActive(path.tab(map(from, to, target)))
          }

          const updates: { from: string; to: string; content?: FileState["content"] }[] = []
          setStore(
            "file",
            produce((draft) => {
              for (const key of Object.keys(draft)) {
                if (!hit(from, key)) continue
                const next = map(from, to, key)
                const item = draft[key]
                delete draft[key]
                if (!item) continue
                draft[next] = {
                  ...item,
                  path: next,
                  name: getFilename(next),
                }
                updates.push({ from: key, to: next, content: item.content })
              }
            }),
          )

          for (const item of updates) {
            removeFileContentBytes(item.from)
            if (!item.content) continue
            touchFileContent(item.to, approxBytes(item.content))
          }

          return refresh(parent(from), parent(to)).then(() => to)
        })
        .catch((e) => {
          const message = errorMessage(e, language.t("error.chain.unknown"))
          showToast({
            variant: "error",
            title: language.t("common.requestFailed"),
            description: message,
          })
          throw e
        })
    }

    const stop = sdk.event.listen((e) => {
      invalidateFromWatcher(e.details, {
        normalize: path.normalize,
        hasFile: (file) => Boolean(store.file[file]),
        isOpen: (file) => tabs.all().some((tab) => path.pathFromTab(tab) === file),
        loadFile: (file) => {
          void load(file, { force: true })
        },
        node: tree.node,
        isDirLoaded: tree.isLoaded,
        refreshDir: (dir) => {
          void tree.listDir(dir, { force: true })
        },
      })
    })

    const get = (input: string) => {
      const file = path.normalize(input)
      const state = store.file[file]
      const content = state?.content
      if (!content) return state
      if (hasFileContent(file)) {
        touchFileContent(file)
        return state
      }
      touchFileContent(file, approxBytes(content))
      return state
    }

    function withPath(input: string, action: (file: string) => unknown) {
      return action(path.normalize(input))
    }
    const scrollTop = (input: string) => withPath(input, (file) => view().scrollTop(file))
    const scrollLeft = (input: string) => withPath(input, (file) => view().scrollLeft(file))
    const selectedLines = (input: string) => withPath(input, (file) => view().selectedLines(file))
    const setScrollTop = (input: string, top: number) => withPath(input, (file) => view().setScrollTop(file, top))
    const setScrollLeft = (input: string, left: number) => withPath(input, (file) => view().setScrollLeft(file, left))
    const setSelectedLines = (input: string, range: SelectedLineRange | null) =>
      withPath(input, (file) => view().setSelectedLines(file, range))

    onCleanup(() => {
      stop()
      viewCache.clear()
    })

    return {
      ready: () => view().ready(),
      normalize: path.normalize,
      tab: path.tab,
      pathFromTab: path.pathFromTab,
      tree: {
        list: tree.listDir,
        refresh: (input: string) => tree.listDir(input, { force: true }),
        state: tree.dirState,
        children: tree.children,
        expand: tree.expandDir,
        collapse: tree.collapseDir,
        toggle(input: string) {
          if (tree.dirState(input)?.expanded) {
            tree.collapseDir(input)
            return
          }
          tree.expandDir(input)
        },
      },
      get,
      load,
      write,
      create,
      remove,
      move,
      scrollTop,
      scrollLeft,
      setScrollTop,
      setScrollLeft,
      selectedLines,
      setSelectedLines,
      searchFiles: (query: string) => search(query, "false"),
      searchFilesAndDirectories: (query: string) => search(query, "true"),
    }
  },
})
