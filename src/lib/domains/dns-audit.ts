import type { CfDnsRecord } from "@/lib/cloudflare-api.types";
import { queryDns, type DnsQueryType } from "@/lib/dns-query";

export type DnsAuthRecord = "mx" | "spf" | "dkim" | "dmarc";
export type DnsAuthStatus = "ok" | "missing" | "unknown";

export type DnsAuthCheck = {
	record: DnsAuthRecord;
	label: string;
	name: string;
	status: DnsAuthStatus;
	found: string[];
};

export type DomainDnsAudit = {
	mx: DnsAuthCheck;
	spf: DnsAuthCheck;
	dkim: DnsAuthCheck;
	dmarc: DnsAuthCheck;
};

type AuditInput = {
	routing: { records: CfDnsRecord[]; missing: CfDnsRecord[] };
	sending: CfDnsRecord[];
	dkimSelector?: string;
};

function isTxt(record: CfDnsRecord) {
	return record.type?.toUpperCase() === "TXT";
}

function check(
	record: DnsAuthRecord,
	label: string,
	name: string,
	type: DnsQueryType,
	matches: (value: string) => boolean,
): Promise<DnsAuthCheck> {
	return queryDns(name, type).then(
		(answers) => {
			const found = answers.filter(matches);
			return { record, label, name, status: found.length > 0 ? "ok" : "missing", found };
		},
		() => ({ record, label, name, status: "unknown", found: [] }),
	);
}

const CLOUDFLARE_ROUTING_MX = /\.mx\.cloudflare\.net\.?$/i;

/**
 * Independently verifies the public DNS a domain needs.
 *
 * This is the only DNS check this build can do, and it is the one that matters:
 * the records are looked up over DNS-over-HTTPS from a public resolver, so the
 * answer reflects what the internet actually sees rather than what an API says
 * was configured. Email Routing requires the domain's MX to point at
 * Cloudflare's routing servers and the SPF record to authorize them. A name that
 * resolves is "ok", one that answers NXDOMAIN is "missing", and a lookup that
 * fails outright is "unknown".
 */
export async function auditDomainDns(
	hostname: string,
	view: AuditInput,
): Promise<DomainDnsAudit> {
	const expected = [...view.routing.records, ...view.routing.missing, ...view.sending];
	// The selector is known in manual mode; otherwise prefer what Cloudflare
	// reported, and fall back to the DKIM record name in the zone view.
	const dkimName =
		(view.dkimSelector
			? `${view.dkimSelector}._domainkey.${hostname}`
			: undefined) ??
		expected.find((record) => isTxt(record) && /_domainkey/i.test(record.name ?? ""))?.name;

	const [mx, spf, dmarc] = await Promise.all([
		check(
			"mx",
			"MX",
			hostname,
			"MX",
			(value) => CLOUDFLARE_ROUTING_MX.test(value.trim()),
		),
		check("spf", "SPF", hostname, "TXT", (value) =>
			/include:_spf\.mx\.cloudflare\.net/i.test(value),
		),
		check("dmarc", "DMARC", `_dmarc.${hostname}`, "TXT", (value) => /v=DMARC1/i.test(value)),
	]);

	const dkim: DnsAuthCheck = dkimName
		? await check("dkim", "DKIM", dkimName, "TXT", () => true)
		: {
				record: "dkim",
				label: "DKIM",
				name: `*._domainkey.${hostname}`,
				status: "unknown",
				found: [],
			};

	return { mx, spf, dkim, dmarc };
}
