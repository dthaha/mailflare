import type { DomainProvisioningError } from "@/lib/domains/types";

export function getDomainProvisioningError(
	error: unknown,
	fallback: string,
	fallbackStatus = 400,
): DomainProvisioningError {
	return {
		message: error instanceof Error ? error.message : fallback,
		status: fallbackStatus,
	};
}
