import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, mailboxes } from "@/db/schema";
import { ensureMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import { newId } from "@/lib/ids";
import type { CfDnsRecord } from "@/lib/cloudflare-api.types";
import { isManualZone, provisionDomainOnCloudflare } from "@/lib/domains/provision";
import { getManualDomainDns } from "@/lib/domains/manual-dns";
import type { DomainProvisioningChanges } from "@/lib/domains/types";

export type DomainDnsView = {
	routing: { records: CfDnsRecord[]; missing: CfDnsRecord[]; status?: string };
	sending: CfDnsRecord[];
	sendingEnabled: boolean;
	/** DKIM selector the routing records use, so the audit checks the right name. */
	dkimSelector?: string;
};

export async function listUserDomains(env: CloudflareEnv, userId: string) {
	const db = getDb(env);
	return db.select().from(domains).where(eq(domains.userId, userId));
}

export async function addDomainForUser(
	env: CloudflareEnv,
	userId: string,
	hostname: string,
	options?: { enableRouting?: boolean; enableSending?: boolean; replaceMxRecords?: boolean },
): Promise<{
	domain: typeof domains.$inferSelect;
	dns: DomainDnsView;
	changes: DomainProvisioningChanges;
}> {
	const db = getDb(env);
	const normalizedHostname = hostname.toLowerCase().trim();
	const [claimedHostname] = await db.select({ userId: domains.userId }).from(domains).where(eq(domains.hostname, normalizedHostname)).limit(1);
	if (claimedHostname && claimedHostname.userId !== userId) {
		throw new Error("Domain is already registered");
	}

	// Nothing is provisioned on Cloudflare: DNS stays the operator's, so adding a
	// domain is a local record plus the checklist the DNS page renders.
	const provisioned = await provisionDomainOnCloudflare(env, normalizedHostname, options);
	let insertedDomainId: string | null = null;
	let domain: typeof domains.$inferSelect;

	try {
		const [existing] = await db.select().from(domains).where(eq(domains.hostname, provisioned.hostname)).limit(1);
		if (existing && existing.userId !== userId) {
			throw new Error("Domain is already registered");
		}

		const domainId = existing?.id ?? newId("dom");
		const values = {
			id: domainId,
			userId,
			hostname: provisioned.hostname,
			zoneId: provisioned.zone.id,
			status: ("active" as const),
			routingStatus: provisioned.routingStatus ?? null,
			sendingSubdomainTag: provisioned.sendingSubdomainTag,
			sendingRequested: provisioned.sendingRequested,
			sendingEnabled: provisioned.sendingEnabled,
			routingEnabled: provisioned.routingEnabled,
		};

		if (existing) {
			await db.update(domains).set(values).where(eq(domains.id, domainId));
		} else {
			await db.insert(domains).values(values);
			insertedDomainId = domainId;
		}

		// Addresses a mailbox answers on every domain keep their stored list in
		// sync; with manual zones this is a no-op for routing rules, kept so the
		// address book stays consistent whether or not the domain was new.
		const aliasMailboxes = await db
			.select({ id: mailboxes.id, domainId: mailboxes.domainId, localPart: mailboxes.localPart, useAllDomains: mailboxes.useAllDomains })
			.from(mailboxes)
			.innerJoin(domains, eq(mailboxes.domainId, domains.id))
			.where(and(eq(domains.userId, userId), eq(mailboxes.useAllDomains, true)));
		const routingResults = await Promise.allSettled(
			aliasMailboxes.map((mailbox) => ensureMailboxDomainRouting(env, db, mailbox)),
		);
		for (const result of routingResults) {
			if (result.status === "rejected") console.warn("ensureMailboxDomainRouting", result.reason);
		}

		const [row] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
		domain = row!;
	} catch (err) {
		// The domain row is the only thing this wrote, and its own insert is the
		// only thing that can leave a partial record behind.
		if (insertedDomainId) {
			try {
				await db.delete(domains).where(eq(domains.id, insertedDomainId));
			} catch (cleanupError) {
				console.warn("addDomainForUser: failed to remove partial domain row", cleanupError);
			}
		}
		throw err;
	}

	let dns: DomainDnsView;
	try {
		dns = await getDomainDns(env, domain);
	} catch (error) {
		console.warn("addDomainForUser: failed to read DNS status", error);
		dns = {
			routing: { records: [], missing: [], status: provisioned.routingStatus },
			sending: [],
			sendingEnabled: false,
		};
	}
	return { domain, dns, changes: provisioned.changes };
}

export async function getDomainDns(
	env: CloudflareEnv,
	domain: typeof domains.$inferSelect,
): Promise<DomainDnsView> {
	if (isManualZone(domain.zoneId)) return getManualDomainDns(env, domain.hostname);
	// Defensive: older rows may carry a zone id from a build that could provision.
	// Nothing here can talk to Cloudflare, so they degrade to the manual checklist
	// rather than throwing in the DNS view.
	return getManualDomainDns(env, domain.hostname);
}

export async function removeDomainForUser(
	env: CloudflareEnv,
	userId: string,
	domainId: string,
): Promise<void> {
	const db = getDb(env);
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, userId)))
		.limit(1);
	if (!domain) throw new Error("Domain not found");

	// Mailflare never created routing rules, MX records or a sending subdomain for
	// this domain, so removing it forgets the domain and leaves DNS untouched.
	await db.delete(domains).where(eq(domains.id, domainId));
}

export async function getDomainForUser(env: CloudflareEnv, userId: string, domainId: string) {
	const db = getDb(env);
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, userId)))
		.limit(1);
	return domain ?? null;
}
