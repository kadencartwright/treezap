import { Effect } from "effect"

const progressBarWidth = 24

export const progressEnabled = (enabled: boolean): boolean =>
  enabled && (process.stderr.isTTY || process.env.TREEZAP_PROGRESS === "1")

export const renderProgressBar = (
  label: string,
  current: number,
  total: number,
  detail: string
): string => {
  const ratio = total === 0 ? 1 : current / total
  const filled = Math.round(ratio * progressBarWidth)
  const empty = progressBarWidth - filled
  const bar = `${"#".repeat(filled)}${"-".repeat(empty)}`

  return `treezap: ${label} [${bar}] ${current}/${total}${detail === "" ? "" : ` ${detail}`}`
}

export const writeProgress = (enabled: boolean, message: string): Effect.Effect<void> =>
  progressEnabled(enabled)
    ? Effect.sync(() => {
        process.stderr.write(`\r\x1b[2K${message}`)
      })
    : Effect.void

export const clearProgress = (enabled: boolean): Effect.Effect<void> =>
  progressEnabled(enabled)
    ? Effect.sync(() => {
        process.stderr.write("\r\x1b[2K")
      })
    : Effect.void
