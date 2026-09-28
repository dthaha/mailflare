import type { DomainProvisioningResult } from "@/lib/domains/types";

/**
 * Zone id recorded for every domain, because this build never manages zones on
 * Cloudflare. The operator owns DNS and Email Routing; Mailflare only stores the
 * hostname and shows what has to exist for mail to arrive.
 */
export const MANUAL_ZONE_ID = "manual";

export function isManualZone(zoneId: string | null | undefined): boolean {
	return zoneId === MANUAL_ZONE_ID;
}

/**
 * Record a domain without touching Cloudflare.
 *
 * Mail arrives as soon as the operator's Email Routing rule points the domain's
 * addresses at this Worker, so there is nothing to provision, nothing to roll
 * back, and no partial state to repair: adding a domain is a database write and
 * the DNS page renders the records that have to exist.
 */
export async function provisionDomainOnCloudflare(
	_env: unknown,
	hostname: string,
	options?: { enableRouting?: boolean; enableSending?: boolean; replaceMxRecords?: boolean },
): Promise<DomainProvisioningResult> {
	const normalized = hostname.toLowerCase().trim();
	return {
		hostname: normalized,
		zone: { id: MANUAL_ZONE_ID, name: normalized },
		routingEnabled: options?.enableRouting ?? true,
		sendingRequested: options?.enableSending ?? true,
		// Sending state is read from public DNS rather than asserted here: whether
		// outbound mail works depends on the domain being onboarded to Email
		// Sending, which is the operator's step.
		sendingEnabled: false,
		sendingSubdomainTag: null,
		routingStatus: "manual",
		changes: {
			zoneId: MANUAL_ZONE_ID,
			enabledEmailRouting: false,
			createdSendingSubdomainTag: null,
			previousCatchAll: null,
			createdAddressRules: [],
			deletedMxRecords: [],
		},
	};
}
