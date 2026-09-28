/**
 * Shared-inbox features are always available in this build.
 *
 * Upstream reads a Team license out of the database to decide whether mailboxes
 * can be shared; the entitlement layer above already returns Team, and this
 * stays a function (rather than a constant) so the call sites keep their shape.
 */
export async function isTeamMailboxSharingEnabled(_db?: unknown): Promise<boolean> {
	return true;
}
