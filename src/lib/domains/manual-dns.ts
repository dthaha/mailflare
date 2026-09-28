import { queryDns } from "@/lib/dns-query";
import type { CfDnsRecord } from "@/lib/cloudflare-api.types";
import type { DomainDnsView } from "@/lib/domains/service";

/**
 * The DNS a domain needs when Mailflare runs on Workers with Email Routing.
 * Cloudflare writes most of these when the domain is onboarded to Email
 * Routing / Email Sending; the list exists so the operator can see what has to
 * exist and so Mailflare can verify it over public DNS without holding a token.
 */
export function getExpectedRoutingRecords(hostname: string): CfDnsRecord[] {
	return [
		{ type: "MX", name: hostname, content: "route1.mx.cloudflare.net", priority: 10, ttl: 1 },
		{ type: "MX", name: hostname, content: "route2.mx.cloudflare.net", priority: 20, ttl: 1 },
		{ type: "MX", name: hostname, content: "route3.mx.cloudflare.net", priority: 30, ttl: 1 },
		{ type: "TXT", name: hostname, content: "v=spf1 include:_spf.mx.cloudflare.net ~all", ttl: 1 },
		{ type: "TXT", name: `cf2024-1._domainkey.${hostname}`, content: "v=DKIM1; ... (key from Email Routing > Settings)" },
		{ type: "TXT", name: `_dmarc.${hostname}`, content: "v=DMARC1; p=none", ttl: 1 },
	];
}

export function getExpectedSendingRecords(hostname: string): CfDnsRecord[] {
	return [
		{ type: "MX", name: `cf-bounce.${hostname}`, content: "route1.mx.cloudflare.net", priority: 10, ttl: 1 },
		{ type: "TXT", name: `cf-bounce.${hostname}`, content: "v=spf1 include:_spf.mx.cloudflare.net ~all", ttl: 1 },
		{ type: "TXT", name: `cf-bounce._domainkey.${hostname}`, content: "v=DKIM1; ... (key from Email Sending > Settings)" },
	];
}

export const MANUAL_DKIM_SELECTOR = "cf2024-1";

/**
 * The DNS page for a manually managed domain.
 *
 * The zone records Cloudflare would report do not exist for us, so the expected
 * routing records are listed as "missing" — they are a checklist, not a claim
 * that anything is wrong. The audit rendered alongside this view checks each one
 * against public DNS, and sending is reported as enabled only when the sending
 * DKIM record actually resolves.
 */
export async function getManualDomainDns(_env: unknown, hostname: string): Promise<DomainDnsView> {
	let sendingEnabled = false;
	try {
		sendingEnabled = (await queryDns(`cf-bounce._domainkey.${hostname}`, "TXT")).length > 0;
	} catch {
		// A lookup that fails outright is "unknown", not "missing": leave it off.
		sendingEnabled = false;
	}

	return {
		routing: {
			records: [],
			missing: getExpectedRoutingRecords(hostname),
			status: "manual",
		},
		sending: getExpectedSendingRecords(hostname),
		sendingEnabled,
		dkimSelector: MANUAL_DKIM_SELECTOR,
	};
}
