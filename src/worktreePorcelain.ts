export interface WorktreePorcelainEntry {
  readonly path: string
  readonly head?: string
  readonly branch?: string
  readonly detached: boolean
}

export const parseWorktreePorcelain = (_input: string): ReadonlyArray<WorktreePorcelainEntry> => {
  throw new Error("parseWorktreePorcelain is not implemented yet")
}
