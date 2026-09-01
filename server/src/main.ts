import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";

const MAX_BODY_BYTES = 65_536;
const CHAT_PATH = "/v1/chat/completions";
const COPILOT_TIMEOUT_MS = 60_000;

// sdk 1.0.11 resolves the bundled CLI via a "./sdk" export that platform
// package 1.0.82 no longer exposes, so resolve the CLI entrypoint ourselves.
const cliPath = createRequire(import.meta.url).resolve(
	"@github/copilot-linux-x64",
);

/** Request-scoped error carrying the HTTP status the handler must respond with. */
class RequestError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/** Minimal .env loader: KEY=VALUE lines, optional surrounding quotes, process.env wins. */
function loadEnvFile(): void {
	let raw: string;
	try {
		raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
	} catch {
		return; // no .env file — keep current process.env
	}
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			value.length >= 2 &&
			(value.startsWith('"') || value.startsWith("'")) &&
			value.at(-1) === value.at(0)
		) {
			value = value.slice(1, -1);
		}
		process.env[key] ??= value;
	}
}

/** OpenAI-style content part: string, array of {text}, or anything coercible. */
function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts = content as unknown[];
		return parts
			.map((part) =>
				typeof part === "object" &&
				part !== null &&
				"text" in part &&
				typeof part.text === "string"
					? part.text
					: "",
			)
			.join("");
	}
	return String(content ?? "");
}

/** Flatten OpenAI messages into one labeled prompt string. */
function buildPrompt(messages: unknown[]): string {
	const lines: string[] = [];
	for (const message of messages) {
		const role =
			message !== null && typeof message === "object" && "role" in message
				? message.role
				: undefined;
		const label =
			role === "system"
				? "System"
				: role === "assistant"
					? "Assistant"
					: "User";
		const content =
			message !== null && typeof message === "object" && "content" in message
				? message.content
				: undefined;
		lines.push(`${label}: ${contentToText(content)}`);
	}
	return lines.join("\n\n");
}

/** Read the request body, enforcing the size cap at both header and stream level. */
function readBody(req: IncomingMessage): Promise<Buffer> {
	const declared = req.headers["content-length"];
	if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
		return Promise.reject(new RequestError(413, "request body too large"));
	}
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let received = 0;
		let settled = false;
		const fail = (error: RequestError): void => {
			if (settled) return;
			settled = true;
			reject(error);
		};
		req.on("data", (chunk: Buffer) => {
			if (settled) return;
			received += chunk.length;
			if (received > MAX_BODY_BYTES) {
				fail(new RequestError(413, "request body too large"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (settled) return;
			settled = true;
			resolve(Buffer.concat(chunks));
		});
		req.on("error", () =>
			fail(new RequestError(400, "failed to read request body")),
		);
	});
}

/** Parse and validate the JSON body; only a non-empty messages array is accepted. */
function parseMessages(body: Buffer): unknown[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body.toString("utf8"));
	} catch {
		throw new RequestError(400, "invalid JSON body");
	}
	const messages =
		parsed !== null && typeof parsed === "object" && "messages" in parsed
			? parsed.messages
			: undefined;
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new RequestError(400, "messages must be a non-empty array");
	}
	return messages;
}

/**
 * Run one isolated Copilot exchange: fresh client + session per call,
 * zero tools (webpage text is a prompt-injection surface), 60s cap
 * covering the whole createSession + sendAndWait sequence.
 */
async function runCopilot(prompt: string, model: string): Promise<string> {
	const client = new CopilotClient({
		connection: RuntimeConnection.forStdio({ path: cliPath }),
	});
	let sessionId: string | undefined;
	try {
		const timeoutSignal = AbortSignal.timeout(COPILOT_TIMEOUT_MS);
		const timeoutError = new Error("copilot timeout");
		const timeout = new Promise<never>((_, reject) => {
			timeoutSignal.addEventListener("abort", () => reject(timeoutError), {
				once: true,
			});
		});
		return await Promise.race([
			(async () => {
				const session = await client.createSession({
					model,
					availableTools: [],
				});
				sessionId = session.sessionId;
				const event = await session.sendAndWait({ prompt });
				if (event === undefined) {
					throw new Error("copilot returned no assistant message");
				}
				return event.data.content;
			})(),
			timeout,
		]);
	} finally {
		// Fire-and-forget: never block the response on cleanup. A timeout during
		// createSession may orphan the session record on disk — rare, disk-only, acceptable.
		void (async () => {
			if (sessionId !== undefined) {
				await client.deleteSession(sessionId).catch(() => {});
			}
			await client.stop().catch(() => {});
		})();
	}
}

async function handleChat(
	req: IncomingMessage,
	send: (status: number, body: unknown) => void,
): Promise<void> {
	let messages: unknown[];
	try {
		messages = parseMessages(await readBody(req));
	} catch (error) {
		if (!(error instanceof RequestError)) throw error;
		send(error.status, { error: error.message });
		if (error.status === 413) req.destroy();
		return;
	}
	const model = process.env.COPILOT_MODEL ?? "gpt-5-mini";
	try {
		const content = await runCopilot(buildPrompt(messages), model);
		send(200, {
			choices: [{ message: { role: "assistant", content } }],
			model,
		});
	} catch (error) {
		send(500, {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

loadEnvFile();
if (!process.env.VW_SECRET) {
	console.warn(
		"[vibewrite-server] VW_SECRET is not set; all requests will be rejected",
	);
}
const PORT = process.env.PORT ?? "8018";

const server = createServer((req, res) => {
	const start = Date.now();
	const path = (req.url ?? "/").split("?")[0];
	const send = (status: number, body: unknown): void => {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(body));
		console.log(
			`${new Date().toISOString()} ${req.method} ${path} ${status} ${Date.now() - start}`,
		);
	};
	// Client disconnects surface as async stream errors; never crash the process.
	res.on("error", () => {});

	if (req.method !== "POST" || path !== CHAT_PATH) {
		send(404, { error: "not found" });
		return;
	}
	const secret = process.env.VW_SECRET ?? "";
	if (secret === "" || req.headers["x-vw-key"] !== secret) {
		send(401, { error: "unauthorized" });
		return;
	}
	void handleChat(req, send);
});

server.listen(Number(PORT), "0.0.0.0", () => {
	console.log(`[vibewrite-server] listening on 0.0.0.0:${PORT}`);
});
