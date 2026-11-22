# DealFlow integration and quality report

**Run date:** 2026-11-22  
**Scope:** Existing application, local frontend/backend, clearly labelled QA records, mocked email delivery, and read-only database verification. No schema changes or migrations.

## Environment and startup

- Frontend Vite application ran at `http://127.0.0.1:5173` and backend Express API at `http://localhost:3000`.
- Browser-based checks used headless Chrome at desktop and a 390px mobile viewport. The local UI used the existing cookie/CSRF flow and actual API rather than browser mocks for the core transaction journey.
- Backend ran with `EMAIL_PROVIDER=mock`. Authentication verification and password-reset UI flows used the app’s token/outbox workflow; no live Resend mail was sent.
- Arcjet configuration was inspected and left unchanged: non-production uses DRY_RUN and production remains LIVE. No authentication, authorization, or CSRF rules were disabled.
- Image and private-document flows used the application’s configured authenticated storage integration for QA records. No object URL or storage key is included here.
- The user’s existing account (database user ID 23) was read only: buyer, verified, active. It was not recreated, reset, deactivated, or otherwise modified; no email was sent to it.

## End-to-end workflow results

| Workflow | Result | Evidence / limits |
|---|---|---|
| Buyer/seller registration | Pass | Two uniquely named QA accounts registered through the UI; verification completed through the existing verification flow using the mocked outbox/token process. No Resend delivery claimed. |
| Login, logout, session and protected routes | Pass, scoped | Actual UI login/session and logout flows exercised. Buyer was denied admin dashboard (403); unrelated deal/conversation access returned 404. Exhaustive expired-cookie/CSRF attack testing was not performed. |
| Seller creates and edits listing | Pass, scoped | Listing 2 created in seller workspace; image upload/replace/remove/re-upload exercised through the seller UI. The published listing was then made visible by the user’s direct Neon status update, not by our admin moderation flow. |
| Public marketplace search and filters | Pass, scoped | QA listing found through actual marketplace search and supported financial filter parameters. URL/filter state and empty results checked. Sorting and pagination are covered by frontend/backend tests; not all combinations were manually traversed in the browser. |
| Public listing detail, seller identity, favorite | Pass | Seller identity and seller-provided image rendered. Buyer saved and removed the listing; personalized favorite state was reflected in detail UI. Listing report submitted successfully. |
| Buyer inquiry and conversations | Pass | Buyer started conversation 3 from listing 2, sent a message; seller inbox showed listing/buyer/latest message, opened thread, marked read, and replied. Participant restrictions checked for a non-participant conversation. |
| Offer and counteroffer | Pass | Buyer submitted EUR 110,000 offer 1; seller countered with EUR 115,000 offer 2; buyer accepted and deal status updated. UI showed accepted amount/state. |
| Deal documents | Pass for tested record | Seller uploaded a private QA text document through the deal room. Buyer and seller downloaded via the authenticated backend route; backend access logs show HTTP 200 and 41 bytes for both requests. No public R2 URL was exposed. Cross-deal buyer access was denied. |
| Notifications | Pass, scoped | Offer, conversation, deal, and document notification rows were generated. Buyer notification page showed unread count and a read mutation was reflected. Deletion UI/API was not separately exercised. |
| Account preferences | Pass | Buyer updated notification preferences in UI; repeated toggle/update succeeded after the payload fix. Deactivation was not executed to preserve test accounts. |
| Administrator workflows | Not fully tested | Buyer denial to admin endpoint was verified. No administrator credentials were used; moderation, user management, reports review and audit operations were not exercised in a live admin session. Listing publication was performed directly by the user in Neon. |
| Password recovery | Pass with mocked delivery | Reset events were processed with the mock provider and each QA account signed in again through the UI. No real email delivery was attempted. |
| Email delivery/provider | Not live-tested | Sender/domain verification at Resend and actual delivery remain unverified. Auth verification outbox events are not proof of Resend delivery. |

## Defects found and fixed

1. **Offer insertion PostgreSQL type inference.** Offer creation produced `UNION types text and integer cannot be matched` for notification recipient IDs and `42P18 could not determine data type of parameter` for JSON payload values. Explicit integer casts now match the actual integer IDs and JSON payload intent in `backend/src/services/deal.service.js`. The real UI offer → counteroffer → acceptance journey succeeded after the correction.
2. **Responding to an offer rejected valid route parameters.** The controller parsed `{ id, offerId }` with a strict deal-only schema, causing a 400 on accept/reject. A combined schema is now used in `backend/src/controllers/deal.controller.js` and `backend/src/validations/deal.validation.js`.
3. **Listing detail favorite state was not personalized.** The public detail route did not attach optional authentication, so `isFavorite` could be absent/stale and the buyer could not reliably remove a saved listing from that page. Optional auth and appropriate private no-store caching for authenticated responses are now applied in `backend/src/routes/listing.routes.js` and `backend/src/controllers/listing.controller.js`.
4. **Repeated notification preference updates sent server metadata back as input.** The UI spread response fields (`user_id`, timestamps) into the strict update request, making a later change fail validation. `AccountPage.tsx` now sends only supported preference booleans.
5. **Password-reset mail event was not queued/processed by the existing outbox path.** The reset service now queues the encrypted auth event and the outbox worker handles verification/reset templates with the configured provider; mock-based tests cover it. No token or secret is reported here.
6. **Anonymous Arcjet fingerprint edge case.** Anonymous requests could produce an invalid user identifier for the configured rule. A pseudonymous guest account key is now provided in `security.middleware.js`; Arcjet modes themselves were not changed.
7. **Pending listing form presented an inconsistent lock.** The listing title input remained editable while the other listing fields were locked pending moderation. It is now locked consistently, while image correction remains available and the reapproval explanation remains visible.
8. **Small-screen workspace overflow.** Buyer conversation and deal layouts, shared workspace navigation, and the seller overview grid could force a 390px viewport wider than the screen. Grid minimums and overflow behavior were corrected; live browser checks now show no horizontal overflow on the tested buyer and seller routes, including `/seller`.
9. **Accessibility and registration flow polish.** Public listing image alt text now identifies seller-provided imagery; buyer/seller audience pages have distinct role-appropriate content and registration role links retain the selected role.

These fixes were checked against the existing authorization, participant, validation, private storage and event/outbox flows. No trigger was disabled and no migration was needed.

## Database records used

All records below are QA records created during this run unless explicitly marked as pre-existing or user-modified. IDs are database IDs, not mock IDs. They are intentionally retained for manual inspection. Monetary amounts are EUR.

### Accounts

| Role | User ID | Email | Verification | Account state | Result |
|---|---:|---|---|---|---|
| Seller | 24 | `dealflow.qa.seller.20261122.1be13522-63b4-4d31-99ff-76d530706c38@dealflow.test` | Verified through app flow; mocked mail | Active | Core seller workflows passed, subject to admin gaps above |
| Buyer | 25 | `dealflow.qa.buyer.20261122.ccb825f3-79df-489d-b9a2-115760c80ff8@dealflow.test` | Verified through app flow; mocked mail | Active | Core buyer workflows passed, subject to admin gaps above |
| Existing buyer (pre-existing) | 23 | Not repeated | Verified | Active | Read only; untouched |

No account password, session cookie, token, or secret is included.

### Listing

| Listing ID | Seller ID | Title | Status | Result |
|---:|---:|---|---|---|
| 2 | 24 | DealFlow QA Coffee Roaster 20261122 | `published` | Created via seller UI; user directly changed status in Neon so it would be visible to buyer. `published_at` was null at inspection. No moderation metadata was synthesized by this test. |

Listing image upload, replacement, removal and final display were exercised. Public detail and card displayed the image; the local fallback remains available if the image fails to load.

### Conversation

| Conversation ID | Buyer ID | Seller ID | Listing ID | Status / result |
|---:|---:|---:|---:|---|
| 3 | 25 | 24 | 2 | Pending; buyer inquiry, buyer message, seller reply, inbox and read flow exercised |

### Offers and counteroffer

| Offer ID | Deal ID | Buyer ID | Seller ID | Amount | Status | Relationship / result |
|---:|---:|---:|---:|---:|---|---|
| 1 | 4 | 25 | 24 | EUR 110,000 | `superseded` | Original buyer offer; countered by offer 2 |
| 2 | 4 | 25 | 24 | EUR 115,000 | `accepted` | Seller counteroffer; accepted by buyer |

### Deal

| Deal ID | Listing ID | Buyer ID | Seller ID | Current status | Result |
|---:|---:|---:|---:|---|---|
| 4 | 2 | 25 | 24 | `accepted` | Offer acceptance and deal detail flow exercised |

### Documents

| Deal document ID | Source conversation document ID | Deal ID | File type | Upload | Download |
|---:|---:|---:|---|---|---|
| 2 | 4 | 4 | `text/csv` | Passed via authenticated private document workflow | Buyer 200; seller 200 (41 bytes each) |

The document name used for the QA upload was `dealflow-qa-deal-document-20261122.csv`. Private contents and storage identifiers are omitted.

### Notifications and report

| Notification ID | User ID | Event | Read state at inspection |
|---:|---:|---|---|
| 6 | 24 | `conversation.message` | Unread |
| 7 | 25 | `conversation.message` | Unread |
| 8 | 24 | `deal.created` | Unread |
| 9 | 24 | `deal.offer` | Unread |
| 10 | 24 | `deal.status_changed` | Unread |
| 11 | 25 | `deal.counteroffer` | Unread |
| 12 | 25 | `deal.document_added` | Read |
| 13 | 24 | `deal.status_changed` | Unread |
| 14 | 24 | `deal.offer_accepted` | Unread |

Report ID 1 belongs to buyer 25 and listing 2 (`other`, pending). The UI submission succeeded.

### Email outbox records

| Outbox ID | Type | State / result |
|---:|---|---|
| 9, 10 | `auth.email_verification` | Pending; app verification was completed using the test harness and existing auth flow, not Resend delivery |
| 11, 19, 20 | `auth.password_reset` | Processed by mock provider, one attempt each |

These rows are not evidence of external delivery. No real email was sent.

## Automated and static checks

| Area | Command | Result |
|---|---|---|
| Backend unit/mock suite | `cd backend && npm test` | Pass: 20 files, 177 tests. Integration directory excluded by the configured command. A first run executed concurrently with frontend build/load had two transient verification/timeout failures; isolated repeat passed all tests. |
| Backend lint | `cd backend && npm run lint` | Pass |
| Backend syntax | `node --check` on changed controller, middleware, route, service and validation files | Pass |
| Frontend unit/component suite | `cd frontend && npm test` | Pass: 18 files, 96 tests |
| Frontend lint | `cd frontend && npm run lint` | Pass |
| Frontend typecheck | `cd frontend && npm run typecheck` | Pass |
| Frontend production build | `cd frontend && npm run build` | Pass. Vite reports existing Zod comment-annotation notices and warns that the BarChart chunk (~430 KB) and main chunk (~624 KB) exceed 500 KB minified. |
| Patch whitespace | `git diff --check` | Pass |
| Browser verification | Local frontend/backend in headless Chrome, desktop and 390px mobile | Core buyer/seller marketplace transaction passed; tested seller/buyer routes have no mobile horizontal overflow after the fix. Not a substitute for all-role exhaustive E2E. |

No database integration test suite or migration command was run. The application itself used its configured database for authorized QA workflows and read-only status/ID verification; no pre-existing customer record was modified.

## Research and frontend improvements

Public marketplace patterns were reviewed from [Acquire.com](https://acquire.com/buyers/), [Flippa](https://flippa.com/search), and [BizBuySell](https://www.bizbuysell.com/businesses-for-sale/). Useful patterns include surfacing buyer/seller journeys separately, making search criteria and financial fields easy to scan, presenting financial data consistently, and keeping due diligence actions close to listing details. DealFlow changes remain original and use the project’s existing visual system. Existing local optimized landing imagery was reused; no marketplace branding or images were copied. The repository does not record provenance/licensing for every existing local image, so that should be documented before commercial launch.

UI improvements included distinct buyer/seller audience content, clearer registration role handling, better listing image descriptions, consistent pending-listing messaging, and responsive fixes for workspace navigation, conversation/deal screens, and seller overview. This run did not replace the design system or fully redesign every dashboard.

## Remaining issues and manual follow-up

- **Admin workflow:** Sign in with an authorized admin account and exercise moderation, user status changes, report review and audit history. The tested listing was published directly by the user in Neon; the normal admin approval path was not verified in this run.
- **Resend:** Verify the configured sender identity/domain in Resend and perform a real delivery check only when appropriate. Current verification/password reset results used the mock provider; no live Resend request was made.
- **Marketplace breadth:** Browser tests checked representative search/filter and empty-result cases. Exercise further sort/pagination combinations manually if needed; automated tests cover the supported parameters.
- **Account deactivation:** Not run because it would invalidate an account kept for inspection.
- **Email outbox verification events:** Verification records 9 and 10 remain pending in the outbox and should be reviewed by an operator if the desired operational behavior is to deliver those QA verification messages externally. No real delivery is represented here.
- **Image provenance:** Record license/source information for local public image assets.
- **Build size:** Consider later route/chart chunk splitting to address Vite’s >500 KB warning; it does not currently fail the build.
- **Formal integration suite:** Not run because repository scripts create and later delete database fixtures; the authorized browser workflow instead retained clearly identified QA records.

## Safety and change summary

- No schema changes or migration files were created; no migrations were executed.
- No pre-existing user/listing/customer record was changed by this work. The user changed listing 2’s publication status directly in Neon.
- No real Resend email was sent. No secrets, tokens, cookies, private document contents or signed storage URLs are included.
- No deployment, commit, push, branch change, or DevOps work was performed.
- Source, test, and report files changed are listed in the final chat response. Runtime log files generated while the local server ran are preserved in the worktree and were not cleaned up.
