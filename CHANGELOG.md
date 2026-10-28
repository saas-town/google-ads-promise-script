# Changelog

## 2026-10-27

- `promise-check.js`, `manager-check.js` and the collection script now read the enabled sitelink, callout and promotion assets that can serve with each checked ad. Each asset's words are checked against the page like a headline. An asset past its own end date adds no line, since it stopped serving. An ended offer in the ad text, or in the text of an asset that still serves, gets a summary row that names the asset kind, quotes the line, gives the date, and links to Google's Unavailable offers policy. The asset reads use the same `AdsApp.search` calls and fetch no URL. `price-check.js` still reads the ad text only.

- Added the fix check to `promise-check.js` and `manager-check.js`. A `FIXES` list names each fixed ad and its fix day. The summary shows the clicks, conversions, cost, and conversion rate of the 14 days before and the 14 days after the fix, and the change. The demo adds three fictional fixes.

- Reworded the README title, first paragraph, and three headings to name the script's landing page and broken link check. The script code is unchanged.

- Added `price-check.js`, which compares the prices and stock that responsive search ads state with their final URL pages. It reads ad text only, not Shopping rows.

## 2026-10-26

- Listed a page that refuses the script in its own section. A 401, 403, 429, or 503 answer, or a bot-challenge page, is not counted as a problem and gets no promise check. The summary counts the refused pages.
- Linked each problem ad to the full check at `adpromise.com/#check`, which opens with the ad and the page filled in. The ad text stops at 3,000 characters.
- Tagged every link in the summary with `utm_medium=email`, next to the source and campaign tags.
- Added the changelog and the issues page to the end of the summary.
- Added a clickable link to the free quick check in the README prose, tagged `utm_source=github&utm_campaign=promise-script&utm_medium=readme`.

## 2026-10-25

- Added the public script generated from the AdPromise page script.
- Tagged summary links with `utm_source=github&utm_campaign=promise-script`.
- Added a demo run with fictional ads and pages. It needs no Google Ads account, network request, or email.
