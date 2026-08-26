import { execSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	type BrowserContext,
	test as base,
	chromium,
	expect,
	type Page,
} from "@playwright/test";

const EXT_PATH = path.resolve(process.cwd(), "dist");

// MV3 extensions need a persistent context (Playwright's documented pattern);
// the overridden context fixture loads the built extension from dist/.
const test = base.extend<{
	context: BrowserContext;
	page: Page;
}>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature requires a destructured first parameter
	context: async ({}, use) => {
		const profileDir = await mkdtemp(path.join(tmpdir(), "vibewrite-test-"));
		const context = await chromium.launchPersistentContext(profileDir, {
			headless: false,
			args: [
				`--disable-extensions-except=${EXT_PATH}`,
				`--load-extension=${EXT_PATH}`,
				"--no-first-run",
				"--window-position=0,0",
				"--window-size=1280,1024",
			],
		});
		// Make sure the service worker is up and its command listener registered
		// before any test sends keys.
		if (context.serviceWorkers().length === 0) {
			await context.waitForEvent("serviceworker", { timeout: 10_000 });
		}
		await use(context);
		await context.close();
	},
	page: async ({ context }, use) => {
		const page = context.pages()[0] ?? (await context.newPage());
		await use(page);
	},
});

test.beforeEach(async ({ context }) => {
	await context.route("http://local.test/", (route) =>
		route.fulfill({
			path: path.resolve(process.cwd(), "tests/fixtures/test.html"),
		}),
	);
});

test("Ctrl+M injects content script into the focused tab", async ({ page }) => {
	await page.goto("http://local.test/");
	await page.bringToFront();

	execSync("xdotool key ctrl+m");

	await page.waitForFunction(
		() => document.documentElement.dataset.vibewrite === "injected",
	);
});

test("second Ctrl+M on the same tab does not double-inject", async ({
	page,
}) => {
	await page.goto("http://local.test/");
	await page.bringToFront();

	const logs: string[] = [];
	page.on("console", (message) => logs.push(message.text()));

	execSync("xdotool key ctrl+m");
	await page.waitForFunction(
		() => document.documentElement.dataset.vibewrite === "injected",
	);

	execSync("xdotool key ctrl+m");
	await page.waitForTimeout(1000);

	const marker = await page.evaluate(
		() => document.documentElement.dataset.vibewrite,
	);
	expect(marker).toBe("injected");
	// The load log is the observable side effect of injection: exactly one
	// means the second press hit the idempotent guard.
	const loads = logs.filter((line) =>
		line.includes("[vibewrite] content script loaded"),
	);
	expect(loads).toHaveLength(1);
});
