// Idempotent guard: every key press triggers a fresh injection (Chrome does
// not deduplicate), so the marker check must run before anything else and
// later additions (listeners, UI) must never stack.
// Note: written as an inverted guard because a top-level `return` does not
// compile under module: ES2022 — same semantics as "return if marker exists".
if (!document.documentElement.dataset.vibewrite) {
	document.documentElement.dataset.vibewrite = "injected";
	console.log("[vibewrite] content script loaded");
}
