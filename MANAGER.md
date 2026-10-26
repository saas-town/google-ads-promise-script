# Manager-account promise check

Draft for the manager-account release, to merge into the public repository README.

`manager-check.js` is the manager-account (MCC) variant of the promise check. It reads your client accounts' enabled responsive search ads. It checks each final URL with the single-account rules, then mails one summary. It changes no ads and sends no account data to AdPromise.

Use it when you manage several client accounts and want one weekly summary. Use `promise-check.js` when you want a check in one account.

## Paste and preview

1. Sign in to your Google Ads manager account.
2. Open Tools, then Bulk actions, then Scripts.
3. Click the plus button, choose New script, and replace the default code with `manager-check.js`.
4. Find `CONFIG` near the top. To check specific clients, put their customer IDs in `CONFIG.accountIds`, for example `['123-456-7890']`. Leave the list empty to check every client account up to the cap. Set `CONFIG.ownerEmail` to mail someone else; leave it empty to mail the signed-in owner.
5. Click Authorize, then Preview. Preview reads the accounts and sends the summary, so you can read the result before you schedule it.
6. Read the summary. Then set the schedule to weekly, and save.

The manager account must already have access to each client account. A client account that Google Ads refuses is listed under "Skipped accounts". A requested ID that Google Ads does not return is also listed there. The run continues with the other accounts.

## What it reads and changes

The script reads each ad's copy, final URL, campaign, ad group, and cost. It also reads each client account's name and customer ID. Its only outside requests go to the final URLs and to the one summary email. It changes nothing in any account, and AdPromise receives no account data.

## Limits for each run

- 20 client accounts, in the order Google Ads returns them unless `CONFIG.accountIds` names them.
- 1,000 ads across all accounts, highest cost first within each account.
- 200 distinct final URLs across all accounts.
- 5 redirects for each URL.
- 20 minutes. The run stops before Google Ads' 30-minute manager-script limit.

The summary names every account, ad, and URL that a cap left out. It also says when the time cap stopped the run.

## The summary for three fictional client accounts and one missing ID

Every account, ad, page, URL, and address in this sample is made up. The sample shortens the full check link for each ad.

```text
AdPromise promise check: 2 ads with a problem

AdPromise checked 3 ads in 2 of 3 client accounts.
Problems found in 2 ads.
Skipped accounts:
- Denied Client (333-333-3333): Google Ads returned an error for this account.
- Requested account (444-444-4444): Google Ads did not return this account to the manager account.

== Northwind Outdoors (111-111-1111): 2 ads, 1 problem ==
Ad 1001 in Spring sale / Trail shoes
Final URL: https://example.com/running-shoes
- Not found in the page text: "$20", in the line "Trail shoes from $20".
Check this ad: https://adpromise.com/quick?url=...&ad=...&utm_source=github&utm_campaign=promise-script

== Lakeside Cafe (222-222-2222): 1 ad, 1 problem ==
Ad 2001 in Local / Coffee
Final URL: https://example.com/coffee
- The final URL returns HTTP 404.
Check this ad: https://adpromise.com/quick?url=...&ad=...&utm_source=github&utm_campaign=promise-script

For an hourly watch of these ads, see AdPromise: https://adpromise.com/pricing?utm_source=github&utm_campaign=promise-script
This script sent nothing to AdPromise. It ran in your manager account only.
```

## Limits and meaning

Each run reads the ads of each selected account, highest cost first, until an account, ad, URL, or time cap stops it. The summary says how many accounts, ads, and URLs were checked or skipped.

A promise listed as "not found in the page text" is missing from the page text. It is not proof that the claim is false. Read that line on the page before you change the ad.

For all of the same checks in one account, use `promise-check.js`. For a quick check by hand, run [the free quick check](https://adpromise.com/quick?utm_source=github&utm_campaign=promise-script). It needs no account.
