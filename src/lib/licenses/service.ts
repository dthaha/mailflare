import type { LicenseEntitlements, LicenseStatus } from "./types";

/**
 * This build is not licensed by the upstream vendor and does not phone home.
 *
 * Upstream gates branding, forwarding and multi-user account management behind
 * purchased Pro/Team keys checked against a third-party licensing service. Here
 * every entitlement is on and nothing leaves the install: the code that reads
 * these values is unchanged, so the features work exactly as the vendor's Team
 * plan does, and there is no key to store, hash or leak.
 */
const SELF_HOSTED_ENTITLEMENTS: LicenseEntitlements = {
	plan: "team",
	canCustomizeBranding: true,
	canManageAccounts: true,
	canForwardEmail: true,
};

const SELF_HOSTED_STATUS: LicenseStatus = {
	plan: "team",
	state: "active",
	features: [],
	instanceId: "self-hosted",
	instanceUrl: null,
	active: true,
	activatedAt: null,
	validatedAt: null,
};

export async function getLicenseStatus(_env?: unknown): Promise<LicenseStatus> {
	return SELF_HOSTED_STATUS;
}

export async function getLicenseEntitlements(_env?: unknown): Promise<LicenseEntitlements> {
	return SELF_HOSTED_ENTITLEMENTS;
}
