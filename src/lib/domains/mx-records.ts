import { queryDns } from "@/lib/dns-query";

const CLOUDFLARE_ROUTING_MX = /\.mx\.cloudflare\.net\.?$/i;

/**
 * Whether a domain still has MX records that deliver mail somewhere other than
 * Cloudflare Email Routing.
 *
 * Cloudflare Email Routing needs exclusive control of the domain's MX records,
 * and this build will not delete anything on the operator's behalf, so the
 * answer comes from public DNS (DNS-over-HTTPS, no credentials) and is used to
 * warn before a domain is added: conflicting records have to be removed by hand
 * or mail keeps going to the old provider.
 */
export async function hasConflictingMxRecords(hostname: string): Promise<boolean> {
	const records = await queryDns(hostname, "MX");
	return records.some((value) => !CLOUDFLARE_ROUTING_MX.test(value.trim()));
}
