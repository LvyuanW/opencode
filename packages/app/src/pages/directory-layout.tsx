import { batch, createEffect, createMemo, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { useGlobalSDK } from "@/context/global-sdk"

import { DataProvider } from "@opencode-ai/ui/context"
import { base64Encode } from "@opencode-ai/util/encode"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { writerBase, writerUser, writerWorkspace } from "@/utils/writer-path"
function DirectoryDataProvider(props: ParentProps<{ directory: string }>) {
  const navigate = useNavigate()
  const sync = useSync()
  const slug = createMemo(() => base64Encode(props.directory))

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) => navigate(`/${slug()}/session/${sessionID}`)}
      onSessionHref={(sessionID: string) => `/${slug()}/session/${sessionID}`}
    >
      <LocalProvider>{props.children}</LocalProvider>
    </DataProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const globalSDK = useGlobalSDK()
  const writer = createMemo(() => settings.general.workspaceMode() === "writer")
  const workspace = createMemo(() => writerWorkspace(decode64(params.dir) ?? ""))
  const directory = createMemo(() => {
    const raw = decode64(params.dir) ?? ""
    if (!writer()) return raw
    return writerBase(raw)
  })
  const [state, setState] = createStore({ invalid: "", resolved: "" })

  createEffect(() => {
    if (!params.dir) return
    const raw = directory()
    if (!raw) {
      if (state.invalid === params.dir) return
      setState("invalid", params.dir)
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: language.t("directory.error.invalidUrl"),
      })
      navigate("/", { replace: true })
      return
    }
    if (writer() && platform.platform === "web" && !workspace()) {
      navigate("/", { replace: true })
      return
    }

    const current = params.dir
    const route = decode64(current) ?? raw
    globalSDK
      .createClient({
        directory: raw,
        throwOnError: true,
      })
      .path.get()
      .then((x) => {
        if (params.dir !== current) return
        const root = x.data?.directory ?? raw
        const next = writer() ? writerUser(root, workspace()) : root
        batch(() => {
          setState("invalid", "")
          setState("resolved", next)
        })
        if (next === route) return
        const path = location.pathname.slice(current.length + 1)
        navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, { replace: true })
      })
      .catch(() => {
        if (params.dir !== current) return
        batch(() => {
          setState("invalid", "")
          setState("resolved", raw)
        })
      })
  })

  return (
    <Show when={state.resolved} keyed>
      {(resolved) => (
        <SDKProvider directory={() => resolved}>
          <SyncProvider>
            <DirectoryDataProvider directory={resolved}>{props.children}</DirectoryDataProvider>
          </SyncProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
