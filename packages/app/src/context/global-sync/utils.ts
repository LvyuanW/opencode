import type { Agent, Project, ProviderListResponse } from "@opencode-ai/sdk/v2/client"

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function isAgent(input: unknown): input is Agent {
  if (!input || typeof input !== "object") return false
  return typeof (input as { name?: unknown }).name === "string"
}

export function normalizeAgents(input: unknown): Agent[] {
  if (Array.isArray(input)) return input.filter(isAgent)
  if (!input || typeof input !== "object") return []

  const value = input as {
    agents?: unknown
    data?: unknown
  }
  if (Array.isArray(value.agents)) return value.agents.filter(isAgent)
  if (Array.isArray(value.data)) return value.data.filter(isAgent)
  return Object.values(input).filter(isAgent)
}

export function normalizeProviderList(input: ProviderListResponse): ProviderListResponse {
  return {
    ...input,
    all: input.all.map((provider) => ({
      ...provider,
      models: Object.fromEntries(Object.entries(provider.models).filter(([, info]) => info.status !== "deprecated")),
    })),
  }
}

export function sanitizeProject(project: Project) {
  if (!project.icon?.url && !project.icon?.override) return project
  return {
    ...project,
    icon: {
      ...project.icon,
      url: undefined,
      override: undefined,
    },
  }
}
