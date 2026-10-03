import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import { readFileSync } from "fs";
const env = dotenv.parse(readFileSync(new URL(".env.test", import.meta.url)));
import path from "path";


export default defineConfig({
  test: {
    env: { ...env },
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
