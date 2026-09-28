export type LicensePlan = "community" | "pro" | "team";

export type LicenseState = "inactive" | "active" | "invalid" | "expired" | "deactivated";

export type LicenseStatus = {
	plan: LicensePlan;
	state: LicenseState;
	features: string[];
	instanceId: string;
	instanceUrl: string | null;
	active: boolean;
	activatedAt: Date | null;
	validatedAt: Date | null;
};

export type LicenseEntitlements = {
	plan: LicensePlan;
	canCustomizeBranding: boolean;
	canManageAccounts: boolean;
	canForwardEmail: boolean;
};
