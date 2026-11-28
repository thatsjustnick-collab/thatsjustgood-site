# Turning on the events system and My Impact Hub

The events system (RSVPs, the team building planner, deposits, reminders, check-in, impact reports and the dashboard)
is built and deployed. It switches on when these three services are connected. Until then:

- The **planner** still works: requests arrive as Netlify form emails, so no lead is lost.
- The **events lists** on Home, Community and Kids show the "coming soon" sign-up instead of events.

Keys never go in this repository or in a chat. They go only into Netlify (step 4).

## 1. Supabase (database and dashboard sign-in)

1. Create the project at https://supabase.com/dashboard/new: name `thatsjustgood`, region **East US**.
2. Create the tables: open https://supabase.com/dashboard/project/_/sql/new, paste everything from
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Set the sign-in links: https://supabase.com/dashboard/project/_/auth/url-configuration
   - Site URL: `https://thatsjustgood.com`
   - Redirect URLs: add `https://thatsjustgood.com/admin`, `https://hub.thatsjustgood.com/**` and `https://thatsjustgood.com/hub/**`
4. Let people create Hub accounts: https://supabase.com/dashboard/project/_/auth/providers, open **Email**, and make sure
   **Allow new users to sign up** is **on**. The dashboard stays private: only people on your Team list can open it.
5. Copy the keys from https://supabase.com/dashboard/project/_/settings/api-keys: the **Project URL**,
   the **publishable (anon) key** and the **secret (service_role) key**.

## 2. Stripe (deposits, balance invoices, supply chip-ins)

1. Secret key: https://dashboard.stripe.com/apikeys (starts with `sk_live_`).
2. Webhook: https://dashboard.stripe.com/webhooks, **Add endpoint**
   - URL: `https://thatsjustgood.com/api/stripe/webhook`
   - Events: `checkout.session.completed` and `invoice.paid`
   - Copy the **signing secret** (starts with `whsec_`).

## 3. Brevo (emails and texts)

1. API key: https://app.brevo.com/settings/keys/api
2. Verify the sending domain: https://app.brevo.com/senders/domain/list, add `thatsjustgood.com`, then add the DNS
   records it shows in GoDaddy (https://dcc.godaddy.com/control/portfolio/thatsjustgood.com/settings?subtab=dns).
3. Optional: the list ID for pop-up sign-ups, from https://app.brevo.com/contact/list
4. Texts (later): register for US texting in Brevo, then set `BREVO_SMS_SENDER`.

## 4. Netlify environment variables

Add each at https://app.netlify.com/projects/thatsjustgoodwebsite/configuration/env

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (service_role) key. Mark as secret. |
| `ADMIN_EMAILS` | Your email; you become the dashboard owner on first sign-in |
| `STRIPE_SECRET_KEY` | Stripe secret key. Mark as secret. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret. Mark as secret. |
| `BREVO_API_KEY` | Brevo API key. Mark as secret. |
| `EMAIL_FROM` | `dogood@thatsjustgood.com` |
| `NOTIFY_EMAIL` | Where new booking alerts go, e.g. `dogood@thatsjustgood.com` |
| `BREVO_LIST_ID` | Optional: Brevo list for pop-up sign-ups |
| `BREVO_SMS_SENDER` | Later, once texting is approved |

Then redeploy: https://app.netlify.com/projects/thatsjustgoodwebsite/deploys, **Trigger deploy → Deploy site**.

## 5. Point hub.thatsjustgood.com at the site

1. In Netlify, add the address: https://app.netlify.com/projects/thatsjustgoodwebsite/domain-management, click
   **Add a domain alias**, enter `hub.thatsjustgood.com`, and save.
2. In GoDaddy, add one DNS record: https://dcc.godaddy.com/control/portfolio/thatsjustgood.com/settings?subtab=dns,
   click **Add New Record**, choose **CNAME**, Name `hub`, Value `thatsjustgoodwebsite.netlify.app`, and save.
3. Back in Netlify's domain page, wait for the HTTPS certificate to show as active (usually under an hour).

Until then, the Hub also works at https://thatsjustgood.com/hub.

## 6. Sign in

Go to https://thatsjustgood.com/admin, enter the email from `ADMIN_EMAILS`, and click the link in your inbox.

## Where things live

| What | Where |
|---|---|
| Prices, deposit %, lead time, group sizes, causes | `netlify/lib/pricing.mjs` (shared by the site and server) |
| Every email's wording | `netlify/lib/emails.mjs` |
| Database tables | `supabase/schema.sql` |
| API | `netlify/functions/api.mjs` and `netlify/lib/` |
| Hourly reminders | `netlify/functions/reminders.mjs` |
| Public pages | `src/app.js`, `src/pages/` |
| Dashboard | `src/admin.html`, `src/admin.js` |
| Impact Hub app | `src/hub/` (screens), `netlify/lib/hub.mjs` (server), `netlify/lib/badges.mjs` (badges) |
| Tests | `npm test` (all flows, no outside services needed) and `node tests/dev-server.mjs 8888 --seed` for a local copy |
