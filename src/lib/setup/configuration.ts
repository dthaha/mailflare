import { isNodeRuntime } from "@/lib/runtime";
import type { SetupRequirementCheck } from "./types";

export function getSetupRequirementChecks(env: CloudflareEnv): SetupRequirementCheck[] {
	if (isNodeRuntime(env)) {
		const mailer = env.EMAIL as unknown as { configured?: boolean };
		return [
			{
				key: "Database",
				configured: !!env.DB,
				message: "DATA_DIR must be writable; the SQLite database is created there on start.",
			},
			{
				key: "Outbound mail",
				configured: mailer?.configured === true,
				message: "Set SMTP_URL, or CF_ACCOUNT_ID with CF_TOKEN to send through Cloudflare. Receiving works without it.",
			},
			{
				key: "DNS and routing (manual)",
				configured: true,
				message: "Add MX and SPF records for each domain by hand and point them at this host, as shown on the domain page.",
			},
		];
	}

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
