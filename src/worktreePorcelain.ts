export interface WorktreePorcelainEntry {
  readonly path: string
  readonly head?: string
  readonly branch?: string
  readonly detached: boolean
}

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key]
}

type WorktreePorcelainEntryDraft = Partial<Mutable<WorktreePorcelainEntry>> & {
  detached: boolean
}

const branchNameFromRef = (ref: string): string =>
  ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref

const applyRecordLine = (draft: WorktreePorcelainEntryDraft, line: string) => {
  if (line.startsWith("HEAD ")) {
    draft.head = line.slice("HEAD ".length)
    return
  }

  if (line.startsWith("branch ")) {
    draft.branch = branchNameFromRef(line.slice("branch ".length))
    return
  }

  if (line === "detached") {
    draft.detached = true
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
    detached: false
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
    branch: draft.branch,
    detached: draft.detached
  }
}

export const parseWorktreePorcelain = (input: string): ReadonlyArray<WorktreePorcelainEntry> =>
  input
    .split(/\r?\n\r?\n/)
    .flatMap((record) => {
      const entry = parseRecord(record)
      return entry === undefined ? [] : [entry]
    })
