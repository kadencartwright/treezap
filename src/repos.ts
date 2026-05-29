import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { Effect } from "effect"

export interface DiscoverReposError {
  readonly _tag: "DiscoverReposError"
  readonly rootPath: string
  readonly cause: unknown
}

export const discoverRepos = (
  rootPath: string
): Effect.Effect<ReadonlyArray<string>, DiscoverReposError> =>
  Effect.try({
    try: () => {
      const repos: Array<string> = []

      const visit = (directory: string) => {
        if (hasGitDirectory(directory)) {
          repos.push(directory)
          return
        }

        const entries = readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name))
          .sort((left, right) => left.name.localeCompare(right.name))

        for (const entry of entries) {
          visit(join(directory, entry.name))
        }
      }

      visit(rootPath)
      return repos
    },
    catch: (cause): DiscoverReposError => ({
      _tag: "DiscoverReposError",
      rootPath,
      cause
    })
  })

const ignoredDirectories = new Set([
  ".cache",
  ".git",
  "dist",
  "node_modules",
  "target"
])

const hasGitDirectory = (directory: string): boolean => {
  const gitPath = join(directory, ".git")
  return existsSync(gitPath) && statSync(gitPath).isDirectory()
}
