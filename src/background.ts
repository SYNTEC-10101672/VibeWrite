// MV3 iron rule: every event listener must be registered synchronously at the
// top level — the service worker re-runs this file on wake-up after sleep,
// and any await before addListener would drop events in that window.
chrome.commands.onCommand.addListener((command, tab) => {
	if (command !== "trigger" || !tab?.id) {
		return;
	}
	chrome.scripting
		.executeScript({
			target: { tabId: tab.id },
			files: ["content.js"],
		})
		.catch((error: unknown) => {
			// Known limitation: restricted pages (chrome://, Web Store) always
			// reject injection — log and fail silently, never retry.
			console.warn("[vibewrite] injection failed:", error);
		});
});
