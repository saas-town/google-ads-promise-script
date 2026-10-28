// AdPromise price check for Google Ads.
// Paste this script under Tools > Bulk actions > Scripts. It reads your enabled
// responsive search ads, opens each final URL, and mails you one summary of the
// ads whose price or stock disagrees with the page.
//
// Caps per run: 200 ads, the highest cost first, and 100 distinct final URLs.
// The script follows each redirect itself, up to 5 per URL.
// It reads the ad headlines and descriptions only. Shopping rows are not read.
//
// It changes nothing in your account. It sends nothing to AdPromise: the only
// outside requests go to the final URLs and to the one summary email.
// A price the script cannot read on the page, or cannot read in the ad, stays
// undecided. It is never guessed.

// Set one address to mail a different person. Leave it empty to mail the
// signed-in owner of the account.
var OWNER_EMAIL = '';

// The price checker that each summary row links to.
var PRICE_CHECK_URL = "https://adpromise.com/tools/price-mismatch-checker";

function main() {
  var read = readAds(undefined, false);
  var result = checkPrices(read.ads, fetchOnce);
  var mail = buildPriceSummary(read, result);
  var recipient = OWNER_EMAIL || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(recipient, mail.subject, mail.body);
  Logger.log(mail.subject);
}

var CAPS = { ads: 200, urls: 100, redirects: 5 };
var QUERY = "SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.cost_micros FROM ad_group_ad WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status = 'ENABLED' ORDER BY metrics.cost_micros DESC";
var FULL_CHECK_URL = "https://adpromise.com/";
var QUICK_URL = "https://adpromise.com/quick";
var AD_TEXT_MAX = 3000;
var CHANGELOG_URL = "https://github.com/saas-town/google-ads-promise-script/blob/main/CHANGELOG.md";
var ISSUES_URL = "https://github.com/saas-town/google-ads-promise-script/issues";
var UTM = {"utm_source":"github","utm_campaign":"promise-script","utm_medium":"email"};
var TRACKING_PROBE = ["gclid=adpromise-probe","utm_source=adpromise","utm_medium=cpc","utm_campaign=promise-check"];
var ASSET_QUERIES = [{"level":"ad group","kind":"Sitelinks","query":"SELECT ad_group.id, asset.id, asset.sitelink_asset.link_text, asset.sitelink_asset.end_date FROM ad_group_asset WHERE ad_group_asset.status = 'ENABLED' AND asset.type = 'SITELINK'"},{"level":"ad group","kind":"Callouts","query":"SELECT ad_group.id, asset.id, asset.callout_asset.callout_text, asset.callout_asset.end_date FROM ad_group_asset WHERE ad_group_asset.status = 'ENABLED' AND asset.type = 'CALLOUT'"},{"level":"ad group","kind":"Promotions","query":"SELECT ad_group.id, asset.id, asset.promotion_asset.promotion_target, asset.promotion_asset.percent_off, asset.promotion_asset.money_amount_off, asset.promotion_asset.promotion_code, asset.promotion_asset.discount_modifier, asset.promotion_asset.end_date FROM ad_group_asset WHERE ad_group_asset.status = 'ENABLED' AND asset.type = 'PROMOTION'"},{"level":"campaign","kind":"Sitelinks","query":"SELECT campaign.id, asset.id, asset.sitelink_asset.link_text, asset.sitelink_asset.end_date FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' AND asset.type = 'SITELINK'"},{"level":"campaign","kind":"Callouts","query":"SELECT campaign.id, asset.id, asset.callout_asset.callout_text, asset.callout_asset.end_date FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' AND asset.type = 'CALLOUT'"},{"level":"campaign","kind":"Promotions","query":"SELECT campaign.id, asset.id, asset.promotion_asset.promotion_target, asset.promotion_asset.percent_off, asset.promotion_asset.money_amount_off, asset.promotion_asset.promotion_code, asset.promotion_asset.discount_modifier, asset.promotion_asset.end_date FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' AND asset.type = 'PROMOTION'"},{"level":"account","kind":"Sitelinks","query":"SELECT asset.id, asset.sitelink_asset.link_text, asset.sitelink_asset.end_date FROM customer_asset WHERE customer_asset.status = 'ENABLED' AND asset.type = 'SITELINK'"},{"level":"account","kind":"Callouts","query":"SELECT asset.id, asset.callout_asset.callout_text, asset.callout_asset.end_date FROM customer_asset WHERE customer_asset.status = 'ENABLED' AND asset.type = 'CALLOUT'"},{"level":"account","kind":"Promotions","query":"SELECT asset.id, asset.promotion_asset.promotion_target, asset.promotion_asset.percent_off, asset.promotion_asset.money_amount_off, asset.promotion_asset.promotion_code, asset.promotion_asset.discount_modifier, asset.promotion_asset.end_date FROM customer_asset WHERE customer_asset.status = 'ENABLED' AND asset.type = 'PROMOTION'"}];
var OFFER_POLICY_URL = "https://support.google.com/adspolicy/answer/15937063";
var RULES = [{"kind":"price","label":"Price","source":"[$£€]\\s?\\d[\\d,.]*|\\b\\d[\\d,.]*\\s?(?:usd|dollars?|euros?|pounds?)\\b","flags":"gi"},{"kind":"percent","label":"Percent","source":"\\b\\d[\\d.]*\\s?(?:%|percent\\b)","flags":"gi"},{"kind":"free-trial","label":"Free trial","source":"\\bfree trials?\\b","flags":"gi"},{"kind":"free-shipping","label":"Free shipping","source":"\\bfree (?:shipping|delivery)\\b","flags":"gi"},{"kind":"guarantee","label":"Guarantee","source":"\\b(?:money[- ]back[- ]guarantee|money[- ]back|guarantee[ds]?)\\b","flags":"gi"},{"kind":"no-card","label":"No credit card","source":"\\bno (?:credit|debit) cards?\\b","flags":"gi"},{"kind":"time","label":"Time claim","source":"\\bin (?:\\d+|one|two|three|a few) (?:seconds?|minutes?|hours?|days?|weeks?)\\b|\\bsame[- ]day\\b|\\bovernight\\b|\\b\\d+\\s?(?:hours?|days?|minutes?)\\b","flags":"gi"},{"kind":"number","label":"Number","source":"\\d[\\d,.]*","flags":"g"}];
// Reads the enabled responsive search ads, with the sitelink, callout and
// promotion assets that can serve with each of them. AdsApp.search returns one
// row per ad. The price check reads no asset: it passes false.
function readAds(maxAds, withAssets) {
  var limit = typeof maxAds === 'number' ? Math.min(CAPS.ads, maxAds) : CAPS.ads;
  var assets = withAssets === false ? [] : readAssets();
  var rows = AdsApp.search(QUERY);
  var ads = [];
  while (rows.hasNext() && ads.length < limit) {
    var row = rows.next();
    var ad = row.adGroupAd.ad;
    var rsa = ad.responsiveSearchAd || {};
    var campaign = row.campaign || {};
    var adGroup = row.adGroup || {};
    ads.push({
      id: ad.id,
      campaign: campaign.name,
      adGroup: adGroup.name,
      finalUrl: (ad.finalUrls || [])[0] || '',
      headlines: (rsa.headlines || []).map(assetText),
      descriptions: (rsa.descriptions || []).map(assetText),
      assets: assetsFor(assets, campaign.id, adGroup.id)
    });
  }
  return { ads: ads, capped: rows.hasNext() };
}

// Reads the enabled sitelink, callout and promotion assets that can serve with
// an ad: the account's assets, each campaign's assets, and each ad group's
// assets. Each read is one AdsApp.search call, and none of them fetches a URL.
// An asset read that Google Ads refuses adds no asset, so the ad checks still
// run.
function readAssets() {
  var assets = [];
  ASSET_QUERIES.forEach(function (entry) {
    var rows;
    try {
      rows = AdsApp.search(entry.query);
    } catch (error) {
      return;
    }
    while (rows.hasNext()) {
      var row = rows.next();
      var asset = rowAssetOf(row);
      var text = assetLineText(asset, entry.kind);
      if (!text) continue;
      assets.push({
        id: asset.id === undefined || asset.id === null ? '' : String(asset.id),
        kind: entry.kind,
        text: text,
        end: assetOwnEnd(asset, entry.kind),
        campaignId: entry.level === 'campaign' ? idText((row.campaign || {}).id) : '',
        adGroupId: entry.level === 'ad group' ? idText((row.adGroup || {}).id) : ''
      });
    }
  });
  return assets;
}

// The asset of one asset row. Google Ads returns the asset beside the link, and
// an account can also return it under the link.
function rowAssetOf(row) {
  if (row.asset && typeof row.asset === 'object') return row.asset;
  var link = row.adGroupAsset || row.campaignAsset || row.customerAsset || {};
  if (link.asset && typeof link.asset === 'object') return link.asset;
  return {};
}

function idText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function textOf(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// The words of one asset. A sitelink and a callout hold their words in one
// field. Google holds a promotion in fields, so the script writes the discount,
// the target and the code as a searcher reads them.
function assetLineText(asset, kind) {
  if (kind === 'Sitelinks') return textOf((asset.sitelinkAsset || {}).linkText);
  if (kind === 'Callouts') return textOf((asset.calloutAsset || {}).calloutText);
  return promotionLineText(asset.promotionAsset || {});
}

function promotionLineText(promotion) {
  var amount = promotionAmountText(promotion);
  if (!amount) return '';
  var modifier = String(promotion.discountModifier || '').toUpperCase() === 'UP_TO' ? 'Up to ' : '';
  var target = textOf(promotion.promotionTarget);
  var code = textOf(promotion.promotionCode);
  return (modifier + amount + (target ? ' ' + target : '') + (code ? ' (code ' + code + ')' : '')).trim();
}

function promotionAmountText(promotion) {
  var money = promotion.moneyAmountOff;
  var micros = money && money.amountMicros;
  if (micros !== undefined && micros !== null && micros !== '') {
    var currency = String(money.currencyCode || '').toUpperCase();
    var symbol = CURRENCY_SYMBOLS[currency] || (currency ? currency + ' ' : '');
    return symbol + promotionMoney(micros) + ' off';
  }
  var percent = promotion.percentOff;
  if (percent !== undefined && percent !== null && percent !== '') return percent + '% off';
  return '';
}

// A promotion's money amount as a number of currency units. Google writes the
// field in millionths of one unit.
function promotionMoney(micros) {
  return String(Math.round(Number(micros) / 10000) / 100);
}

// The asset's own end date as YYYY-MM-DD, an empty string when it has none, or
// 'unknown' when Google's value is not a whole day.
function assetOwnEnd(asset, kind) {
  if (kind === 'Sitelinks') return dayTextOf((asset.sitelinkAsset || {}).endDate);
  if (kind === 'Callouts') return dayTextOf((asset.calloutAsset || {}).endDate);
  return dayTextOf((asset.promotionAsset || {}).endDate);
}

function dayTextOf(value) {
  var text = textOf(value);
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return 'unknown';
  var day = text.slice(0, 10);
  return dayDate(day) ? day : 'unknown';
}

// The assets that can serve with one ad: the account's assets, its campaign's
// assets, and its ad group's assets, each once. An asset past its own end date
// stopped serving and adds no line, and one with a date that cannot be read
// adds no line either, as the check on the server skips both.
function assetsFor(assets, campaignId, adGroupId) {
  var today = new Date();
  var own = [];
  var seen = {};
  assets.forEach(function (asset) {
    if (!assetServesWith(asset, campaignId, adGroupId)) return;
    var key = asset.kind + ':' + (asset.id || asset.text);
    if (seen[key]) return;
    seen[key] = true;
    if (asset.end === 'unknown') return;
    if (asset.end && hasPassed(dayDate(asset.end), today)) return;
    own.push({ kind: asset.kind, text: asset.text, endDate: asset.end });
  });
  return own;
}

// True when an asset of one level can serve with the ad. An asset that names no
// level is an account-level asset, which can serve with every ad.
function assetServesWith(asset, campaignId, adGroupId) {
  if (asset.adGroupId) return sameId(asset.adGroupId, adGroupId);
  if (asset.campaignId) return sameId(asset.campaignId, campaignId);
  return true;
}

function sameId(one, other) {
  return one !== '' && other !== undefined && other !== null && String(one) === String(other);
}

// The reference gives each headline an object with a text field. A plain
// string is also accepted.
function assetText(asset) {
  return typeof asset === 'string' ? asset : (asset && asset.text) || '';
}

// Checks each ad against its final URL. The same URL is fetched once, and a
// URL past the cap is not fetched. The fetch argument lets a test pass fixtures.
// The manager script passes one budget across accounts, so the URL and time
// caps cover the whole run. A single-account call keeps its own cache.
function checkAds(ads, fetch, budget) {
  budget = budget || {};
  var pages = budget.pages || {};
  budget.pages = pages;
  var distinct = budget.distinct || 0;
  var maxUrls = budget.maxUrls || CAPS.urls;
  var deadline = budget.deadline || 0;
  var notChecked = 0;
  var stopped = false;
  var urlCapped = false;
  var rows = [];
  var refused = [];
  for (var i = 0; i < ads.length; i++) {
    if (deadline && currentMillis() >= deadline) {
      notChecked += ads.length - i;
      stopped = true;
      break;
    }
    var ad = ads[i];
    if (!ad.finalUrl) {
      rows.push({ ad: ad, lines: adLines(ad), problems: withoutPageProblems(ad) });
      continue;
    }
    if (!pages[ad.finalUrl]) {
      if (distinct >= maxUrls) {
        notChecked++;
        urlCapped = true;
        continue;
      }
      distinct++;
      var visited = visitUrl(ad.finalUrl, fetch, deadline);
      if (visited.timedOut) {
        notChecked += ads.length - i;
        stopped = true;
        break;
      }
      pages[ad.finalUrl] = visited;
    }
    var row = problemsFor(ad, pages[ad.finalUrl]);
    // A refused page is listed apart, so bot protection does not count as a problem.
    if (row.refused) refused.push(row);
    else if (row.problems.length > 0) rows.push(row);
  }
  budget.distinct = distinct;
  return {
    checked: ads.length - notChecked,
    notChecked: notChecked,
    rows: rows,
    refused: refused,
    stopped: stopped,
    urlCapped: urlCapped
  };
}

function currentMillis() {
  return new Date().getTime();
}

// The headline and description lines of an ad, then the text of the sitelink,
// callout and promotion assets that can serve with it. An asset line keeps its
// kind, so the check can name the asset kind in the summary.
function adLineItems(ad) {
  var items = [];
  ad.headlines.concat(ad.descriptions).forEach(function (line) {
    var text = String(line).trim();
    if (text === '') return;
    items.push({ kind: '', text: text, endDate: '' });
  });
  (ad.assets || []).forEach(function (asset) {
    var text = String(asset.text).trim();
    if (text === '') return;
    items.push({ kind: asset.kind, text: text, endDate: asset.endDate || '' });
  });
  return items;
}

// The lines of an ad as text. An asset line keeps its kind in front, as the
// copy of an imported pair does.
function adLines(ad) {
  return adLineItems(ad).map(function (line) {
    return line.kind ? line.kind + ': ' + line.text : line.text;
  });
}

// The problems of one ad that need no page.
function withoutPageProblems(ad) {
  return ['No final URL is set on this ad.'].concat(endedOfferProblems(ad));
}

// Fetches one final URL with the tracking probe added. It records the hops,
// the final status, the page body, and each probe parameter the walk dropped.
function visitUrl(url, fetch, deadline) {
  var walk = walkUrl(addQuery(url, TRACKING_PROBE.join('&')), fetch, deadline);
  if (walk.timedOut) return { timedOut: true };
  var lost = TRACKING_PROBE.filter(function (pair) {
    return walk.finalUrl.indexOf(pair) < 0;
  }).map(function (pair) {
    return pair.split('=')[0];
  });
  return {
    timedOut: false,
    hops: walk.hops,
    status: walk.status,
    challenge: walk.challenge,
    tooManyRedirects: walk.tooManyRedirects,
    body: walk.body,
    lost: lost
  };
}

// Follows redirects by hand. A redirect that the script does not follow is a
// problem, so the walk stops after CAPS.redirects hops.
function walkUrl(startUrl, fetch, deadline) {
  var hops = [];
  var url = startUrl;
  if (deadline && currentMillis() >= deadline) {
    return { hops: hops, finalUrl: url, status: 0, tooManyRedirects: false, timedOut: true, body: '' };
  }
  var response = fetch(url);
  while (response.code >= 300 && response.code < 400 && response.location) {
    if (deadline && currentMillis() >= deadline) {
      return { hops: hops, finalUrl: url, status: response.code, tooManyRedirects: false, timedOut: true, body: '' };
    }
    if (hops.length >= CAPS.redirects) {
      return { hops: hops, finalUrl: url, status: response.code, challenge: false, tooManyRedirects: true, timedOut: false, body: '' };
    }
    hops.push({ url: url, code: response.code });
    url = resolveUrl(url, response.location);
    response = fetch(url);
  }
  return {
    hops: hops,
    finalUrl: url,
    status: response.code,
    challenge: response.challenge === true,
    tooManyRedirects: false,
    timedOut: false,
    body: response.body || ''
  };
}

// One fetch with redirects off. A URL that fails to load returns status 0.
// The challenge flag is set when Cloudflare's cf-mitigated header is present.
function fetchOnce(url) {
  try {
    var response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var headers = response.getHeaders();
    var location = '';
    var challenge = false;
    for (var key in headers) {
      if (key.toLowerCase() === 'location') location = headers[key];
      if (key.toLowerCase() === 'cf-mitigated' && String(headers[key]).toLowerCase() === 'challenge') challenge = true;
    }
    return { code: response.getResponseCode(), location: location, challenge: challenge, body: response.getContentText() };
  } catch (error) {
    return { code: 0, location: '', challenge: false, body: '' };
  }
}

// Joins a location header to the URL that sent it.
function resolveUrl(base, location) {
  if (/^https?:\/\//i.test(location)) return location;
  var origin = base.match(/^https?:\/\/[^\/]+/i);
  if (!origin) return location;
  if (location.indexOf('//') === 0) return base.split('//')[0] + location;
  if (location.charAt(0) === '/') return origin[0] + location;
  return base.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + location;
}

function addQuery(url, query) {
  var base = url.split('#')[0];
  return base + (base.indexOf('?') < 0 ? '?' : '&') + query;
}

// Markup that challenge pages load. Real pages can embed some of it, so it
// counts only on a page with little visible text.
var CHALLENGE_MARKUP = /cf-chl-|challenge-platform|_incapsula_resource|px-captcha|captcha-delivery\.com|sec-cpt-if|awswafintegration/i;
var THIN_PAGE_CHARS = 1000;

// True when bot protection answered in place of the page. That is a refused
// status, the Cloudflare challenge header, or a challenge page on a 2xx answer.
// A 2xx page counts when it has a challenge title, or challenge markup and
// little visible text.
function isRefused(page) {
  if (page.challenge) return true;
  if ([401, 403, 429, 503].indexOf(page.status) >= 0) return true;
  if (page.status < 200 || page.status >= 300) return false;
  if (/<title>\s*Just a moment/i.test(page.body)) return true;
  return CHALLENGE_MARKUP.test(page.body) && visibleText(page.body).length < THIN_PAGE_CHARS;
}

// The problems of one ad. A page that did not load gets no promise check,
// because the script has no page text to compare. A refused page gets no
// promise check either, and its row is marked refused. Its redirect and
// tracking problems still count, so a lost tag shows on a refused page too.
function problemsFor(ad, page) {
  var problems = [];
  var refused = isRefused(page);
  if (refused) {
    var answer = page.status >= 200 && page.status < 300 ? 'a bot-challenge page' : 'HTTP ' + page.status;
    problems.push('The final URL returns ' + answer + '.');
  } else if (page.tooManyRedirects) {
    problems.push('The final URL redirects more than ' + CAPS.redirects + ' times.');
  } else if (page.status === 0) {
    problems.push('The final URL could not be reached.');
  } else if (page.status < 200 || page.status >= 300) {
    problems.push('The final URL returns HTTP ' + page.status + '.');
  }
  if (page.hops.length >= 2) {
    problems.push('The final URL redirects ' + page.hops.length + ' times.');
  }
  if (page.lost.length > 0) {
    problems.push('Tracking is lost on the redirect: ' + page.lost.join(', ') + '.');
  }
  endedOfferProblems(ad).forEach(function (problem) {
    problems.push(problem);
  });
  var lines = adLines(ad);
  if (!refused && page.status >= 200 && page.status < 300) {
    missingClaims(lines, visibleText(page.body)).forEach(function (miss) {
      problems.push('Not found in the page text: "' + miss.text + '", in the line "' + miss.line + '".');
    });
  }
  var row = { ad: ad, lines: lines, problems: problems };
  if (refused) row.refused = true;
  return row;
}

// Lists the claims in the ad lines that the page text lacks. A claim that
// appears twice counts once.
function missingClaims(lines, pageText) {
  var page = normalizeClaim(pageText);
  var seen = {};
  var missing = [];
  lines.forEach(function (line) {
    findPromises(line).forEach(function (claim) {
      var key = normalizeClaim(claim.text);
      if (!key || seen[key] || hasClaim(page, key)) return;
      seen[key] = true;
      missing.push({ text: claim.text, line: line });
    });
  });
  return missing;
}

// The claims in one line, in order. This runs the same rules as findPromises
// in ad-preview.ts. A span that an earlier rule took is skipped.
function findPromises(line) {
  var taken = [];
  var found = [];
  RULES.forEach(function (rule) {
    var pattern = new RegExp(rule.source, rule.flags);
    var match;
    while ((match = pattern.exec(line)) !== null) {
      var start = match.index;
      var end = start + match[0].length;
      var overlaps = taken.some(function (span) {
        return start < span[1] && span[0] < end;
      });
      if (!overlaps) {
        taken.push([start, end]);
        found.push({ kind: rule.kind, label: rule.label, text: match[0], start: start });
      }
    }
  });
  return found.sort(function (a, b) { return a.start - b.start; });
}

// Puts a claim and a page in one form: lower case, no currency sign or
// currency word, no thousands commas, no trailing zeros, and "%" for "percent".
function normalizeClaim(text) {
  return String(text)
    .toLowerCase()
    .replace(/[$£€]\s?/g, '')
    .replace(/\b(usd|dollars?|euros?|pounds?)\b/g, '')
    .replace(/\bpercent\b/g, '%')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d)\.0+(?!\d)/g, '$1')
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/\btrials\b/g, 'trial')
    .replace(/\bcards\b/g, 'card')
    .replace(/\s+/g, ' ')
    .trim();
}

// True when the normalized claim appears as whole words in the normalized page.
function hasClaim(page, claim) {
  var escaped = claim.replace(/[-\/\\^*+?.()|[\]{}]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '(?![a-z0-9])').test(page);
}

// The visible text of an HTML page: no scripts, styles, comments, or tags, and
// the common entities decoded.
function visibleText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The symbols that a promotion's money amount often uses.
var CURRENCY_SYMBOLS = { USD: '$', EUR: '\u20ac', GBP: '\u00a3', CAD: 'CA$', AUD: 'A$' };
var END_DAY_MS = 86400000;
// A date with no year counts only this close to today.
var END_YEAR_FREE_DAYS = 60;
var END_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var END_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
var END_MONTH = '(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b';
// The words that make a date an end date. A start date or a bare date never
// matches, and a relative word (today, tonight, this weekend) names no date.
var END_LEAD = '\\b(?:(?:offer |sale |promo |deal |discount )?(?:ends?|ending|expires?|expiring)(?: on)?|through|thru|until|till|til|(?:offer |sale |deal |code )?valid (?:to|through|thru|until|till)|good (?:through|until|thru)|last day(?: to (?:save|order|buy|book))?(?: is)?)';
var END_WEEKDAY = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+)?';
var END_PREFIX = END_LEAD + '\\s+(?:on\\s+)?(?:the\\s+)?' + END_WEEKDAY;
var END_ORDINAL = '(?:st|nd|rd|th)?';

// The patterns of the end dates that the reader takes, built for one call so
// that each one starts at the line's first character. These rules are copied
// from statedEndDates in the check on the server (issue 9021), and a test runs
// both readers on the same lines.
function endDatePatterns() {
  return [
    {
      form: 'month',
      pattern: new RegExp(END_PREFIX + '(?<date>' + END_MONTH + '\\.?\\s+(?<day>\\d{1,2})' + END_ORDINAL + '(?:,?\\s+(?<year>\\d{4}))?)(?!\\d)', 'gi')
    },
    {
      form: 'day',
      pattern: new RegExp(END_PREFIX + '(?<date>(?<day>\\d{1,2})' + END_ORDINAL + '\\s+(?:of\\s+)?' + END_MONTH + '(?:\\.)?(?:,?\\s+(?<year>\\d{4}))?)', 'gi')
    },
    {
      form: 'iso',
      pattern: new RegExp(END_PREFIX + '(?<date>(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2}))(?!\\d)', 'gi')
    },
    {
      form: 'numeric',
      pattern: new RegExp(END_PREFIX + '(?<date>(?<first>\\d{1,2})/(?<second>\\d{1,2})(?:/(?<year>\\d{4}|\\d{2}))?)(?![\\d/])', 'gi')
    }
  ];
}

// The end dates that one line states, in the order they appear. Only an
// unambiguous date is returned: a numeric date needs a day over 12, and a date
// with no year counts only inside the window.
function statedEndDates(line, today) {
  var text = String(line);
  var found = [];
  endDatePatterns().forEach(function (entry) {
    var pattern = entry.pattern;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      var parts = match.groups || {};
      var date = endDateOf(entry.form, parts, today);
      if (!date || !parts.date) continue;
      found.push({
        clause: match[0],
        raw: parts.date,
        start: match.index,
        end: match.index + match[0].length,
        date: date
      });
    }
  });
  return found.sort(function (one, other) {
    return one.start - other.start;
  });
}

function endDateOf(form, parts, today) {
  if (form === 'month' || form === 'day') {
    var month = END_MONTHS[String(parts.month || '').slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    var day = Number(parts.day);
    return parts.year ? utcDate(Number(parts.year), month, day) : withoutYear(month, day, today);
  }
  if (form === 'iso') {
    return utcDate(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  }
  // A numeric date needs one part over 12. The script reads no platform
  // locale, so a date such as "11/12" stays unread.
  var first = Number(parts.first);
  var second = Number(parts.second);
  var order = first > 12 && second <= 12 ? 'dmy' : second > 12 && first <= 12 ? 'mdy' : '';
  if (!order) return null;
  var monthNumber = (order === 'mdy' ? first : second) - 1;
  var dayNumber = order === 'mdy' ? second : first;
  if (parts.year) {
    var year = parts.year.length === 2 ? 2000 + Number(parts.year) : Number(parts.year);
    return utcDate(year, monthNumber, dayNumber);
  }
  return withoutYear(monthNumber, dayNumber, today);
}

// A date with no year takes the year that puts it nearest today, and counts
// only inside the window.
function withoutYear(month, day, today) {
  var base = today.getUTCFullYear();
  var best = null;
  [base - 1, base, base + 1].forEach(function (year) {
    var date = utcDate(year, month, day);
    if (!date) return;
    if (!best || Math.abs(date.getTime() - today.getTime()) < Math.abs(best.getTime() - today.getTime())) best = date;
  });
  return best && Math.abs(best.getTime() - today.getTime()) <= END_YEAR_FREE_DAYS * END_DAY_MS ? best : null;
}

// Midnight UTC of one calendar day, or null when that day does not exist.
function utcDate(year, month, day) {
  var date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

// Midnight UTC of a YYYY-MM-DD day, or null for any other text.
function dayDate(text) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
  if (!match) return null;
  return utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// A date counts as passed only one full UTC day after it, as the check on the
// server counts it. An advertiser in the Americas who writes "ends Oct 24" is
// not flagged on the evening of Oct 24.
function hasPassed(date, today) {
  if (!date) return false;
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) >= date.getTime() + 2 * END_DAY_MS;
}

// A day as "October 20, 2026", as the check on the server writes it.
function formatDay(date) {
  return END_MONTH_NAMES[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
}

// The problems of one ad or asset line whose own stated end date has passed.
// An asset past its own end date stopped serving, so it adds no line: only an
// asset whose text names the ended offer and that still serves is reported.
function endedOfferProblems(ad) {
  var today = new Date();
  var problems = [];
  adLineItems(ad).forEach(function (line) {
    var passed = statedEndDates(line.text, today).filter(function (stated) {
      return hasPassed(stated.date, today);
    })[0];
    if (!passed) return;
    problems.push(endedOfferProblem(line, passed));
  });
  return problems;
}

// The words of one ended offer. The row names the asset kind, quotes the line,
// gives the date, and links to the policy that the offer breaks.
function endedOfferProblem(line, stated) {
  var kind = line.kind.replace(/s$/, '').toLowerCase();
  var serving = line.kind
    ? line.endDate
      ? ' Its own end date is ' + formatDay(dayDate(line.endDate)) + ', so it keeps serving with this ad.'
      : ' It has no end date of its own, so it keeps serving with this ad.'
    : '';
  return (line.kind ? 'The ' + kind + ' asset says' : 'The ad says') +
    ' "' + line.text + '" and ' + formatDay(stated.date) + ' has passed.' +
    serving +
    ' Google can disapprove an ad that promotes a deal that is no longer active' +
    ' (Unavailable offers): ' + OFFER_POLICY_URL;
}

// The subject and body of the summary mail. Each row holds one ad with a
// problem and a link that opens the same ad on the full check. A refused page
// gets its own section after the problems.
function buildSummary(read, result) {
  var lines = [];
  lines.push('AdPromise checked ' + adCount(result.checked) + ' in this account.');
  lines.push('Problems found in ' + adCount(result.rows.length) + '.');
  lines.push('Refused pages: ' + pageCount(distinctPages(result.refused)) + '.');
  if (read.capped || result.notChecked > 0) {
    lines.push('Caps reached: ' + CAPS.ads + ' ads and ' + CAPS.urls + ' final URLs per run. Ads past a cap were not checked.');
  }
  lines.push('');
  result.rows.forEach(function (row) {
    lines.push('Ad ' + row.ad.id + ' in ' + row.ad.campaign + ' / ' + row.ad.adGroup);
    lines.push('Final URL: ' + (row.ad.finalUrl || 'none'));
    row.problems.forEach(function (problem) {
      lines.push('- ' + problem);
    });
    if (row.ad.finalUrl) lines.push('Check this ad: ' + fullCheckLink(row.ad.finalUrl, row.lines));
    lines.push('');
  });
  refusedLines(result.refused).forEach(function (line) {
    lines.push(line);
  });
  summaryFooter('This script sent nothing to AdPromise. It ran in your account only.').forEach(function (line) {
    lines.push(line);
  });
  return {
    subject: 'AdPromise promise check: ' + adCount(result.rows.length) + ' with a problem',
    body: lines.join('\n')
  };
}

// The section for pages that refused the script. A refused page has no promise
// check and no problem count, so a reader opens it in a browser to confirm.
function refusedLines(refused) {
  if (refused.length === 0) return [];
  var lines = ["The page refused the script's request. This is often bot protection, not a broken page. Open it in a browser to confirm."];
  refused.forEach(function (row) {
    lines.push('Ad ' + row.ad.id + ' in ' + row.ad.campaign + ' / ' + row.ad.adGroup);
    lines.push('Final URL: ' + row.ad.finalUrl);
    row.problems.forEach(function (problem) {
      lines.push('- ' + problem);
    });
    lines.push('');
  });
  return lines;
}

// The last lines of every summary: the watch link, the note that nothing was
// sent, the maintainer and the issues page, and the changelog.
function summaryFooter(sentNote) {
  return [
    'For an hourly watch of these ads, see AdPromise: ' + addQuery('https://adpromise.com/pricing', utmQuery()),
    sentNote,
    'AdPromise maintains this script. Report a problem at ' + addQuery(ISSUES_URL, utmQuery()),
    'Changelog: ' + addQuery(CHANGELOG_URL, utmQuery())
  ];
}

// "1 ad" or "2 ads", for the summary lines.
function adCount(n) {
  return n + (n === 1 ? ' ad' : ' ads');
}

// "1 page" or "2 pages", for the refused-page count.
function pageCount(n) {
  return n + (n === 1 ? ' page' : ' pages');
}

// The number of distinct final URLs in the refused rows. Two ads that share one
// refused URL count as one page.
function distinctPages(refused) {
  var urls = {};
  refused.forEach(function (row) {
    urls[row.ad.finalUrl] = true;
  });
  return Object.keys(urls).length;
}

// The full check with the ad lines and the final URL filled in. The check reads
// both from the link. The ad text stops at AD_TEXT_MAX characters, the most
// that the check accepts.
function fullCheckLink(url, lines) {
  var ad = lines.join('\n').slice(0, AD_TEXT_MAX);
  return FULL_CHECK_URL + '?url=' + encodeURIComponent(url) + '&ad=' + encodeURIComponent(ad) + '&' + utmQuery() + '#check';
}

// The tags on every link in a summary, so each visit names the email.
function utmQuery() {
  return Object.keys(UTM).map(function (key) {
    return key + '=' + encodeURIComponent(UTM[key]);
  }).join('&');
}

// The price and stock engine. It mirrors src/lib/price-mismatch.ts for an ad.

var PRICE_AMOUNT = /(?<![\d.,])(?:([$€£]|\b(?:USD|EUR|GBP)\b)\s?(\d{1,3}(?:[.,\u00a0 ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,\u00a0 ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?([$€£]|\b(?:USD|EUR|GBP)\b))(?!\d)/;
var PRICE_FROM = /(?:\bfrom|\bstarting(?:\s+(?:at|from))?|\bas low as|\bab|\bà partir de|\bdesde)\s*$/i;
var PRICE_QUALIFIER_BEFORE = /\b(?:save|saving|off|over|under|above|below|up to|minimum|min|discount|spend)\s*$/i;
var PRICE_QUALIFIER_AFTER = /^\s*(?:off\b|back\b|or less\b|or more\b|orders?\b)/i;
var PRICE_STOCK_WORDS = /\b(?:out of stock|sold out|sold-out|back in stock|in stock|unavailable|available)\b/i;
var PRICE_STRUCK_TAGS = ['s', 'del', 'strike'];
var PRICE_VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];
var PRICE_REFUSED = [401, 403, 429, 503];
var PRICE_CHALLENGE = /cf-challenge|Just a moment\.\.\.|Verify you are human|checking your browser/i;
var PRICE_NEAR_CHARS = 600;

// The number in a figure. The last separator is the decimal part when it has
// one or two digits and appears once; every other separator is a group.
function priceFigureValue(figure) {
  var last = Math.max(figure.lastIndexOf('.'), figure.lastIndexOf(','));
  var tail = last >= 0 ? figure.slice(last + 1) : '';
  var sameSeparator = (figure.match(/[.,]/g) || []).filter(function (mark) {
    return mark === figure.charAt(last);
  }).length;
  var decimal = last >= 0 && tail.length <= 2 && sameSeparator === 1;
  if (!decimal) return Number(figure.replace(/[.,\s]/g, ''));
  var whole = figure.slice(0, last).replace(/[.,\s]/g, '');
  return Number(whole + '.' + tail);
}

// Every price with a currency mark in a text, in order. A bare $ gives no currency.
function readAmounts(text) {
  var found = [];
  var pattern = new RegExp(PRICE_AMOUNT.source, 'g');
  var match;
  while ((match = pattern.exec(text)) !== null) {
    var mark = match[1] || match[4] || '';
    var figure = match[2] || match[3] || '';
    var start = match.index;
    var end = start + match[0].length;
    var before = text.slice(Math.max(0, start - 24), start);
    var after = text.slice(end, end + 12);
    found.push({
      amount: priceFigureValue(figure),
      currency: mark === '$' ? null : mark === '€' ? 'EUR' : mark === '£' ? 'GBP' : mark,
      from: PRICE_FROM.test(before),
      qualified: PRICE_QUALIFIER_BEFORE.test(before) || PRICE_QUALIFIER_AFTER.test(after)
    });
  }
  return found;
}

// The stock word of a schema.org availability value.
function priceStock(value) {
  var key = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (key === '') return 'unknown';
  if (key.indexOf('outofstock') >= 0 || key.indexOf('soldout') >= 0) return 'out_of_stock';
  if (key.indexOf('instock') >= 0 || key.indexOf('instoreonly') >= 0 ||
      key.indexOf('onlineonly') >= 0 || key.indexOf('limitedavailability') >= 0) return 'in_stock';
  return 'other';
}

function priceSameAmount(left, right) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function priceShow(amount) {
  return amount.amount.toFixed(2) + (amount.currency ? ' ' + amount.currency : '');
}

// The first value that is not null or undefined, the way ?? reads it.
function priceFirst() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== null && arguments[i] !== undefined) return arguments[i];
  }
  return null;
}

// The visible price near the h1. A struck price or a "from" price is not the
// price to compare, and neither is a text with several prices.
function priceVisible(facts) {
  var found = [];
  facts.near.forEach(function (run) {
    readAmounts(run.text).forEach(function (amount) {
      if (!amount.qualified) {
        found.push({ amount: amount.amount, currency: amount.currency, from: amount.from, qualified: false, struck: run.struck });
      }
    });
  });
  var amounts = found.map(function (item) {
    return { amount: item.amount, currency: item.currency, from: item.from, qualified: false };
  });
  var reason = null;
  var amount = null;
  if (found.length === 0) {
    reason = facts.scripts && facts.visibleChars < 200 ? 'js_only' : 'no_price';
  } else if (found.some(function (item) { return item.struck; })) {
    reason = 'struck';
  } else if (found.some(function (item) { return item.from; })) {
    reason = 'from';
  } else if (found.map(function (item) { return item.amount; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; }).length > 1) {
    reason = 'several_prices';
  } else {
    amount = amounts[0];
  }
  return { amount: amount, reason: reason, amounts: amounts };
}

// The Offer that an ad compares with: the first priced Offer, on a page with one price.
function priceOffer(facts) {
  if (facts.variants) return null;
  for (var i = 0; i < facts.offers.length; i++) {
    if (facts.offers[i].price !== null) return facts.offers[i];
  }
  return null;
}

// The one availability state the page shows, or null when its Offers name several.
function priceAvailability(facts, offer) {
  if (facts.variants && !offer) return null;
  var offers = facts.variants && offer ? [offer] : facts.offers;
  var states = [];
  offers.forEach(function (item) {
    if (item.stock !== 'unknown' && states.indexOf(item.stock) < 0) states.push(item.stock);
  });
  if (states.length > 1) return null;
  return states.length === 1 ? states[0] : 'unknown';
}

// The ad headline and description, compared with the page. It returns the
// findings, the undecided fields, and what the page shows.
function comparePrices(facts, headline, description) {
  var findings = [];
  var undecided = [];
  if (facts.status >= 400) {
    ['price', 'currency', 'stock'].forEach(function (field) {
      undecided.push({ field: field, reason: 'page_error' });
    });
    return { findings: findings, undecided: undecided, page: { price: null, source: null, stock: 'unknown' } };
  }

  var visible = facts.variants ? { amount: null, reason: 'variants', amounts: [] } : priceVisible(facts);
  var picked = priceOffer(facts);
  var offer = visible.reason === 'several_prices' && picked &&
      !visible.amounts.some(function (amount) { return priceSameAmount(amount.amount, picked.price); })
    ? null
    : picked;
  var meta = !offer && !visible.amount && !facts.variants &&
      (visible.reason === 'no_price' || visible.reason === 'js_only')
    ? facts.meta
    : null;
  var shown = offer
    ? { amount: offer.price, currency: offer.currency, from: false, qualified: false }
    : priceFirst(visible.amount, meta && { amount: meta.amount, currency: meta.currency, from: false, qualified: false });
  var pageCurrency = priceFirst(
    offer ? offer.currency : undefined,
    visible.amount ? visible.amount.currency : undefined,
    meta ? meta.currency : undefined
  );
  var source = offer ? 'offer' : visible.amount ? 'visible' : meta ? 'meta' : null;

  if (offer && visible.amount && !priceSameAmount(offer.price, visible.amount.amount)) {
    findings.push({
      field: 'offer',
      cause: 'The price a visitor reads and the price in the structured data disagree.',
      saw: 'The visible price is ' + priceShow(visible.amount) + ', and the Offer says ' +
        priceShow({ amount: offer.price, currency: offer.currency }) + '.',
      fix: 'Make the schema.org Offer price match the price the page shows.'
    });
  }

  var expected = null;
  var prices = readAmounts(headline + '. ' + description);
  var distinct = prices.map(function (price) { return price.amount; })
    .filter(function (value, index, all) { return all.indexOf(value) === index; });
  if (prices.some(function (price) { return price.from; })) {
    undecided.push({ field: 'price', reason: 'from' });
  } else if (prices.some(function (price) { return price.qualified; })) {
    undecided.push({ field: 'price', reason: 'qualified' });
  } else if (distinct.length > 1) {
    undecided.push({ field: 'price', reason: 'several_prices' });
  } else {
    expected = prices[0] || null;
  }

  if (expected) {
    var shownText = source === 'meta'
      ? "the page's price meta tag says " + priceShow(shown || expected)
      : 'the page shows ' + (shown ? priceShow(shown) : '');
    if (!shown) {
      undecided.push({ field: 'price', reason: visible.reason || 'no_price' });
    } else if (!priceSameAmount(shown.amount, expected.amount)) {
      findings.push({
        field: 'price',
        cause: 'The page shows a different price than the ad.',
        saw: 'The ad says ' + priceShow(expected) + ', and ' + shownText + '.',
        fix: 'Change the ad to the price on the page, or change the page to the ad price.'
      });
    }
    if (expected.currency) {
      if (!pageCurrency) {
        undecided.push({ field: 'currency', reason: shown ? 'no_currency' : (visible.reason || 'no_price') });
      } else if (pageCurrency !== expected.currency) {
        findings.push({
          field: 'currency',
          cause: 'The page shows its price in another currency than the ad.',
          saw: 'The ad uses ' + expected.currency + ', and the page uses ' + pageCurrency + '.',
          fix: 'Use the currency of the page in the feed or the ad, or show the price in that currency on the page.'
        });
      }
    }
  }

  var stock = priceAvailability(facts, offer);
  return {
    findings: findings,
    undecided: undecided,
    page: {
      price: shown,
      source: source,
      stock: stock === null ? 'unknown' : stock
    }
  };
}

// The quote of the first run near the h1 that passes the test, with its tags and
// spaces flattened and cut at 300 characters.
function priceQuote(facts, test, struck) {
  for (var i = 0; i < facts.near.length; i++) {
    var run = facts.near[i];
    if (run.struck === struck && test(run)) {
      return run.text.replace(/\s+/g, ' ').trim().slice(0, 300);
    }
  }
  return '';
}

// The check line for one ad text: each finding in one sentence with the page
// quote, and an out-of-stock line when the page is out of stock. A text with no
// price and a page with no Offer gets no check.
function priceAdCheck(facts, adText) {
  if (readAmounts(adText).length === 0 && facts.offers.length === 0) return null;
  var result = comparePrices(facts, adText, '');
  var offer = priceOffer(facts);
  var visible = priceVisible(facts).amount;
  var stock = priceAvailability(facts, offer);
  if (stock === null) stock = 'unknown';
  var amountQuote = priceQuote(facts, function (run) { return readAmounts(run.text).length > 0; }, false);
  var stockQuote = priceQuote(facts, function (run) { return PRICE_STOCK_WORDS.test(run.text); }, false);
  var lines = result.findings.map(function (finding) {
    var quote = amountQuote ? ' The page says: “' + amountQuote + '”.' : '';
    return finding.cause + ' ' + finding.saw + quote + ' ' + finding.fix;
  });
  if (stock === 'out_of_stock') {
    lines.push('The page says the product is out of stock' + (stockQuote ? ': “' + stockQuote + '”' : '') +
      '. Next step: restore stock or pause the ad until the product is back.');
  }
  return {
    visible: visible ? { amount: visible.amount, currency: visible.currency } : null,
    offer: offer ? { amount: offer.price, currency: offer.currency } : null,
    stock: stock,
    lines: lines.slice(0, 4)
  };
}

// The page reader. It reads the status, the JSON-LD Offers, the product meta
// price, and the visible text from the first h1, the way src/server/price-mismatch.ts does.
// It does not read microdata or hidden elements.
function readPriceFacts(html, status) {
  var offers = [];
  var flags = { range: false };
  var ld = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi;
  var block;
  while ((block = ld.exec(html)) !== null) {
    var data;
    try {
      data = JSON.parse(block[1]);
    } catch (error) {
      continue;
    }
    readJsonLdOffers(data, offers, flags);
  }
  var meta = readMetaPrice(html);
  var runs = readVisibleRuns(html);
  var near = [];
  var used = 0;
  for (var i = runs.start; i < runs.runs.length; i++) {
    if (used >= PRICE_NEAR_CHARS) break;
    near.push(runs.runs[i]);
    used += runs.runs[i].text.length;
  }
  var distinct = [];
  offers.forEach(function (offer) {
    if (offer.price === null) return;
    var key = offer.price + ' ' + offer.currency;
    if (distinct.indexOf(key) < 0) distinct.push(key);
  });
  return {
    status: status,
    near: near,
    offers: offers,
    variants: flags.range || distinct.length > 1,
    visibleChars: runs.chars,
    scripts: /<script[\s>]/i.test(html),
    meta: meta
  };
}

// The text of a JSON-LD value, trimmed; null when it is empty or not text.
function priceText(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function priceNumber(value) {
  var text = priceText(value);
  if (text === null) return null;
  var number = Number(text);
  return isFinite(number) ? number : null;
}

// Walks the JSON-LD tree and collects each Offer. A range (an AggregateOffer
// with two prices) sets flags.range.
function readJsonLdOffers(node, out, flags) {
  if (Array.isArray(node)) {
    node.forEach(function (item) { readJsonLdOffers(item, out, flags); });
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node['@graph']) readJsonLdOffers(node['@graph'], out, flags);
  var types = [].concat(node['@type'] || []);
  if (node.hasVariant) readJsonLdOffers(node.hasVariant, out, flags);
  if (node.offers) readJsonLdOffers(node.offers, out, flags);
  var isOffer = types.some(function (type) { return type === 'Offer' || type === 'AggregateOffer'; });
  if (!isOffer) return;
  var low = priceNumber(priceFirst(node.lowPrice, node.price));
  var high = priceNumber(node.highPrice);
  if (types.indexOf('AggregateOffer') >= 0 && high !== null && high !== low) flags.range = true;
  out.push({
    price: low,
    currency: priceText(node.priceCurrency),
    stock: priceStock(priceText(node.availability)),
    url: null,
    sku: null,
    gtin: null
  });
}

// The value of one attribute in an opening tag, or null.
function tagAttribute(tag, name) {
  var match = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  if (!match) return null;
  return match[1] !== undefined ? match[1] : match[2];
}

// The price in the product meta tags. The first tag that names a key with an
// amount wins, as the page reader does.
function readMetaPrice(html) {
  var tags = html.match(/<meta\b[^>]*>/gi) || [];
  var read = function (names) {
    for (var i = 0; i < names.length; i++) {
      var tag = tags.filter(function (item) {
        return tagAttribute(item, 'property') === names[i] || tagAttribute(item, 'name') === names[i];
      })[0];
      var value = tag ? priceText(tagAttribute(tag, 'content')) : null;
      if (value !== null) return value;
    }
    return null;
  };
  var amount = priceNumber(read(['product:price:amount', 'og:price:amount']));
  if (amount === null) return null;
  var currency = read(['product:price:currency', 'og:price:currency']);
  return { amount: amount, currency: currency === null ? null : currency.toUpperCase() };
}

// The visible text of the body in page order, with a struck flag for text inside
// s, del, strike, or a line-through style, and the index of the first text inside the h1.
function readVisibleRuns(html) {
  var body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  var bodyStart = body.search(/<body\b[^>]*>/i);
  if (bodyStart >= 0) body = body.slice(bodyStart);
  var tokens = body.match(/<[^>]+>|[^<]+/g) || [];
  var runs = [];
  var stack = [];
  var start = -1;
  var chars = 0;
  tokens.forEach(function (token) {
    if (token.charAt(0) !== '<') {
      var text = decodeEntities(token);
      runs.push({
        text: text,
        struck: stack.some(function (open) { return open.struck; })
      });
      chars += text.replace(/\s+/g, ' ').trim().length;
      return;
    }
    var close = /^<\/\s*([a-zA-Z0-9]+)/.exec(token);
    if (close) {
      var name = close[1].toLowerCase();
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      return;
    }
    var open = /^<\s*([a-zA-Z0-9]+)/.exec(token);
    if (!open) return;
    var tag = open[1].toLowerCase();
    if (tag === 'h1' && start < 0) start = runs.length;
    if (PRICE_VOID_TAGS.indexOf(tag) >= 0 || /\/\s*>$/.test(token)) return;
    stack.push({
      name: tag,
      struck: PRICE_STRUCK_TAGS.indexOf(tag) >= 0 || /line-through/i.test(token)
    });
  });
  return { runs: runs, start: Math.max(start, 0), chars: chars };
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(Number(code)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) { return String.fromCharCode(parseInt(code, 16)); })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Checks each ad against its final URL. A URL is fetched once and a URL past the
// cap is not fetched. A page that the site refuses, or a bot check, is reported
// apart from a mismatch.
function checkPrices(ads, fetch) {
  var pages = {};
  var distinct = 0;
  var result = { checked: 0, notChecked: 0, noUrl: 0, rows: [], refused: [], pageErrors: [], undecidedAds: 0 };
  for (var i = 0; i < ads.length; i++) {
    var ad = ads[i];
    if (!ad.finalUrl) {
      result.noUrl++;
      continue;
    }
    if (!pages[ad.finalUrl]) {
      if (distinct >= CAPS.urls) {
        result.notChecked++;
        continue;
      }
      distinct++;
      pages[ad.finalUrl] = walkUrl(ad.finalUrl, fetch, 0);
    }
    var page = pages[ad.finalUrl];
    var problem = priceRefusal(page);
    if (problem) {
      result[problem.kind].push({ ad: ad, reason: problem.reason });
      continue;
    }
    result.checked++;
    var text = adLines(ad).join('. ');
    var facts = readPriceFacts(page.body, page.status);
    var check = priceAdCheck(facts, text);
    if (comparePrices(facts, text, '').undecided.some(function (item) { return item.field === 'price'; })) {
      result.undecidedAds++;
    }
    if (check && check.lines.length > 0) result.rows.push({ ad: ad, url: page.finalUrl, lines: check.lines });
  }
  return result;
}

// Why a page could not be compared, or null when it can. A refused fetch and a
// challenge page are "refused"; a page error, a redirect loop, and an unreachable URL are "pageErrors".
function priceRefusal(page) {
  if (page.tooManyRedirects) {
    return { kind: 'pageErrors', reason: 'The final URL redirects more than ' + CAPS.redirects + ' times.' };
  }
  if (page.status === 0) return { kind: 'pageErrors', reason: 'The final URL could not be reached.' };
  if (PRICE_REFUSED.indexOf(page.status) >= 0) {
    return { kind: 'refused', reason: 'The site refused the request with HTTP ' + page.status + '.' };
  }
  if (PRICE_CHALLENGE.test(page.body || '')) {
    return { kind: 'refused', reason: 'The site returned a bot check page.' };
  }
  if (page.status < 200 || page.status >= 300) {
    return { kind: 'pageErrors', reason: 'The final URL returns HTTP ' + page.status + '.' };
  }
  return null;
}

// The link to the price checker, with the page URL filled in and the four UTM fields.
function priceCheckLink(url) {
  return PRICE_CHECK_URL + '?url=' + encodeURIComponent(url) + '&utm_source=' +
    encodeURIComponent(UTM.utm_source) + '&utm_campaign=' + encodeURIComponent(UTM.utm_campaign) +
    '&utm_content=price-check&utm_medium=email';
}

// The subject and body of the summary mail. A refused page and a page error are
// listed apart from the mismatches, and each mismatch row links the price checker.
function buildPriceSummary(read, result) {
  var lines = [];
  lines.push('AdPromise checked ' + adCount(result.checked) + ' against their final URLs.');
  lines.push('Price or stock mismatches in ' + adCount(result.rows.length) + '.');
  if (result.undecidedAds > 0) {
    lines.push('No clear price on the page or in the ad for ' + adCount(result.undecidedAds) + ', so those were not compared.');
  }
  if (read.capped || result.notChecked > 0) {
    lines.push('Caps reached: ' + CAPS.ads + ' ads and ' + CAPS.urls + ' final URLs per run. Ads past a cap were not checked.');
  }
  if (result.refused.length > 0) {
    lines.push('');
    lines.push('Pages the site refused or blocked. These are not mismatches:');
    result.refused.forEach(function (item) {
      lines.push('Ad ' + item.ad.id + ' (' + item.ad.finalUrl + '): ' + item.reason);
    });
  }
  if (result.pageErrors.length > 0) {
    lines.push('');
    lines.push('Pages that did not load a price. These are not mismatches:');
    result.pageErrors.forEach(function (item) {
      lines.push('Ad ' + item.ad.id + ' (' + item.ad.finalUrl + '): ' + item.reason);
    });
  }
  lines.push('');
  result.rows.forEach(function (row) {
    lines.push('Ad ' + row.ad.id + ' in ' + row.ad.campaign + ' / ' + row.ad.adGroup);
    lines.push('Final URL: ' + row.url);
    row.lines.forEach(function (line) {
      lines.push('- ' + line);
    });
    lines.push('Check this ad: ' + priceCheckLink(row.url));
    lines.push('');
  });
  lines.push('This script sent nothing to AdPromise. It ran in your account only.');
  return {
    subject: 'AdPromise price check: ' + adCount(result.rows.length) + ' with a price or stock mismatch',
    body: lines.join('\n')
  };
}
