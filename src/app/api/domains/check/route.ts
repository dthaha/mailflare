import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { MANUAL_ZONE_ID } from "@/lib/domains/provision";
import { setupDomainSchema } from "@/lib/validators";

/**
 * Domain verification in this build is a shape check, not a lookup: the install
 * has no Cloudflare credentials and cannot see the operator's zones. What the
 * domain needs is reported later as DNS records to create and is verified
 * against public DNS on the domain page.
 */
export async function POST(request: Request) {
	const env = getEnv();
	await requireUser(env, request);
	const parsed = setupDomainSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const hostname = parsed.data.hostname.toLowerCase().trim();
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) {
		return NextResponse.json({ error: "Enter a domain name, for example example.com" }, { status: 400 });
	}

	return NextResponse.json({ domain: { hostname, zone: { id: MANUAL_ZONE_ID, name: hostname } } });
}
