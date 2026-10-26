// AdPromise promise check for a Google Ads manager (MCC) account.
// Paste this script under Tools > Bulk actions > Scripts in your manager
// account. It reads the enabled responsive search ads in your client accounts,
// opens each final URL, and mails you one summary.
//
// Set CONFIG.accountIds to the client accounts to check, by customer ID.
// Leave it empty to check every client account, in the order Google returns,
// up to the account cap.
//
// Caps per run: 20 client accounts, 1000 ads across them, and 200 distinct final URLs.
// Accounts, ads, and URLs past a cap are not checked, and the summary says so.
// The script stops at 20 minutes, before the 30-minute manager limit.
// The script follows each redirect itself, up to 5 per URL.
//
// It reads the ad copy, the final URL, the campaign, the ad group, and the cost.
// It changes nothing in any account. It sends nothing to AdPromise: the only
// outside requests go to the final URLs and to the one summary email.
// A promise listed as "not found in the page text" is missing from the page
// text. It is not proof that the claim is false.

var CAPS = { ads: 1000, urls: 200, redirects: 5, accounts: 20, runtimeMs: 1200000 };
var QUERY = "SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, campaign.name, ad_group.name, metrics.cost_micros FROM ad_group_ad WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status = 'ENABLED' ORDER BY metrics.cost_micros DESC";
var QUICK_URL = "https://adpromise.com/quick";
var UTM = {"utm_source":"github","utm_campaign":"promise-script"};
var TRACKING_PROBE = ["gclid=adpromise-probe","utm_source=adpromise","utm_medium=cpc","utm_campaign=promise-check"];
var RULES = [{"kind":"price","label":"Price","source":"[$£€]\\s?\\d[\\d,.]*|\\b\\d[\\d,.]*\\s?(?:usd|dollars?|euros?|pounds?)\\b","flags":"gi"},{"kind":"percent","label":"Percent","source":"\\b\\d[\\d.]*\\s?(?:%|percent\\b)","flags":"gi"},{"kind":"free-trial","label":"Free trial","source":"\\bfree trials?\\b","flags":"gi"},{"kind":"free-shipping","label":"Free shipping","source":"\\bfree (?:shipping|delivery)\\b","flags":"gi"},{"kind":"guarantee","label":"Guarantee","source":"\\b(?:money[- ]back[- ]guarantee|money[- ]back|guarantee[ds]?)\\b","flags":"gi"},{"kind":"no-card","label":"No credit card","source":"\\bno (?:credit|debit) cards?\\b","flags":"gi"},{"kind":"time","label":"Time claim","source":"\\bin (?:\\d+|one|two|three|a few) (?:seconds?|minutes?|hours?|days?|weeks?)\\b|\\bsame[- ]day\\b|\\bovernight\\b|\\b\\d+\\s?(?:hours?|days?|minutes?)\\b","flags":"gi"},{"kind":"number","label":"Number","source":"\\d[\\d,.]*","flags":"g"}];

// The settings that you can change.
var CONFIG = {
  // Client account customer IDs to check, for example ['123-456-7890'].
  // Leave it empty to check every client account up to the account cap.
  accountIds: [],
  // Mail the one summary to this address. Leave it empty to mail the
  // signed-in owner of the manager account.
  ownerEmail: ''
};

function main() {
  var run = runAccounts();
  var mail = buildManagerSummary(run);
  var recipient = CONFIG.ownerEmail || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(recipient, mail.subject, mail.body);
  Logger.log(mail.subject);
}

// Selects the accounts to read. An explicit ID list wins; otherwise the run
// reads every client account up to the cap. The selector asks for one row past
// the cap, so the summary can say that accounts were left out. An explicit
// list past the cap is split, so the summary can name the IDs it did not ask
// Google Ads for.
function selectAccounts() {
  var ids = CONFIG.accountIds || [];
  if (ids.length > 0) {
    return {
      iterator: AdsManagerApp.accounts().withIds(ids.slice(0, CAPS.accounts + 1)).get(),
      dropped: ids.slice(CAPS.accounts + 1)
    };
  }
  return {
    iterator: AdsManagerApp.accounts().withLimit(CAPS.accounts + 1).get(),
    dropped: []
  };
}

function normalizeAccountId(id) {
  return String(id).replace(/[^0-9]/g, '');
}

function accountName(account) {
  try {
    return account.getName() || account.getCustomerId();
  } catch (error) {
    return 'Unknown account';
  }
}

function accountId(account) {
  try {
    return account.getCustomerId() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// Reads each selected client account and collects the findings into one run.
// A denied or failed account is recorded and the run continues. The shared
// budget keeps the URL cache and the URL and time caps across all accounts.
function runAccounts() {
  var deadline = currentMillis() + CAPS.runtimeMs;
  var requested = CONFIG.accountIds || [];
  var selection = selectAccounts();
  var accounts = selection.iterator;
  var seen = {};
  var budget = { pages: {}, distinct: 0, maxUrls: CAPS.urls, deadline: deadline };
  var results = [];
  var skipped = [];
  var tried = 0;
  var read = 0;
  var adsRead = 0;
  var checkedAds = 0;
  var accountCapped = false;
  var adCapped = false;
  var urlCapped = false;
  var timeCapped = false;

  while (accounts.hasNext()) {
    var account = accounts.next();
    var name = accountName(account);
    var id = accountId(account);
    seen[normalizeAccountId(id)] = true;
    if (tried >= CAPS.accounts) {
      accountCapped = true;
      skipped.push({ name: name, id: id, reason: 'the account cap was reached' });
      continue;
    }
    tried++;
    if (timeCapped) {
      skipped.push({ name: name, id: id, reason: 'the time cap stopped the run' });
      continue;
    }
    if (currentMillis() >= deadline) {
      timeCapped = true;
      skipped.push({ name: name, id: id, reason: 'the time cap stopped the run' });
      continue;
    }
    if (adsRead >= CAPS.ads) {
      adCapped = true;
      skipped.push({ name: name, id: id, reason: 'the ad cap was reached' });
      continue;
    }
    var accountRead;
    var result;
    try {
      AdsManagerApp.select(account);
      accountRead = readAds(CAPS.ads - adsRead);
      result = checkAds(accountRead.ads, fetchOnce, budget);
    } catch (error) {
      skipped.push({ name: name, id: id, reason: 'Google Ads returned an error for this account' });
      continue;
    }
    read++;
    adsRead += accountRead.ads.length;
    checkedAds += result.checked;
    if (accountRead.capped) adCapped = true;
    if (result.urlCapped) urlCapped = true;
    if (result.stopped) timeCapped = true;
    results.push({
      name: name,
      id: id,
      checked: result.checked,
      notChecked: result.notChecked,
      rows: result.rows
    });
  }

  selection.dropped.forEach(function (droppedId) {
    accountCapped = true;
    skipped.push({ name: 'Requested account', id: droppedId, reason: 'the account cap was reached' });
  });
  requested.forEach(function (requestedId) {
    if (seen[normalizeAccountId(requestedId)]) return;
    if (selection.dropped.indexOf(requestedId) >= 0) return;
    skipped.push({
      name: 'Requested account',
      id: requestedId,
      reason: 'Google Ads did not return this account to the manager account'
    });
  });

  return {
    cap: CAPS,
    tried: tried,
    read: read,
    checkedAds: checkedAds,
    results: results,
    skipped: skipped,
    accountCapped: accountCapped,
    adCapped: adCapped,
    urlCapped: urlCapped,
    timeCapped: timeCapped
  };
}

// The subject and body of the one manager summary. Each account has a heading,
// so an ad stays with the client account that the run read it from.
function buildManagerSummary(run) {
  var lines = [];
  var problemAds = 0;
  run.results.forEach(function (account) {
    problemAds += account.rows.length;
  });
  lines.push('AdPromise checked ' + adCount(run.checkedAds) + ' in ' + accountCount(run.read, run.tried) + '.');
  lines.push('Problems found in ' + adCount(problemAds) + '.');
  var caps = [];
  if (run.accountCapped) caps.push(quantity(run.cap.accounts, 'client account', 'client accounts'));
  if (run.adCapped) caps.push(adCount(run.cap.ads));
  if (run.urlCapped) caps.push(quantity(run.cap.urls, 'final URL', 'final URLs'));
  if (caps.length > 0) {
    lines.push('Caps reached: ' + caps.join(', ') + ' per run. Everything past a cap was not checked.');
  }
  if (run.timeCapped) {
    lines.push('The time cap stopped the run. Everything after it was not checked.');
  }
  if (run.skipped.length > 0) {
    lines.push('Skipped accounts:');
    run.skipped.forEach(function (skip) {
      lines.push('- ' + skip.name + ' (' + skip.id + '): ' + skip.reason + '.');
    });
  }
  lines.push('');
  run.results.forEach(function (account) {
    lines.push('== ' + account.name + ' (' + account.id + '): ' + adCount(account.checked) + ', ' + problemCount(account.rows.length) + ' ==');
    if (account.rows.length === 0) lines.push('No problems found.');
    account.rows.forEach(function (row) {
      lines.push('Ad ' + row.ad.id + ' in ' + row.ad.campaign + ' / ' + row.ad.adGroup);
      lines.push('Final URL: ' + (row.ad.finalUrl || 'none'));
      row.problems.forEach(function (problem) {
        lines.push('- ' + problem);
      });
      if (row.ad.finalUrl) lines.push('Check this ad: ' + quickLink(row.ad.finalUrl, row.lines));
      lines.push('');
    });
    if (account.notChecked > 0) {
      lines.push(adCount(account.notChecked) + ' in this account were not checked.');
      lines.push('');
    }
  });
  lines.push('For an hourly watch of these ads, see AdPromise: ' + addQuery('https://adpromise.com/pricing', utmQuery()));
  lines.push('This script sent nothing to AdPromise. It ran in your manager account only.');
  return {
    subject: 'AdPromise promise check: ' + adCount(problemAds) + ' with a problem',
    body: lines.join('\n')
  };
}

function accountCount(read, tried) {
  if (read === tried) return quantity(read, 'client account', 'client accounts');
  return read + ' of ' + quantity(tried, 'client account', 'client accounts');
}

function problemCount(n) {
  return quantity(n, 'problem', 'problems');
}

function quantity(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

// Reads the enabled responsive search ads. AdsApp.search returns one row per ad.
function readAds(maxAds) {
  var limit = typeof maxAds === 'number' ? Math.min(CAPS.ads, maxAds) : CAPS.ads;
  var rows = AdsApp.search(QUERY);
  var ads = [];
  while (rows.hasNext() && ads.length < limit) {
    var row = rows.next();
    var ad = row.adGroupAd.ad;
    var rsa = ad.responsiveSearchAd || {};
    ads.push({
      id: ad.id,
      campaign: row.campaign.name,
      adGroup: row.adGroup.name,
      finalUrl: (ad.finalUrls || [])[0] || '',
      headlines: (rsa.headlines || []).map(assetText),
      descriptions: (rsa.descriptions || []).map(assetText)
    });
  }
  return { ads: ads, capped: rows.hasNext() };
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
  for (var i = 0; i < ads.length; i++) {
    if (deadline && currentMillis() >= deadline) {
      notChecked += ads.length - i;
      stopped = true;
      break;
    }
    var ad = ads[i];
    if (!ad.finalUrl) {
      rows.push({ ad: ad, lines: adLines(ad), problems: ['No final URL is set on this ad.'] });
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
    if (row.problems.length > 0) rows.push(row);
  }
  budget.distinct = distinct;
  return {
    checked: ads.length - notChecked,
    notChecked: notChecked,
    rows: rows,
    stopped: stopped,
    urlCapped: urlCapped
  };
}

function currentMillis() {
  return new Date().getTime();
}

// The headline and description lines of an ad, in Google's order.
function adLines(ad) {
  return ad.headlines.concat(ad.descriptions).filter(function (line) {
    return String(line).trim() !== '';
  });
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
      return { hops: hops, finalUrl: url, status: response.code, tooManyRedirects: true, timedOut: false, body: '' };
    }
    hops.push({ url: url, code: response.code });
    url = resolveUrl(url, response.location);
    response = fetch(url);
  }
  return {
    hops: hops,
    finalUrl: url,
    status: response.code,
    tooManyRedirects: false,
    timedOut: false,
    body: response.body || ''
  };
}

// One fetch with redirects off. A URL that fails to load returns status 0.
function fetchOnce(url) {
  try {
    var response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var headers = response.getHeaders();
    var location = '';
    for (var key in headers) {
      if (key.toLowerCase() === 'location') location = headers[key];
    }
    return { code: response.getResponseCode(), location: location, body: response.getContentText() };
  } catch (error) {
    return { code: 0, location: '', body: '' };
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

// The problems of one ad. A page that did not load gets no promise check,
// because the script has no page text to compare.
function problemsFor(ad, page) {
  var problems = [];
  if (page.tooManyRedirects) {
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
  var lines = adLines(ad);
  if (page.status >= 200 && page.status < 300) {
    missingClaims(lines, visibleText(page.body)).forEach(function (miss) {
      problems.push('Not found in the page text: "' + miss.text + '", in the line "' + miss.line + '".');
    });
  }
  return { ad: ad, lines: lines, problems: problems };
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

// The subject and body of the summary mail. Each row holds one ad with a
// problem and a link that opens the same ad on the free check.
function buildSummary(read, result) {
  var lines = [];
  lines.push('AdPromise checked ' + adCount(result.checked) + ' in this account.');
  lines.push('Problems found in ' + adCount(result.rows.length) + '.');
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
    if (row.ad.finalUrl) lines.push('Check this ad: ' + quickLink(row.ad.finalUrl, row.lines));
    lines.push('');
  });
  lines.push('For an hourly watch of these ads, see AdPromise: ' + addQuery('https://adpromise.com/pricing', utmQuery()));
  lines.push('This script sent nothing to AdPromise. It ran in your account only.');
  return {
    subject: 'AdPromise promise check: ' + adCount(result.rows.length) + ' with a problem',
    body: lines.join('\n')
  };
}

// "1 ad" or "2 ads", for the summary lines.
function adCount(n) {
  return n + (n === 1 ? ' ad' : ' ads');
}

// The /quick address with the ad lines and the final URL filled in.
function quickLink(url, lines) {
  return QUICK_URL + '?url=' + encodeURIComponent(url) + '&ad=' + encodeURIComponent(lines.join('\n')) + '&' + utmQuery();
}

function utmQuery() {
  return Object.keys(UTM).map(function (key) {
    return key + '=' + encodeURIComponent(UTM[key]);
  }).join('&');
}
