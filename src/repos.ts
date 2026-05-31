import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { Chunk, Data, Effect, Stream } from "effect";

export class DiscoverReposError extends Data.TaggedError("DiscoverReposError")<{
  readonly rootPath: string;
  readonly cause: unknown;
}> {}

export const discoverRepos = (
  rootPath: string,
): Stream.Stream<string, DiscoverReposError> => {
  const visit = (
    directory: string,
  ): Stream.Stream<string, DiscoverReposError> =>
    readRepositoryDiscoveryTarget(rootPath, directory).pipe(
      Stream.fromEffect,
      Stream.flatMap((target) => {
        if (target.kind === "repo") {
          return Stream.succeed(target.path);
        }

        return Stream.fromIterable(target.children).pipe(Stream.flatMap(visit));
      }),
    );

  return visit(rootPath);
};

type RepositoryDiscoveryTarget =
  | {
      readonly kind: "repo";
      readonly path: string;
    }
  | {
      readonly kind: "children";
      readonly children: Chunk.Chunk<string>;
    };

const readRepositoryDiscoveryTarget = (
  rootPath: string,
  directory: string,
): Effect.Effect<RepositoryDiscoveryTarget, DiscoverReposError> =>
  Effect.try({
    try: () => {
      if (hasGitDirectory(directory)) {
        return {
          kind: "repo",
          path: directory,
        };
      }

      return {
        kind: "children",
        children: Chunk.fromIterable(readDiscoverableChildren(directory)),
      };
    },
    catch: (cause): DiscoverReposError =>
      new DiscoverReposError({
        rootPath,
        cause,
      }),
  });

const ignoredDirectories = new Set([
  ".cache",
  ".git",
  "dist",
  "node_modules",
  "target",
]);

const hasGitDirectory = (directory: string): boolean => {
  const gitPath = join(directory, ".git");
  return existsSync(gitPath) && statSync(gitPath).isDirectory();
};

const readDiscoverableChildren = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && !ignoredDirectories.has(entry.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => join(directory, entry.name));
