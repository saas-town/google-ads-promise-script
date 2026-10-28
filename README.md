# Free Google Ads landing page and broken link check script

This free Google Ads script checks the landing page behind each enabled responsive search ad. It finds broken links, such as HTTP 404 and other errors on the final URL. It also reports repeated redirects and tracking parameters that a redirect drops. It lists ad claims, such as prices and free trials, that the page text does not show. It emails one summary after each run.

The script runs in your Google Ads account. It reads ad headlines, descriptions, the sitelink, callout and promotion assets that can serve with each ad, final URLs, campaign names, ad group names, and cost. It fetches the final URLs and sends one summary email. It changes no ads and sends no data to AdPromise. Summary links open AdPromise only when you click them.

## Pick a script

| Script | Where it runs | Scope |
| --- | --- | --- |
| `promise-check.js` | One Google Ads account | That account's enabled responsive search ads |
| `manager-check.js` | A manager account (MCC) | Up to 20 client accounts and 1,000 ads in one run, with one summary |
| `price-check.js` | One Google Ads account | That account's enabled responsive search ads, compared with the prices on their final URL pages |

Use `promise-check.js` for your own account. Use `manager-check.js` when you manage several client accounts. The manager-account choice is described in [`MANAGER.md`](MANAGER.md) and in the section below.

## Paste and schedule

1. In Google Ads, open Tools, then Bulk actions, then Scripts.
2. Click the plus button and replace the default code with `promise-check.js`.
3. Click Authorize, then Preview. Preview reads your ads and sends the summary email.
4. Read the summary. Set the schedule to weekly, then save.

Set `OWNER_EMAIL` near the top of the script to send the summary to another address. Leave it empty to use the signed-in account owner's address.

## If it does not work

**"This app is blocked" or error 400 policy_enforced.** Google's Advanced Protection, or a policy from your Workspace admin, blocks the authorization. Your admin can fix it in either of two ways: trust the app in the Admin console, or turn Apps Script on for your user. Google's help: [Advanced Protection](https://knowledge.workspace.google.com/admin/security/protect-users-with-the-advanced-protection-program), [the policy_enforced error](https://support.google.com/accounts/answer/16668185), [turning Apps Script on or off](https://knowledge.workspace.google.com/admin/users/access/turn-apps-script-on-or-off-for-users).

**The summary email stopped.** A script stops without notice when the person who authorized it leaves the account. It stays in the list and sends nothing. Anyone with access to the account can authorize it again under Tools, Bulk actions, Scripts. The [AdPromise watch](https://adpromise.com/pricing?utm_source=github&utm_campaign=promise-script&utm_medium=readme) runs outside your account, so it does not depend on who authorized it.

## Manager-account choice

`manager-check.js` is the manager-account variant. It runs in a manager account, reads the enabled responsive search ads of your client accounts, checks each final URL with the single-account rules, and sends one summary. It changes no ads and sends no account data to AdPromise.

Permissions: the manager account needs access to each client account. A client account that Google Ads refuses, or a requested ID it does not return, is listed under "Skipped accounts" and the run continues. The script reads ad copy, the sitelink, callout and promotion assets that can serve with each ad, final URLs, campaign and ad group names, cost, and each client's name and customer ID.

Limits for each run: 20 client accounts, 1,000 ads across all accounts (highest cost first within each account), 200 distinct final URLs, five redirects per URL, and 20 minutes. The summary lists skipped accounts, names each cap that was reached, and counts the ads left unchecked in each account.

To use it, paste `manager-check.js` into Tools, Bulk actions, Scripts in your manager account. Set `CONFIG.accountIds` to specific customer IDs, or leave it empty to check every client account up to the cap. Run Preview, read the summary, then schedule it weekly. A sample summary, with fictional accounts, is in [`MANAGER.md`](MANAGER.md). A fix in `FIXES` is measured in each client account that holds the ad.

## Check one ad's landing page by hand

The free quick check compares one ad headline with the headline and title on its page. Run it at [adpromise.com/quick](https://adpromise.com/quick?utm_source=github&utm_campaign=promise-script&utm_medium=readme). It needs no account, and it shows whether the page headline matches the ad.

## Measure a fix

The fix check shows the before and after of a change that you made to an ad. Set `FIXES` near the top of `promise-check.js` or `manager-check.js`. Each entry names the ad by its final URL or by its ad ID. It also names the day that you made the change, as YYYY-MM-DD:

```js
var FIXES = [
  { finalUrl: 'https://example.com/shoes', fixedOn: '2026-09-20' },
  { adId: '1234567890', fixedOn: '2026-09-20' },
];
```

The script reads the daily clicks, conversions, and cost of the matching ads from your account. It compares the 14 days before the fix day with the 14 days after it. The after window ends no later than yesterday. The summary shows both windows and the change in conversion rate, in percentage points.

The summary says when a fix is too recent to read, and it says the day that the after window is ready. It says when a window has fewer than 100 clicks, so the change is too small to read. It also says when no ad matches a fix. The fix check changes no ads and sends nothing to AdPromise. Each fix carries a link to the quick check. The link opens only when you click it.

## Run the demo

The demo runs `promise-check.js` from this folder with fictional ads and pages. It needs Node.js 18 or later. It needs no Google Ads account, no network request, and no email setup.

```sh
node demo.mjs
```

The output is the summary email that the script would send for the demo ads. Every ad, page, URL, and address in it is made up. The run reports how many pages it requested and confirms that every request stayed on `example.com`.

The demo reads the script from `promise-check.js` in this folder, so it runs the same code that you paste. `demo.mjs` holds the fictional ads, the pages, and the stand-ins for Google Ads, URL fetch, and email. Read it before you run it.

## Limits of the landing page check

Each run reads up to 200 enabled responsive search ads, highest cost first. It fetches up to 100 distinct final URLs and follows up to five redirects per URL. The summary reports when a cap leaves ads unchecked.

The script uses fixed text patterns. It checks prices, percentages, free trials, free shipping, guarantees, no-card claims, time claims, and other numbers. A claim marked “Not found in the page text” may appear there in other words. Read the page before you change an ad.

A page that refuses the script is listed in its own section. That covers a 401, 403, 429, or 503 answer, and a bot-challenge page. Bot protection often causes a refusal, so the script does not count it as a problem and does not check its text. Open the page in a browser to confirm.

## The summary that the demo prints

The demo prints the full check link for each ad and each fix. This example shortens it. The script tags those links `utm_source=github`, because the script ships from this repository.

```text
AdPromise promise check: 3 ads with a problem

AdPromise checked 6 ads in this account.
Problems found in 3 ads.
Refused pages: 0 pages.

Ad 1234567890 in Spring sale / Trail shoes
Final URL: https://example.com/running-shoes
- The final URL redirects 2 times.
- Tracking is lost on the redirect: gclid, utm_source, utm_medium, utm_campaign.
- Not found in the page text: "$20", in the line "Trail shoes from $20".
Check this ad: https://adpromise.com/?url=...&ad=...&utm_source=github&utm_campaign=promise-script&utm_medium=email#check

Ad 2345678901 in Spring sale / Rain jackets
Final URL: https://example.com/rain-jackets
- Not found in the page text: "No credit card", in the line "No credit card needed to order.".
Check this ad: https://adpromise.com/?url=...&ad=...&utm_source=github&utm_campaign=promise-script&utm_medium=email#check

Ad 3456789012 in Spring sale / Camp stoves
Final URL: https://example.com/camp-stoves
- The final URL returns HTTP 404.
Check this ad: https://adpromise.com/?url=...&ad=...&utm_source=github&utm_campaign=promise-script&utm_medium=email#check

Fix on 2026-09-20 for ad 1234567890
Before 2026-09-06 to 2026-09-19: 280 clicks, 5 conversions, cost 210.00, conversion rate 1.79%.
After 2026-09-21 to 2026-10-04: 280 clicks, 8 conversions, cost 210.00, conversion rate 2.86%.
Change in conversion rate: +1.07 percentage points.
Check this fix: https://adpromise.com/quick?url=...&utm_source=github&utm_campaign=promise-script-fix&utm_medium=email

Fix on 2026-10-10 for https://example.com/tents
Too recent to read. The after window is ready on 2026-10-25.
Check this fix: https://adpromise.com/quick?url=...&utm_source=github&utm_campaign=promise-script-fix&utm_medium=email

Fix on 2026-09-20 for https://example.com/camp-stoves
Before 2026-09-06 to 2026-09-19: 42 clicks, 0 conversions, cost 28.00, conversion rate 0.00%.
After 2026-09-21 to 2026-10-04: 42 clicks, 0 conversions, cost 28.00, conversion rate 0.00%.
The change is too small to read. Each window needs at least 100 clicks.
Check this fix: https://adpromise.com/quick?url=...&utm_source=github&utm_campaign=promise-script-fix&utm_medium=email

For an hourly watch of these ads, see AdPromise: https://adpromise.com/pricing?utm_source=github&utm_campaign=promise-script&utm_medium=email
This script sent nothing to AdPromise. It ran in your account only.
AdPromise maintains this script. Report a problem at https://github.com/saas-town/google-ads-promise-script/issues?utm_source=github&utm_campaign=promise-script&utm_medium=email
Changelog: https://github.com/saas-town/google-ads-promise-script/blob/main/CHANGELOG.md?utm_source=github&utm_campaign=promise-script&utm_medium=email
```

## Price check script for Google Ads

`price-check.js` checks the prices and stock that each enabled responsive search ad states against the final URL page. It lists an ad when the page shows a different price, a different currency, or an out-of-stock state. It uses the same no-model engine as the free price checker on AdPromise. It runs in your Google Ads account, changes no ads, and sends nothing to AdPromise.

Paste it in the same way as `promise-check.js`: Tools, Bulk actions, Scripts. Its summary email has one link per flagged ad, and each link opens the price checker with the final URL filled in.

**Scope.** The script reads the prices in the headlines and descriptions of each responsive search ad. It does not read Shopping product rows. The Google Ads Shopping product resource that I checked has price and availability fields, but no landing page or final URL field, so there is no link to the page. A price that the ad text does not state is not compared.

**Undecided, not guessed.** A page or ad with no clear price stays out of the comparison. The script treats these as undecided: a struck-through sale price, a "from" price, a page with several prices or a range of offers, and an ad with two different prices. A page that refuses the request (HTTP 401, 403, 429, or 503) or shows a bot check is listed apart from the mismatches, so it does not look like a price problem.

**What the page reader reads.** The script reads each page's schema.org JSON-LD Offers, its product meta price, and the visible text from the first `h1`. It does not read microdata or hidden elements. A page that prices its items only in microdata may show as undecided.

Caps are the same as `promise-check.js`: 200 ads, highest cost first, 100 distinct final URLs, and five redirects per URL.

Sample summary, from the fixture ads that the script's run prints (the links are shortened):

```text
AdPromise price check: 2 ads with a price or stock mismatch

AdPromise checked 3 ads against their final URLs.
Price or stock mismatches in 2 ads.
No clear price on the page or in the ad for 1 ad, so those were not compared.

Pages the site refused or blocked. These are not mismatches:
Ad 1004 (https://shop.example.com/tent): The site refused the request with HTTP 403.

Ad 1001 in Spring sale / Trail shoes
Final URL: https://shop.example.com/trail-shoes
- The page shows a different price than the ad. The ad says 39.00, and the page shows 49.99 USD. The page says: “Now $49.99”. Change the ad to the price on the page, or change the page to the ad price.
Check this ad: https://adpromise.com/tools/price-mismatch-checker?url=...&utm_source=github&utm_campaign=promise-script&utm_content=price-check&utm_medium=email

Ad 1003 in Camp / Stoves
Final URL: https://shop.example.com/camp-stove
- The page says the product is out of stock: “Sold out”. Next step: restore stock or pause the ad until the product is back.
Check this ad: https://adpromise.com/tools/price-mismatch-checker?url=...&utm_source=github&utm_campaign=promise-script&utm_content=price-check&utm_medium=email

This script sent nothing to AdPromise. It ran in your account only.
```

## Generate the script

The script is generated from `promiseScript()` in the SaaS Town monorepo. From the monorepo root, run:

```sh
node apps/admatch/scripts/generate-promise-script.ts
```

Commit the new `apps/admatch/google-ads-promise-script/promise-check.js` and `price-check.js` after a source change. The AdMatch unit tests check that the committed files match the generator output.

## License

MIT. See `LICENSE`.
