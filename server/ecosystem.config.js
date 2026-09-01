// pm2 process definition for the VibeWrite Copilot bridge.
// pm2 require()s this file and reads the named `apps` export (the ESM
// namespace object), so `apps` must be a named export — a bare default
// export is ignored by pm2 7.x.
// main.ts loads server/.env itself; explicit HOME/PATH keep the Copilot
// runtime spawnable under the pm2 daemon no matter how it was started.
export const apps = [
	{
		name: "vibewrite-server",
		script: "dist/main.js",
		cwd: import.meta.dirname,
		env: {
			HOME: process.env.HOME,
			PATH: process.env.PATH,
		},
	},
];
