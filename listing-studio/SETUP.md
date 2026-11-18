# Connect the private AtlantaJake studio

The code is ready for an account-connected pilot. It is not deployed. Browser sign-in inside ChatGPT is not a credential for this app. No existing photo folders need uploading again.

## Accounts and access needed

1. **Cloudflare:** create a free account. Workers runs the secure backend and D1 holds listing records; R2 is no longer required for the Drive workflow. No storefront migration or domain transfer is required. Free-plan CPU/request limits must be checked during the pilot before considering an upgrade.
2. **Google Cloud:** in the Google account owning the photos, create a project, enable the Google Drive API and create a service account named `atlantajake-listing-studio`. Do not assign project-wide roles or enable domain-wide delegation for Drive access. Create a JSON key and keep it on your computer securely. A service-account key is a secret; never commit it, upload it as a normal chat attachment, or paste it into chat.
3. Share only **AtlantaJake Master Listing Photos** with that service account's generated email as **Viewer**. Keep general access Restricted. This is the explicit read permission the studio needs; it does not need permission to edit/delete the originals or view your entire personal Drive. The service account sees other Drive resources only if they are separately shared with it.
4. Keep your existing OpenAI project API key for the server-side secret prompt below. Confirm API access/credits and select a model supporting image input and Responses structured output. Test cost and quality before processing many items.

## Deploy securely

From a local clone of branch `codex/listing-studio`, open a terminal inside `listing-studio`:

```
npm ci
npx wrangler login
npx wrangler d1 create atlantajake-listings
```

Copy the returned D1 database ID into the placeholder in `wrangler.jsonc`. The configured photo root is already `1Q7wJXiDGx13w11FZM6vix7mOZiUITEqU`.

Enter secrets through Wrangler's secure prompts, never in command arguments or a public file:

```
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put PHOTO_LINK_SECRET
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
```

Use independent password-manager-generated random values (at least 32 random bytes) for ADMIN_TOKEN and PHOTO_LINK_SECRET. ADMIN_TOKEN is the studio sign-in password. PHOTO_LINK_SECRET signs the individual photo delivery links; keep it stable while listings are live. Rotate it only when prepared to regenerate/reimport photo URLs. Paste the service account JSON into its secret prompt only.

Then run:

```
npx wrangler d1 migrations apply atlantajake-listings --remote
npm test
npm run deploy
```

Open the returned HTTPS workers.dev address and sign in. This is a pilot endpoint, not the storefront. After verification, a studio subdomain can route to it using the domain's DNS settings. Protecting a path on GitHub Pages itself requires routing/proxy support; do not simply publish `public/` to Pages and call that private.

## Five-item test

1. Import the master inventory CSV; select AJ1028–AJ1032.
2. Click **Load selected photos from Drive**. Confirm each cover image/order and ensure tags are readable.
3. Click **Analyze selected**. Review Woody Woodpecker, Tultex, Olympic embroidery, the cut Hoyas collar and Harley dealership/mark details.
4. Review usage in OpenAI billing and derive cost per item before a large batch. No automatic paid-call retry is enabled.
5. Approve the listings and download the CSV. Open at least one generated photo link in a signed-out window; it should show only that photo, never inventory or a Google login page.
6. Upload to Depop drafts and verify all photos, ordering, prices and descriptions. This is the required acceptance test, not an automated result we can assume. The app does not publish listings or apply discounts.

## Photo delivery and privacy

Drive originals remain private. The authenticated import verifies each SKU folder is directly inside the configured root. Individual delivery URLs are HMAC-signed and stream the matching photo through the backend with no Google credential in the URL. These links are bearer links: anyone holding one can view that particular photo, which is necessary for marketplace import. The dashboard, inventory and folder-list endpoints remain behind sign-in. Do not put sensitive non-product images in a SKU folder.

Drive permission errors, download quotas, deleted/moved files, large images or unsupported formats can still prevent an import. Actual Depop acceptance must be tested. The app does not delete originals or create R2 copies. Large originals are currently relayed at original resolution; client-side compression is available only for the optional Mac upload mode. Further image optimization should follow the pilot's readability and cost results.

## Current limits

- Browser-open sequential processing; durable unattended processing is not implemented yet.
- Adult crewneck taxonomy/sizes only; up to eight JPEG/PNG/WebP images per item. Additional images and unsupported formats stop import for that item instead of being silently dropped.
- No automated sales feed, photo deletion, discounting or inventory-sheet writeback.
- Records are marked exported after download; verify Depop import before treating them as live.
- Cloudflare account authorization, service identity sharing and secret entry must be completed by the owner through the appropriate secure account surfaces. ChatGPT's GitHub/Drive connections do not provision these credentials automatically.
