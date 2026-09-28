# Manual setup: DNS and Email Routing

This build does not manage Cloudflare for you. It holds no API token, no account
id and no global key, so there is nothing it can change — or break — in your
account. Everything a domain needs is a dashboard step or a line of configuration
you write, and the app verifies the result by looking the records up in public
DNS instead of trusting an API.

The trade is deliberate: the features that disappear (automatic Email Routing
provisioning, MX conflict cleanup, sending-subdomain creation, rollback of
half-applied zone changes) are the ones that require writing to your zone. What
remains is a mail server that stores mail and tells you exactly what DNS has to
say for mail to arrive and leave.

## 1. Deploy the Worker

Use the **Deploy to Cloudflare** button or `npm run deploy`. Name the Worker
`mailflare` (or set `EMAIL_WORKER_NAME` to whatever you called it). There is no
`CF_TOKEN` to provide and no token permission list to get right.

The bindings that matter are already in `wrangler.jsonc`: `DB` (D1), `BUCKET`
(R2), the three Queues, the `RealtimeHub` Durable Object, and the `EMAIL`
`send_email` binding used for outbound mail.

## 2. Give the domain to Email Routing

In the Cloudflare dashboard: **Compute → Email Service → Email Routing**, select
**Onboard Domain**, and pick the domain. Cloudflare writes the DNS records for
you:

| Type | Name | Value |
| --- | --- | --- |
| MX | `@` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net` |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf2024-1._domainkey` | the DKIM key shown under **Email Routing → Settings** |

If the domain already has MX records pointing at another provider, delete them:
Email Routing needs exclusive control of the domain's MX records, and this build
will not touch them for you. Until they are gone, mail keeps going to the old
provider.

## 3. Point the addresses at this Worker

Add a routing rule (**Email Routing → Routing Rules → Create routing rule**) with
**Action: Send to a Worker** and **Worker: mailflare**. A single custom address
covers that mailbox; enabling the **Catch-all rule** with the same action covers
every address on the domain, which is usually what you want for a mail server
that decides for itself which mailboxes exist.

You can declare the same rules in `wrangler.jsonc` instead of clicking, if you
prefer them in version control (Wrangler 4.113.0 or newer):

```jsonc
{
	"addresses": ["*@your-domain.com"]
}
```

Wrangler creates a rule for each literal address and treats `*@domain` as the
catch-all; they are then reconciled on every deploy.

Add the domain in Mailflare (**Admin → Domains**) and it is live as soon as a
message arrives.

## 4. Sending (optional)

Outbound mail uses the `send_email` binding, which needs the domain onboarded to
**Email Sending** (**Compute → Email Service → Email Sending → Onboard Domain**).
That writes the `cf-bounce` MX, SPF and DKIM records and a DMARC record. Sending
requires a paid Workers plan.

Mailflare renders those records on the domain page and reports sending as
configured only when `cf-bounce._domainkey.<domain>` resolves in public DNS.

## 5. Verify

**Admin → Domains → DNS** shows four checks — MX, SPF, DKIM, DMARC — resolved
over DNS-over-HTTPS from a public resolver. They report what the internet sees,
which is the same thing a receiving mail server sees. Nothing in this
verification path needs credentials, and nothing in the app writes DNS.

## What about the DNS page's other buttons?

There are none. The per-record **Setup** button that upstream uses to create
records through the API is disabled for every domain in this build.

## Licensing

There is none to do. Upstream gates account management, branding and forwarding
behind Pro/Team keys validated against a third-party licensing service; this
build's entitlement layer always returns Team, calls nothing, and stores no key
hash or installation identifier. See `src/lib/licenses/service.ts`.
