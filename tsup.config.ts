import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
  },
  format: ["esm"],
  target: "node22",
  clean: true,
  dts: false,
  external: ["better-sqlite3"],
});
