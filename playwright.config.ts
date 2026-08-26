import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // xdotool sends real OS-level keys to the focused window: parallel workers
  // would race for focus, so tests must run one at a time.
  workers: 1,
  globalSetup: "./tests/global-setup.ts",
  reporter: [["list"]],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
