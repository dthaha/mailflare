import type { SetupRequirementCheck } from "./types";

export function getSetupRequirementChecks(env: CloudflareEnv): SetupRequirementCheck[] {
	return [
		{
			key: "Email Routing (manual)",
			configured: true,
			message:
				"This install does not configure Cloudflare for you. Onboard the domain to Email Routing, point an address or the catch-all at this Worker, and create the records shown on the domain page.",
		},
		{
			key: "D1 database",
			configured: !!env.DB,
			message: "Deploy the Worker with the DB binding from wrangler.jsonc.",
		},
	];
}
