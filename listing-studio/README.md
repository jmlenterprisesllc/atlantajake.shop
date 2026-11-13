# AtlantaJake Listing Studio

A separate, account-ready pilot for the owner's listing workflow. The public storefront is untouched. This directory is a Cloudflare Worker application, not another GitHub Pages page. Deploy the whole directory to Workers, not just the static UI.

## What works

- Master inventory CSV import (SKU, Item Name, RRP; other columns retained as factual source).
- Optional server-configured Google Sheets CSV refresh. This is read-only; there is no sheet writeback.
- Parent-folder selection with SKU matching and natural filename order. Rejects more than eight pictures per item rather than silently discarding pictures. Supports JPEG, PNG and WebP; convert HEIC first.
- Browser-local 2,000px JPEG copies at quality 0.86. Original files are never modified.
- Three concurrent photo uploads per item, checksum-based deduplication, three upload attempts, selectable cover image.
- Server-side OpenAI Responses image analysis with structured output, explicit uncertainty flags, and store rules. Cached analysis and a database lease guard duplicate paid calls. No automatic paid-call retry.
- Editable description, brand, category, size, color, age, styles, condition, price; explicit approval required before export.
- D1 records survive sessions after connection and processing; public image links are served from R2 through the Worker. No credentials or private inventory are checked into GitHub.
- Template version 6 CSV export, maximum 100 approved items per file. Exported items are excluded from subsequent exports. Export is not proof of Depop import or publication.

## Recommended setup

Use [SETUP.md](SETUP.md) for the private Google Drive workflow. It uses Drive originals directly and does not require R2. The legacy Mac-folder upload mode is optional. Drive-backed marketplace links still require a live Depop acceptance test.

## Legacy R2 setup (optional)

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up. This does not require moving the storefront or its DNS. Start with a workers.dev address.
2. Create an OpenAI developer account/project at https://platform.openai.com/ and configure API access/billing or available credits. Create a project API key. Do not paste it into GitHub, the browser dashboard, or a chat message.
3. On a development computer with Node installed, run `npm install` from this directory. Then `npx wrangler login`.
4. Run `npx wrangler r2 bucket create atlantajake-listing-photos` and `npx wrangler d1 create atlantajake-listings`. Enabling R2 may require billing setup. Account plans and usage limits apply.
5. Replace only the placeholder database ID in `wrangler.jsonc` with the D1 ID returned above. There is no storefront domain change.
6. Set secrets using the interactive terminal prompts:
   - `npx wrangler secret put ADMIN_TOKEN` — generate a long random token in your password manager; use at least 32 random bytes.
   - `npx wrangler secret put OPENAI_API_KEY`
   - `npx wrangler secret put OPENAI_MODEL` — use an available model supporting image input and structured Responses output; quality must be calibrated before large batches.
   - Optional: `npx wrangler secret put INVENTORY_CSV_URL` — accessible Google Sheets CSV export URL. Keep the sheet private if using CSV import instead; do not broaden sharing simply to enable refresh.
7. Run `npx wrangler d1 migrations apply atlantajake-listings --remote`, then `npm run deploy`.
8. Open the returned HTTPS address. Sign in with the password stored as ADMIN_TOKEN. API keys remain on the server. The password is checked on the server. A signed, Secure, HttpOnly, SameSite=Strict cookie grants a four-hour session. Dashboard HTML, scripts, taxonomy and inventory require sign-in. Only the login page, stylesheet and deliberately public image URLs are accessible without signing in. Signing out clears the cookie; rotating ADMIN_TOKEN invalidates sessions. Use a password-manager-generated password.

For local testing, use a local `.dev.vars` file (ignored by Git) for secrets, run the D1 migrations with `--local`, then `npm run dev`. Local image URLs cannot be fetched by the hosted OpenAI API: live image analysis requires a reachable HTTPS deployment.

## Pilot workflow

Import the current master inventory CSV, select SKU range, then select the parent photo folder. Use Upload & analyze selected. Keep the browser tab open while this pilot processes items sequentially; it does not yet run a durable background queue. If interrupted, reconnect, reselect folders for incomplete items and resume. Review/approve completed items before exports. Check file import results in Depop before marking anything listed elsewhere.

Validate against AJ1028–AJ1032 first: Woody Woodpecker identity, Tultex Augusta label and trim, Olympic embroidery, cut Hoyas collar, Earl Small's sleeve graphic and front mark. These private source photos are not included in this public repository.

## Store rules

- RRP × 1.25. A later 25% discount results in 93.75% of RRP.
- A → Used Excellent; AB → Used Good; B → Used Fair.
- Domestic shipping 0; international 25; United States.
- Color 2 Multi; source Vintage / Preloved; missing era 90s, flagged unverified; Style 3 Y2K. Explicit supported eras preserved.
- Named true manufacturers only, Other when unknown; never generic American Vintage tagging.
- Exact blank-line format, five lowercase hashtags, SKU last, no Instagram promotion, no featuring/quirky/edgy/dashes, 1,000-character maximum.
- Inventory notes and photos are source facts, never final copy or instructions.

Taxonomy is extracted from the provided version 6 template. This pilot is intentionally limited to adult crewneck sizes/categories. Check a fresh Depop template before expanding to footwear, accessories or children's clothing. No measurements are inferred from pixels.

## Drive and your domain

Drive folder ingestion and signed per-photo delivery are implemented. Configure the service identity, share only the master photo folder as Viewer, and enter server-side secrets as described in SETUP.md. This has been tested with mocked Google responses; live Google authorization and Depop image import remain unverified. Drive originals stay private; selected photo links are individually accessible for marketplace import. R2 is optional and has been removed from the default deployment configuration.

GitHub Pages cannot enforce this server sign-in wall. Route a studio subdomain or path to the authenticated backend after hosting is configured. Do not deploy public/ alone to Pages as a protected dashboard. No routing or deployment changes have been made.

## Not enabled yet

No direct Depop publishing, discount application, sold detection, automatic deletion, Google Sheets writeback, durable background processing, per-user accounts, or project-level usage budget enforcement. No photos are deleted by this release. Add sold-status integration and an agreed retention window before implementing deletion. Before expanding beyond the pilot, configure Cloudflare access/rate limits and OpenAI project limits and test failure recovery and analysis cost.

## Verification

`npm test` runs CSV/parser, store-rule, authentication, upload validation, cached-analysis and mocked image-analysis integration tests. These tests do not prove live account configuration, browser folder handling, visual quality of compressed originals, or Depop acceptance; those require the account-connected pilot.

## Reviewing a batch

Each listing needs explicit approval before CSV export. Export includes only approved records in the selected batch; other selected records can remain in review. This is a Studio workflow rule.

Approve & next saves the current review and opens the next analyzed, unapproved record in the current review selection. Save changes keeps the current item as a draft. Choosing a different cover saves that photo order and any pending form edits, clears approval, and keeps the existing analysis. Reapprove to advance; neither changing the cover nor approving calls OpenAI.

The editable title and the description's opening line stay synchronized. Title Case cleanup also applies to existing approved CSV exports without regenerating descriptions. New analyses use the expanded factual title, description and hashtag guidance in src/listing-prompt.js. Cached listings do not automatically receive a new semantic rewrite or another paid analysis. Keyword relevance and accurate attributes require item-specific review; formatting alone is not an SEO audit or ranking guarantee.
