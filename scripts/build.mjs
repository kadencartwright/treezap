import { chmod } from "node:fs/promises"

import * as esbuild from "esbuild"

await esbuild.build({
  bundle: true,
  entryPoints: ["src/main.ts"],
  format: "cjs",
  outfile: "dist/main.cjs",
  platform: "node",
  target: "node22"
})

await chmod("dist/main.cjs", 0o755)
