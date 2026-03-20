import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { rm, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import z from "zod"
import { File } from "../../file"
import { Ripgrep } from "../../file/ripgrep"
import { LSP } from "../../lsp"
import { Instance } from "../../project/instance"
import { lazy } from "../../util/lazy"
import { which } from "../../util/which"

export const FileRoutes = lazy(() =>
  new Hono()
    .get(
      "/find",
      describeRoute({
        summary: "Find text",
        description: "Search for text patterns across files in the project using ripgrep.",
        operationId: "find.text",
        responses: {
          200: {
            description: "Matches",
            content: {
              "application/json": {
                schema: resolver(Ripgrep.Match.shape.data.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          pattern: z.string(),
        }),
      ),
      async (c) => {
        const pattern = c.req.valid("query").pattern
        const result = await Ripgrep.search({
          cwd: Instance.directory,
          pattern,
          limit: 10,
        })
        return c.json(result)
      },
    )
    .get(
      "/find/file",
      describeRoute({
        summary: "Find files",
        description: "Search for files or directories by name or pattern in the project directory.",
        operationId: "find.files",
        responses: {
          200: {
            description: "File paths",
            content: {
              "application/json": {
                schema: resolver(z.string().array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
          dirs: z.enum(["true", "false"]).optional(),
          type: z.enum(["file", "directory"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query").query
        const dirs = c.req.valid("query").dirs
        const type = c.req.valid("query").type
        const limit = c.req.valid("query").limit
        const results = await File.search({
          query,
          limit: limit ?? 10,
          dirs: dirs !== "false",
          type,
        })
        return c.json(results)
      },
    )
    .get(
      "/find/symbol",
      describeRoute({
        summary: "Find symbols",
        description: "Search for workspace symbols like functions, classes, and variables using LSP.",
        operationId: "find.symbols",
        responses: {
          200: {
            description: "Symbols",
            content: {
              "application/json": {
                schema: resolver(LSP.Symbol.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
        }),
      ),
      async (c) => {
        /*
      const query = c.req.valid("query").query
      const result = await LSP.workspaceSymbol(query)
      return c.json(result)
      */
        return c.json([])
      },
    )
    .get(
      "/file",
      describeRoute({
        summary: "List files",
        description: "List files and directories in a specified path.",
        operationId: "file.list",
        responses: {
          200: {
            description: "Files and directories",
            content: {
              "application/json": {
                schema: resolver(File.Node.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.list(path)
        return c.json(content)
      },
    )
    .get(
      "/file/content",
      describeRoute({
        summary: "Read file",
        description: "Read the content of a specified file.",
        operationId: "file.read",
        responses: {
          200: {
            description: "File content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.read(path)
        return c.json(content)
      },
    )
    .put(
      "/file/content",
      describeRoute({
        summary: "Write file",
        description: "Write text content to a specified file.",
        operationId: "file.write",
        responses: {
          200: {
            description: "Updated file content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator("json", File.WriteInput),
      async (c) => {
        const body = c.req.valid("json")
        const content = await File.write(body.path, body.content)
        return c.json(content)
      },
    )
    .post(
      "/file",
      describeRoute({
        summary: "Create file or directory",
        description: "Create a file or directory in the project.",
        operationId: "file.create",
        responses: {
          200: {
            description: "Created",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    ok: z.literal(true),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("json", File.CreateInput),
      async (c) => {
        const body = c.req.valid("json")
        await File.create(body.path, body.type)
        return c.json({ ok: true as const })
      },
    )
    .delete(
      "/file",
      describeRoute({
        summary: "Delete file or directory",
        description: "Delete a file or directory from the project.",
        operationId: "file.delete",
        responses: {
          200: {
            description: "Deleted",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    ok: z.literal(true),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("query", File.DeleteInput),
      async (c) => {
        const input = c.req.valid("query")
        await File.remove(input.path)
        return c.json({ ok: true as const })
      },
    )
    .post(
      "/file/move",
      describeRoute({
        summary: "Move file or directory",
        description: "Move or rename a file or directory in the project.",
        operationId: "file.move",
        responses: {
          200: {
            description: "Moved",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    ok: z.literal(true),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("json", File.MoveInput),
      async (c) => {
        const body = c.req.valid("json")
        await File.move(body.from, body.to)
        return c.json({ ok: true as const })
      },
    )
    .get(
      "/file/export",
      describeRoute({
        summary: "Export workspace",
        description: "Create and download a compressed archive of the current workspace directory.",
        operationId: "file.export",
        responses: {
          200: {
            description: "Compressed workspace archive",
          },
        },
      }),
      async () => {
        const tar = which("tar")
        if (!tar) throw new Error("tar is not available on the server")

        const name = (() => {
          const raw = basename(Instance.directory).trim() || "workspace"
          const safe = raw.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace"
          return `${safe}.tar.gz`
        })()
        const root = await mkdtemp(join(tmpdir(), "opencode-export-"))
        const file = join(root, name)
        const proc = Bun.spawn([tar, "-czf", file, "-C", Instance.directory, "."], {
          stderr: "pipe",
        })
        const code = await proc.exited
        if (code !== 0) {
          const err = await new Response(proc.stderr).text().catch(() => "")
          await rm(root, { recursive: true, force: true }).catch(() => undefined)
          throw new Error(err.trim() || "Failed to create archive")
        }

        setTimeout(() => {
          void rm(root, { recursive: true, force: true }).catch(() => undefined)
        }, 300_000)

        return new Response(Bun.file(file), {
          headers: {
            "cache-control": "no-store",
            "content-type": "application/gzip",
            "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          },
        })
      },
    )
    .get(
      "/file/status",
      describeRoute({
        summary: "Get file status",
        description: "Get the git status of all files in the project.",
        operationId: "file.status",
        responses: {
          200: {
            description: "File status",
            content: {
              "application/json": {
                schema: resolver(File.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const content = await File.status()
        return c.json(content)
      },
    ),
)
