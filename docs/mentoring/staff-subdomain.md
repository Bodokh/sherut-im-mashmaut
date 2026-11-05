# Staff subdomain cutover

The staff app ("ליווי") moves from `https://www.imashmaut.co.il/staff` to `https://staff.imashmaut.co.il`. It stays in this Next.js deployment. There is no second Vercel project and no Clerk satellite domain.

Do these steps in order. Pointing DNS at the staff hostname before the production deployment that contains `NEXT_PUBLIC_STAFF_HOST` serves the public website on that hostname, because host routing is inactive until the variable is baked into the build.

## What the deployment already does

`NEXT_PUBLIC_STAFF_HOST` is the hostname only, for example `staff.imashmaut.co.il`. A scheme, path, or port is ignored. `www.imashmaut.co.il` and `imashmaut.co.il` are rejected so a bad value cannot take the public site offline. Any other invalid hostname is ignored.

When the variable is unset, which is the local and Preview state, nothing below changes. Staff stays at `/staff`, and Clerk does not receive an authorized-party list.

When it is set to `staff.imashmaut.co.il`:

| Request | Result |
| --- | --- |
| `https://staff.imashmaut.co.il/` | Rewrite to the staff home. Signed-out visitors go to `/login`. |
| `https://staff.imashmaut.co.il/participants` | Rewrite to `/staff/participants`. The same pattern covers the rest of the staff app. |
| `https://staff.imashmaut.co.il/api/mentoring/...` | Staff API on that host. No prefix change. |
| `https://staff.imashmaut.co.il/staff/participants?tab=1` | `308` to `https://staff.imashmaut.co.il/participants?tab=1`. |
| `https://www.imashmaut.co.il/staff/participants?tab=1` and the apex equivalent | `308` to `https://staff.imashmaut.co.il/participants?tab=1`. |
| `https://staff.imashmaut.co.il/robots.txt` | `User-agent: *` / `Disallow: /`, plus `X-Robots-Tag: noindex, nofollow`. |
| `https://staff.imashmaut.co.il/sitemap.xml`, `/api/contact`, `/api/revalidate-videos` | `404`. |
| `https://staff.imashmaut.co.il/about` and other public pages | Not the public site. The request is rewritten under `/staff` and then follows staff auth, so a signed-out visitor reaches `/login`. |
| `https://www.imashmaut.co.il/manifest.webmanifest` | Unchanged public-site manifest. |

Query strings are kept. The browser does not send the fragment, so a redirect cannot keep it.

Staff links, Clerk sign-in and sign-up URLs, the post-sign-in URL, the sign-out URL, the service-worker scope, and the staff manifest `id` / `start_url` / `scope` are root-relative on that build (`/login`, `/`, `/staff-sw.js`). They are not hardcoded to a host. On a build without the variable they stay under `/staff`.

The staff host manifest is served by `proxy.ts`. On that host, `id`, `start_url`, and `scope` are `/`. On any other host, `GET /staff/manifest.webmanifest` returns the same document with those three fields set to `/staff`. This stays valid whether or not the separate manifest route from the testimonials pull request is merged: the proxy answers before a route handler, and a manifest whose scope is `/staff` would be wrong once the app is mounted at `/`.

## 1. Merge, then set the production variable

In the Vercel project that already serves `www.imashmaut.co.il`, add this to **Production only**. Do not set it for Preview or Development.

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_STAFF_HOST` | `staff.imashmaut.co.il` |

No `https://`, no trailing slash, no port.

Do not add `NEXT_PUBLIC_CLERK_IS_SATELLITE`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, or `NEXT_PUBLIC_CLERK_SIGN_UP_URL`. Sign-in URLs are set in code. Satellite mode is for a different registrable domain and would break the shared `.imashmaut.co.il` session.

Redeploy Production after saving the variable. Next.js inlines `NEXT_PUBLIC_*` at build time. Changing the variable without a new production deployment does not change routing or links.

Confirm the redirect before any DNS change:

```sh
curl -sI https://www.imashmaut.co.il/staff/participants?tab=1
```

Expect `308` and `Location: https://staff.imashmaut.co.il/participants?tab=1`. Until this header is live, do not publish the DNS record.

## 2. Add the domain in the same Vercel project

Project → Settings → Domains → Add Domain → `staff.imashmaut.co.il`.

Assign it to Production. Do not create another project, and do not attach this hostname to Preview.

Vercel will show the DNS record this project expects. Copy that record. Current Vercel documentation gives each project its own CNAME target, for example `d1d4fc829fe7bc7c.vercel-dns-017.com`. Some older projects still show `cname.vercel-dns.com`. Use the target on this project's domain card. A target copied from a different project leaves the domain invalid.

Do not change nameservers. Do not edit the apex, `www`, `clerk`, email, or the existing verification records.

## 3. DNS

At the DNS host that already publishes `imashmaut.co.il`, add only the record Vercel displayed:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `staff` | The exact target from the Vercel domain card |

Some DNS panels require the full name `staff.imashmaut.co.il`. Use one name, not both. Do not also add an A or AAAA record for `staff`. Remove a conflicting A, AAAA, or CNAME if the panel already has one for that name.

If `imashmaut.co.il` is hosted on Vercel DNS, add the CNAME there. If it is hosted at the registrar or another DNS provider, add it at that provider. Do not move the rest of the zone.

Wait until Vercel shows the domain as valid and the certificate is issued. Then:

```sh
curl -sI https://staff.imashmaut.co.il/robots.txt
curl -sI https://staff.imashmaut.co.il/sitemap.xml
curl -sI https://staff.imashmaut.co.il/
curl -sI https://www.imashmaut.co.il/
```

Expect the staff robots body to disallow `/`, the sitemap to be `404`, the staff root to redirect a signed-out browser to `/login`, and `www` to remain the public site.

## 4. Clerk

Production instance `sherut-mentoring-production-auth`, root domain `imashmaut.co.il`, Frontend API `clerk.imashmaut.co.il`.

Do not add a satellite domain. Do not change the instance domain or the Frontend API. Subdomains of the configured root share the session cookie. Clerk's satellite setup is only for a different registrable domain, and it would send staff sign-in back through the primary domain.

The production build passes `authorizedParties` to `clerkMiddleware` and `allowedRedirectOrigins` to `ClerkProvider`:

- `https://www.imashmaut.co.il`
- `https://imashmaut.co.il`
- `https://staff.imashmaut.co.il`

Those lists are omitted when `NEXT_PUBLIC_STAFF_HOST` is unset, so local `http://localhost:3000` sessions are unchanged. The development `/__clerk` proxy still turns on only for a `pk_test_` publishable key.

### Allowed subdomains

Dashboard → the production instance → Domains → Allowed subdomains.

- If **Enable allowed subdomains** is off, `staff.imashmaut.co.il` can call the Frontend API with no dashboard change. Clerk recommends enabling the allowlist. If you enable it, add `www.imashmaut.co.il` and `staff.imashmaut.co.il`. The instance's primary domain is always allowed. Do not add `clerk.imashmaut.co.il`; that hostname is the Frontend API.
- If the allowlist is already on, add `staff.imashmaut.co.il` before the DNS cutover. Otherwise sign-in on the staff host fails. Confirm `www.imashmaut.co.il` is present when `www` is not the primary domain.

### Paths and redirects

Embedded sign-in uses the URLs from code: `/login`, `/signup`, and `/` on the staff host. Dashboard paths are still used by the Account Portal and by redirects Clerk constructs itself. A path such as `/staff/login` is resolved on the primary domain, which is no longer the staff app.

Set these absolute URLs on the production instance:

| Field | Value |
| --- | --- |
| Sign-in URL | `https://staff.imashmaut.co.il/login` |
| Sign-up URL | `https://staff.imashmaut.co.il/signup` |
| After sign-in URL | `https://staff.imashmaut.co.il/` |
| After sign-up URL | `https://staff.imashmaut.co.il/` |

Leave the Home URL on `https://www.imashmaut.co.il/` when the Account Portal logo should open the public site. If Home URL is currently `/staff`, change it to `https://staff.imashmaut.co.il/`.

In Allowed redirect URLs, add:

- `https://staff.imashmaut.co.il`
- `https://staff.imashmaut.co.il/`
- `https://staff.imashmaut.co.il/login`
- `https://staff.imashmaut.co.il/signup`

Keep the existing `www` and apex entries. An old bookmark such as `https://www.imashmaut.co.il/staff/login` is a `308` to `https://staff.imashmaut.co.il/login`, but Clerk checks the destination origin, so the staff origin has to be allowlisted on its own.

## 5. Google Cloud OAuth

The authorized redirect URI stays:

`https://clerk.imashmaut.co.il/v1/oauth_callback`

Do not add a staff redirect URI and do not remove the Clerk one. Google returns to Clerk's Frontend API. The app then continues at `/login` or `/` on the staff host.

Authorized JavaScript origins:

- If this OAuth client has no website origins, change nothing.
- If it already lists `https://www.imashmaut.co.il` or `https://imashmaut.co.il`, add `https://staff.imashmaut.co.il` beside them. Do not remove the existing origins.

## 6. Prove the staff host

1. Signed out, open `https://staff.imashmaut.co.il/`. The login screen is the staff login, and the address stays on the staff host.
2. Sign in with the existing production Google account. A session already created on `www` should be recognized, because both hosts share the `.imashmaut.co.il` cookie. Complete one Google sign-in on the staff host itself as well.
3. Sign out. The browser should land on `https://staff.imashmaut.co.il/login`.
4. Open `https://staff.imashmaut.co.il/participants` while signed in. The participant list loads, and its links have no `/staff` prefix.
5. `https://www.imashmaut.co.il/staff/participants?tab=1` permanently redirects to `https://staff.imashmaut.co.il/participants?tab=1`.
6. `https://staff.imashmaut.co.il/manifest.webmanifest` has `"start_url": "/"` and `"scope": "/"`. `https://www.imashmaut.co.il/manifest.webmanifest` is still the public-site manifest.
7. View source on a staff page and confirm the manifest link and the service-worker registration use `/` scope, not `/staff`.
8. The public homepage, `/about`, and `/sitemap.xml` on the staff host do not render the public site.

The internal reminder route `GET /api/internal/mentoring/reminders` is unchanged. The proxy does not run Clerk on it. It remains bearer-protected and reachable on both hosts.

Files in `public/` whose names contain a dot, including `/icon.png`, `/images/logo-mark.png`, and the home-film files, are still served on the staff host. The proxy matcher skips extensioned files, and the staff UI needs those icons. That does not serve the public HTML pages.

## Local and Preview

Leave `NEXT_PUBLIC_STAFF_HOST` unset. `npm run dev`, Preview URLs, and `http://localhost:3000/staff` keep today's paths.

A build with the variable set emits root-relative staff links. Use it only against the staff hostname. Opening that build at `/staff` on another host follows the production redirect rules.

## Rollback

Remove `NEXT_PUBLIC_STAFF_HOST` from Production and redeploy. Staff returns to `https://www.imashmaut.co.il/staff`. Then remove the `staff` CNAME and the Vercel domain.

Revert the Clerk path and redirect-URL changes in the same step. Leaving `https://staff.imashmaut.co.il/login` in the dashboard after the hostname is gone sends sign-in to a name that no longer routes.
