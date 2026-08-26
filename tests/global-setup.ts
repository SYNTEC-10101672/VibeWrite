import { execSync } from "node:child_process";

// Build the extension into dist/ once before any worker starts, so the
// loaded extension is always fresh.
export default function globalSetup(): void {
	execSync("npm run build", { stdio: "inherit" });
}
