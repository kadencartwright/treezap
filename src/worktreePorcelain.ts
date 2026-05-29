export type WorktreePorcelainStatus =
  | {
      readonly kind: "branch"
      readonly branch: string
    }
  | {
      readonly kind: "detached"
    }
  | {
      readonly kind: "bare"
    }

export interface WorktreePorcelainAnnotation {
  readonly kind: "locked" | "prunable"
  readonly reason?: string
}

export interface WorktreePorcelainEntry {
  readonly path: string
  readonly head?: string
  readonly status: WorktreePorcelainStatus
  readonly annotations: ReadonlyArray<WorktreePorcelainAnnotation>
}

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key]
}

type WorktreePorcelainEntryDraft = Partial<Mutable<WorktreePorcelainEntry>> & {
  status: WorktreePorcelainStatus
  annotations: Array<WorktreePorcelainAnnotation>
}

const branchNameFromRef = (ref: string): string =>
  ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref

const applyRecordLine = (draft: WorktreePorcelainEntryDraft, line: string) => {
  if (line.startsWith("HEAD ")) {
    draft.head = line.slice("HEAD ".length)
    return
  }

  if (line.startsWith("branch ")) {
    draft.status = {
      kind: "branch",
      branch: branchNameFromRef(line.slice("branch ".length))
    }
    return
  }

  if (line === "detached") {
    draft.status = {
      kind: "detached"
    }
    return
  }

  if (line === "bare") {
    draft.status = {
      kind: "bare"
    }
    return
  }

  if (line === "locked") {
    draft.annotations.push({
      kind: "locked"
    })
    return
  }

  if (line.startsWith("locked ")) {
    draft.annotations.push({
      kind: "locked",
      reason: line.slice("locked ".length)
    })
    return
  }

  if (line === "prunable") {
    draft.annotations.push({
      kind: "prunable"
    })
    return
  }

  if (line.startsWith("prunable ")) {
    draft.annotations.push({
      kind: "prunable",
      reason: line.slice("prunable ".length)
    })
  }
}

const parseRecord = (record: string): WorktreePorcelainEntry | undefined => {
  const lines = record.split(/\r?\n/).filter((line) => line !== "")
  const [firstLine, ...remainingLines] = lines

  if (firstLine === undefined || !firstLine.startsWith("worktree ")) {
    return undefined
  }

  const draft: WorktreePorcelainEntryDraft = {
    path: firstLine.slice("worktree ".length),
    status: {
      kind: "detached"
    },
    annotations: []
  }

  for (const line of remainingLines) {
    applyRecordLine(draft, line)
  }

  if (draft.path === undefined) {
    return undefined
  }

  return {
    path: draft.path,
    head: draft.head,
    status: draft.status,
    annotations: draft.annotations
  }
}

export const parseWorktreePorcelain = (input: string): ReadonlyArray<WorktreePorcelainEntry> =>
  input
    .split(/\r?\n\r?\n/)
    .flatMap((record) => {
      const entry = parseRecord(record)
      return entry === undefined ? [] : [entry]
    })
