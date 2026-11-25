# LabStatus Outlook connection

The update uses the existing LabStatus site and D1 database. The website sends through Microsoft Graph with delegated Mail.Send authorization for glasses@thateyeplace.com. ChatGPT's Outlook connection does not authorize the independently hosted website, and its protected tokens are never copied into the site.

## Required Microsoft setup

1. Sign into https://entra.microsoft.com/ using the Microsoft 365 business account with permission to register apps. If GoDaddy prevents access or app registration, ask the Microsoft 365/GoDaddy tenant administrator to register this application; do not disable MFA or defederate the tenant.
2. Open **Identity → Applications → App registrations → New registration**. Name it **That Eye Place LabStatus**. Choose **Accounts in this organizational directory only**.
3. Add a **Web** redirect URI, exactly:
   `https://labstatus.anthonyperezabo.chatgpt.site/api/email/callback`
4. Under Microsoft Graph API permissions, add **Delegated** `User.Read` and `Mail.Send`. The website also requests `offline_access` for a refresh token. Grant administrator consent if tenant policy requires it. Do not grant application-wide mail permissions.
5. Under **Certificates & secrets**, create a client secret. Save the **Value**, not its ID, directly in LabStatus Site settings → Environment variables as `MS_CLIENT_SECRET` with **Secret** enabled. Do not paste it into chat or GitHub. Note its expiration date and replace it before expiry.
6. Copy the nonsecret **Application (client) ID** and **Directory (tenant) ID**. These can be supplied in chat for configuration as `MS_CLIENT_ID` and `MS_TENANT_ID`.

## Required site configuration

Keep `LABSTATUS_INTEGRATION_SECRET` unchanged; it is used by PatientUpdate prescriptions.

| Variable | Treatment | Purpose |
|---|---|---|
| `MS_CLIENT_ID` | Nonsecret | Entra Application (client) ID |
| `MS_TENANT_ID` | Nonsecret | Entra Directory (tenant) ID |
| `MS_CLIENT_SECRET` | Secret | Entra client secret Value |
| `SESSION_SECRET` | Secret | Random 48-byte or stronger value for session signing and token encryption |
| `ACCESS_PIN` | Secret | A new private staff access code; replace the old publicly committed code |
| `LABSTATUS_OWNER_EMAIL` | Optional; default `anthonyperezabo@gmail.com` | Owner ChatGPT identity allowed to connect/disconnect Outlook and send the approved test |

The previous implementation used an unsigned cookie and a publicly committed staff code. Old sessions are deliberately invalidated by this update. The owner can sign in with ChatGPT; other staff use the new secret ACCESS_PIN. The same private staff code confirms the existing Sent Rx action. Codes and tokens are never embedded in frontend source. Five failed login attempts per address are blocked for 15 minutes.

Configure the variables and deploy the prepared version to apply them. In the site, sign in as the owner, open **Email administration → Connect Outlook**, and complete Microsoft's authorization as glasses@thateyeplace.com. The server refuses a different mailbox. Refresh tokens are encrypted using SESSION_SECRET and saved only in the private database. Rotating SESSION_SECRET invalidates staff sessions and requires reconnecting Outlook.

## Approved live test

The owner approved **glasses@thateyeplace.com** as the test recipient on November 25, 2026. In Email administration, choose **Preview approved test email**, inspect the subject/body, then **Send approved test email**. The test endpoint accepts only this recipient and a subject starting `[LabStatus test]`. This test has no job ID and changes no customer record. Verify Graph acceptance and the received email/clickable scheduling link before declaring the live integration tested. The self-addressed test does not verify delivery to outside domains.

## Staff use

Save an optional email on a new or existing job. Choose **Send Ready for Pickup Email**, **Send Pickup Reminder**, or **Send Bring In Your Frame Email**. Edit the recipient, subject and message in the preview. Confirm resending if a previous notification was accepted or may have been sent. Click **Send email** explicitly. No status change triggers an email.

Only Microsoft Graph HTTP 202 advances notification status: ready/reminder emails complete **11. Sent Message for Pickup**, and Bring In Your Frame completes **12. Sent Message to Bring Frame**. When an active job is at **10. Ready for Pickup at TEP**, its record shows email actions and hides the manual status picker and other record-editing actions until a send succeeds; Close and email-address editing remain available. Existing notes and prescriptions remain visible. "Microsoft accepted" describes submission acceptance, not confirmed delivery. Failed requests leave job status unchanged. Timeouts and provider server errors are uncertain: check Outlook Sent Items before any intentional resend. Submission IDs and a per-job database lock prevent double clicks from sending twice. Stalled submissions can be explicitly reviewed after five minutes without sending mail. Accepted submissions with a failed job update have a separate recovery action that updates the record without resending.

Templates can be edited and saved in Email administration by authenticated staff. Connecting/disconnecting Outlook and test sending require the owner identity. Recipient addresses, templates, notification records, prescriptions and job APIs require server-side staff authorization and are returned with private/no-store headers. New mutations require a matching Origin header.

## Backups and deployment

- Previous live site: **version 27**, source commit `03e356466e7361d99c4c70320ecd369564015135`.
- GitHub backup branch: `backup/pre-outlook-20261125` preserves GitHub's previous main.
- The hosted source is newer than that GitHub backup; the implementation starts from the live source so prescriptions, notes, status flows and print behavior are retained.
- Migration 0005 only adds email tables and the optional customer_email column; it does not delete or rewrite existing job or prescription records.
- Keep the existing project ID and D1 binding. Do not create another site or database.
- Microsoft configuration and the private staff code were supplied, version 28 was deployed, and the approved self-addressed test was accepted and received on November 25, 2026. The later frame-email/status change uses fixture tests for its additional status transitions. No QuickBooks or accounting changes are included.

## Validation

`npm run test:email` exercises session forgery/expiry, encrypted tokens, HTML escaping and clickable scheduling, Graph response handling, SQLite migrations, guarded job/email routes, resend confirmation, concurrent sends, and status preservation on rejection/uncertainty. Type checking and production builds run separately. Provider calls in automated tests are fixtures; these do not establish live Microsoft authorization or delivery.
