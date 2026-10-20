import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // The real package throws outside a React server build; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "src/lib/test/server-only.ts"),
    },
  },
});
