import z from "zod"
import path from "path"
import os from "os"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { NamedError } from "@opencode-ai/util/error"
import { ConfigMarkdown } from "../config/markdown"
import { ConfigPaths } from "../config/paths"
import { Log } from "../util/log"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { DiscoveryService } from "./discovery"
import { Glob } from "../util/glob"
import { pathToFileURL } from "url"
import type { Agent } from "@/agent/agent"
import { PermissionNext } from "@/permission/next"
import { InstanceContext } from "@/effect/instance-context"
import { Effect, Layer, ServiceMap } from "effect"
import { runPromiseInstance } from "@/effect/runtime"

const log = Log.create({ service: "skill" })

// External skill directories to search for (project-level and global)
// These follow the directory layout used by Claude Code and other agents.
const EXTERNAL_DIRS = [".claude", ".agents"]
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

export namespace Skill {
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
    content: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  export async function get(name: string) {
    return runPromiseInstance(SkillService.use((s) => s.get(name)))
  }

  export async function all() {
    return runPromiseInstance(SkillService.use((s) => s.all()))
  }

  export async function dirs() {
    return runPromiseInstance(SkillService.use((s) => s.dirs()))
  }

  export async function available(agent?: Agent.Info) {
    return runPromiseInstance(SkillService.use((s) => s.available(agent)))
  }

  export function fmt(list: Info[], opts: { verbose: boolean }) {
    if (list.length === 0) {
      return "No skills are currently available."
    }
    if (opts.verbose) {
      return [
        "<available_skills>",
        ...list.flatMap((skill) => [
          `  <skill>`,
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${pathToFileURL(skill.location).href}</location>`,
          `  </skill>`,
        ]),
        "</available_skills>",
      ].join("\n")
    }
    return ["## Available Skills", ...list.flatMap((skill) => `- **${skill.name}**: ${skill.description}`)].join("\n")
  }
}

export namespace SkillService {
  export interface Service {
    readonly get: (name: string) => Effect.Effect<Skill.Info | undefined>
    readonly all: () => Effect.Effect<Skill.Info[]>
    readonly dirs: () => Effect.Effect<string[]>
    readonly available: (agent?: Agent.Info) => Effect.Effect<Skill.Info[]>
  }
}

export class SkillService extends ServiceMap.Service<SkillService, SkillService.Service>()("@opencode/Skill") {
  static readonly layer = Layer.effect(
    SkillService,
    Effect.gen(function* () {
      const instance = yield* InstanceContext
      const discovery = yield* DiscoveryService

      const addSkill = async (
        match: string,
        skills: Record<string, Skill.Info>,
        skillDirs: Set<string>,
      ) => {
        const md = await ConfigMarkdown.parse(match).catch(async (err) => {
          const message = ConfigMarkdown.FrontmatterError.isInstance(err)
            ? err.data.message
            : `Failed to parse skill ${match}`
          const { Session } = await import("@/session")
          Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
          log.error("failed to load skill", { skill: match, err })
          return undefined
        })

        if (!md) return

        const parsed = Skill.Info.pick({ name: true, description: true }).safeParse(md.data)
        if (!parsed.success) return

        // Warn on duplicate skill names
        if (skills[parsed.data.name]) {
          log.warn("duplicate skill name", {
            name: parsed.data.name,
            existing: skills[parsed.data.name].location,
            duplicate: match,
          })
        }

        skillDirs.add(path.dirname(match))

        skills[parsed.data.name] = {
          name: parsed.data.name,
          description: parsed.data.description,
          location: match,
          content: md.content,
        }
      }

      const scanExternal = async (
        root: string,
        scope: "global" | "project",
        skills: Record<string, Skill.Info>,
        skillDirs: Set<string>,
      ) => {
        return Glob.scan(EXTERNAL_SKILL_PATTERN, {
          cwd: root,
          absolute: true,
          include: "file",
          dot: true,
          symlink: true,
        })
          .then((matches) => Promise.all(matches.map((match) => addSkill(match, skills, skillDirs))))
          .catch((error) => {
            log.error(`failed to scan ${scope} skills`, { dir: root, error })
          })
      }

      const remote = { task: undefined as Promise<{ skills: Record<string, Skill.Info>; skillDirs: Set<string> }> | undefined }

      function scanRemote() {
        if (remote.task) return remote.task
        remote.task = (async () => {
          const skills: Record<string, Skill.Info> = {}
          const skillDirs = new Set<string>()
          const config = await Config.get()

          for (const url of config.skills?.urls ?? []) {
            const list = await Effect.runPromise(discovery.pull(url))
            for (const dir of list) {
              skillDirs.add(dir)
              const matches = await Glob.scan(SKILL_PATTERN, {
                cwd: dir,
                absolute: true,
                include: "file",
                symlink: true,
              })
              for (const match of matches) {
                await addSkill(match, skills, skillDirs)
              }
            }
          }

          return { skills, skillDirs }
        })().catch((err) => {
          remote.task = undefined
          throw err
        })
        return remote.task
      }

      async function scan() {
        const base = await scanRemote()
        const skills = { ...base.skills }
        const skillDirs = new Set(base.skillDirs)
        const config = await Config.get()

        // Scan external skill directories (.claude/skills/, .agents/skills/, etc.)
        // Load global (home) first, then project-level (so project-level overwrites)
        if (!Flag.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
          for (const dir of EXTERNAL_DIRS) {
            const root = path.join(Global.Path.home, dir)
            if (!(await Filesystem.isDir(root))) continue
            await scanExternal(root, "global", skills, skillDirs)
          }

          for await (const root of Filesystem.up({
            targets: EXTERNAL_DIRS,
            start: instance.directory,
            stop: instance.project.worktree,
          })) {
            await scanExternal(root, "project", skills, skillDirs)
          }
        }

        // Scan .opencode/skill/ directories
        for (const dir of await ConfigPaths.directories(instance.directory, instance.project.worktree)) {
          const matches = await Glob.scan(OPENCODE_SKILL_PATTERN, {
            cwd: dir,
            absolute: true,
            include: "file",
            symlink: true,
          })
          for (const match of matches) {
            await addSkill(match, skills, skillDirs)
          }
        }

        // Scan additional skill paths from config
        for (const skillPath of config.skills?.paths ?? []) {
          const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
          const resolved = path.isAbsolute(expanded) ? expanded : path.join(instance.directory, expanded)
          if (!(await Filesystem.isDir(resolved))) {
            log.warn("skill path not found", { path: resolved })
            continue
          }
          const matches = await Glob.scan(SKILL_PATTERN, {
            cwd: resolved,
            absolute: true,
            include: "file",
            symlink: true,
          })
          for (const match of matches) {
            await addSkill(match, skills, skillDirs)
          }
        }

        log.info("init", { count: Object.keys(skills).length })
        return { skills, skillDirs }
      }

      return SkillService.of({
        get: Effect.fn("SkillService.get")(function* (name: string) {
          const next = yield* Effect.promise(scan)
          return next.skills[name]
        }),
        all: Effect.fn("SkillService.all")(function* () {
          const next = yield* Effect.promise(scan)
          return Object.values(next.skills)
        }),
        dirs: Effect.fn("SkillService.dirs")(function* () {
          const next = yield* Effect.promise(scan)
          return Array.from(next.skillDirs)
        }),
        available: Effect.fn("SkillService.available")(function* (agent?: Agent.Info) {
          const next = yield* Effect.promise(scan)
          const list = Object.values(next.skills)
          if (!agent) return list
          return list.filter(
            (skill) => PermissionNext.evaluate("skill", skill.name, agent.permission).action !== "deny",
          )
        }),
      })
    }),
  ).pipe(Layer.provide(DiscoveryService.defaultLayer))
}
