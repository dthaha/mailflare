import { NextResponse } from "next/server";
import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { hasConflictingMxRecords } from "@/lib/domains/mx-records";
import { setupDomainSchema } from "@/lib/validators";
import { readJsonBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";

/**
 * Reports whether the domain already has MX records delivering mail somewhere
 * else, read from public DNS. Cloudflare Email Routing needs exclusive control
 * of the domain's MX records and this build never edits DNS, so the answer is a
 * warning the operator has to act on themselves.
 */
export async function POST(request: Request) {
	const env = getEnv();
	if (await hasAdminAccount(env)) {
		return NextResponse.json({ error: "Initial setup is already complete" }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json({ error: "Invalid MX check request" }, { status });
	}

	const parsed = setupDomainSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		const hostname = parsed.data.hostname.toLowerCase().trim();
		return NextResponse.json({ hasExistingMx: await hasConflictingMxRecords(hostname) });
	} catch (error) {
		const message = error instanceof Error ? error.message : "MX record check failed";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}
