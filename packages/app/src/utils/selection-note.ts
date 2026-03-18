import type { FileSelection } from "@/context/file"

export type PromptSelection = {
  path: string
  selection?: FileSelection
  quote: string
  preview?: string
}

function selection(selection: unknown) {
  if (!selection || typeof selection !== "object") return undefined
  const startLine = Number((selection as FileSelection).startLine)
  const startChar = Number((selection as FileSelection).startChar)
  const endLine = Number((selection as FileSelection).endLine)
  const endChar = Number((selection as FileSelection).endChar)
  if (![startLine, startChar, endLine, endChar].every(Number.isFinite)) return undefined
  return {
    startLine,
    startChar,
    endLine,
    endChar,
  } satisfies FileSelection
}

export function createSelectionMetadata(input: PromptSelection) {
  return {
    opencodeSelection: {
      path: input.path,
      selection: input.selection,
      quote: input.quote,
      preview: input.preview,
    },
  }
}

export function readSelectionMetadata(value: unknown): PromptSelection | undefined {
  if (!value || typeof value !== "object") return
  const meta = (value as { opencodeSelection?: unknown }).opencodeSelection
  if (!meta || typeof meta !== "object") return
  const path = (meta as { path?: unknown }).path
  const quote = (meta as { quote?: unknown }).quote
  if (typeof path !== "string" || typeof quote !== "string") return
  const preview = (meta as { preview?: unknown }).preview
  return {
    path,
    selection: selection((meta as { selection?: unknown }).selection),
    quote,
    preview: typeof preview === "string" ? preview : undefined,
  } satisfies PromptSelection
}

export function formatSelectionNote(input: { path: string; selection?: FileSelection; quote: string }) {
  const start = input.selection ? Math.min(input.selection.startLine, input.selection.endLine) : undefined
  const end = input.selection ? Math.max(input.selection.startLine, input.selection.endLine) : undefined
  const range =
    start === undefined || end === undefined
      ? "this file"
      : start === end
        ? `line ${start}`
        : `lines ${start} through ${end}`
  return [
    `The user selected an exact passage from ${range} of ${input.path}.`,
    `Treat only the quoted passage below as the edit target unless the user explicitly changes the target.`,
    `If they ask for a rewrite or revision, reply with replacement text only and no explanation.`,
    "",
    "<selection>",
    input.quote,
    "</selection>",
  ].join("\n")
}

export function parseSelectionNote(text: string): PromptSelection | undefined {
  const match = text.match(
    /^The user selected an exact passage from (this file|line (\d+)|lines (\d+) through (\d+)) of (.+?)\.\nTreat only the quoted passage below as the edit target unless the user explicitly changes the target\.\nIf they ask for a rewrite or revision, reply with replacement text only and no explanation\.\n\n<selection>\n([\s\S]+)\n<\/selection>$/,
  )
  if (!match) return
  const start = match[2] ? Number(match[2]) : match[3] ? Number(match[3]) : undefined
  const end = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : undefined
  return {
    path: match[5],
    selection:
      start !== undefined && end !== undefined
        ? {
            startLine: start,
            startChar: 0,
            endLine: end,
            endChar: 0,
          }
        : undefined,
    quote: match[6],
  } satisfies PromptSelection
}
