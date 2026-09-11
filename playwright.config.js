import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4286",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve.js",
    env: { PORT: "4286" },
    url: "http://127.0.0.1:4286",
    reuseExistingServer: false,
  },
});
