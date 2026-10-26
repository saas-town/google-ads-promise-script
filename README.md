# Google Ads promise check script

This Google Ads script checks enabled responsive search ads against their final URLs. It lists claims that it cannot find in the page text. It also reports URL errors, repeated redirects, and tracking parameters lost on redirects. It emails one summary after each run.

The script runs in your Google Ads account. It reads ad headlines, descriptions, final URLs, campaign names, ad group names, and cost. It fetches the final URLs and sends one summary email. It changes no ads and sends no data to AdPromise. Summary links open AdPromise only when you click them.

## Paste and schedule

1. In Google Ads, open Tools, then Bulk actions, then Scripts.
2. Click the plus button and replace the default code with `promise-check.js`.
3. Click Authorize, then Preview. Preview reads your ads and sends the summary email.
4. Read the summary. Set the schedule to weekly, then save.

Set `OWNER_EMAIL` near the top of the script to send the summary to another address. Leave it empty to use the signed-in account owner's address.

## Try one check by hand

The free quick check compares one ad headline with the headline and title on its page. Run it at [adpromise.com/quick](https://adpromise.com/quick?utm_source=github&utm_campaign=promise-script&utm_medium=readme). It needs no account, and it shows whether the page headline matches the ad.

## Run the demo

The demo runs `promise-check.js` from this folder with fictional ads and pages. It needs Node.js 18 or later. It needs no Google Ads account, no network request, and no email setup.

```sh
node demo.mjs
```

The output is the summary email that the script would send for the demo ads. Every ad, page, URL, and address in it is made up. The run reports how many pages it requested and confirms that every request stayed on `example.com`.

The demo reads the script from `promise-check.js` in this folder, so it runs the same code that you paste. `demo.mjs` holds the fictional ads, the pages, and the stand-ins for Google Ads, URL fetch, and email. Read it before you run it.

## Limits and meaning

Each run reads up to 200 enabled responsive search ads, highest cost first. It fetches up to 100 distinct final URLs and follows up to five redirects per URL. The summary reports when a cap leaves ads unchecked.

The script uses fixed text patterns. It checks prices, percentages, free trials, free shipping, guarantees, no-card claims, time claims, and other numbers. A claim marked “Not found in the page text” may appear there in other words. Read the page before you change an ad.

## The summary that the demo prints

The demo prints the full check link for each ad. This example shortens it. The script tags those links `utm_source=github`, because the script ships from this repository.

```text
AdPromise promise check: 3 ads with a problem

AdPromise checked 6 ads in this account.
Problems found in 3 ads.

Ad 1234567890 in Spring sale / Trail shoes
Final URL: https://example.com/running-shoes
- The final URL redirects 2 times.
- Tracking is lost on the redirect: gclid, utm_source, utm_medium, utm_campaign.
- Not found in the page text: "$20", in the line "Trail shoes from $20".
Check this ad: https://adpromise.com/quick?url=...&ad=...&utm_source=github&utm_campaign=promise-script

Ad 2345678901 in Spring sale / Rain jackets
Final URL: https://example.com/rain-jackets
- Not found in the page text: "No credit card", in the line "No credit card needed to order.".
Check this ad: https://adpromise.com/quick?url=...&ad=...&utm_source=github&utm_campaign=promise-script

Ad 3456789012 in Spring sale / Camp stoves
Final URL: https://example.com/camp-stoves
- The final URL returns HTTP 404.
Check this ad: https://adpromise.com/quick?url=...&ad=...&utm_source=github&utm_campaign=promise-script

For an hourly watch of these ads, see AdPromise: https://adpromise.com/pricing?utm_source=github&utm_campaign=promise-script
This script sent nothing to AdPromise. It ran in your account only.
```

## Generate the script

The script is generated from `promiseScript()` in the SaaS Town monorepo. From the monorepo root, run:

```sh
node apps/admatch/scripts/generate-promise-script.ts
```

Commit the new `apps/admatch/google-ads-promise-script/promise-check.js` after a source change. The AdMatch unit test checks that the committed file matches the generator output.

## License

MIT. See `LICENSE`.
