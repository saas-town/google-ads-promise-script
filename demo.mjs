// A no-account demo run of the AdPromise promise check.
// It runs promise-check.js from this folder against the fictional ads and
// pages below. It needs no Google Ads account, no network, and no email.
//
// Run it from this folder with Node.js 18 or later:
//   node demo.mjs
//
// It prints the one summary email that the script would send, then what the
// run did. Every ad, page, URL, name, and address here is made up.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Every demo request stays on this reserved example domain. */
export const DEMO_HOST = 'example.com';
/** The demo owner that the script mails. It is not a real address. */
export const DEMO_OWNER = 'owner@example.com';

/** The fictional responsive search ads that the demo reads. */
export const DEMO_ADS = [
  {
    id: '1234567890',
    campaign: 'Spring sale',
    adGroup: 'Trail shoes',
    finalUrl: 'https://example.com/running-shoes',
    headlines: ['Trail shoes from $20', 'Free shipping on all orders'],
    descriptions: ['Shop spring colors. 30-day money-back guarantee.'],
  },
  {
    id: '2345678901',
    campaign: 'Spring sale',
    adGroup: 'Rain jackets',
    finalUrl: 'https://example.com/rain-jackets',
    headlines: ['Rain jackets 25% off', 'Ships in 2 days'],
    descriptions: ['No credit card needed to order.'],
  },
  {
    id: '3456789012',
    campaign: 'Spring sale',
    adGroup: 'Camp stoves',
    finalUrl: 'https://example.com/camp-stoves',
    headlines: ['Camp stoves from $89'],
    descriptions: ['Free trial for 30 days.'],
  },
  {
    id: '4567890123',
    campaign: 'Gift guide',
    adGroup: 'Gift cards',
    finalUrl: 'https://example.com/gift-cards',
    headlines: ['Gift cards from $25', 'Free delivery'],
    descriptions: ['Money-back guarantee on every order.'],
  },
  {
    id: '5678901234',
    campaign: 'Gift guide',
    adGroup: 'Tents',
    finalUrl: 'https://example.com/tents',
    headlines: ['Tents from $149', 'Free shipping'],
    descriptions: ['Ships in 3 days.'],
  },
  {
    id: '6789012345',
    campaign: 'Gift guide',
    adGroup: 'Sleeping bags',
    finalUrl: 'https://example.com/sleeping-bags',
    headlines: ['Sleeping bags from $59'],
    descriptions: ['Same-day delivery in Boston.'],
  },
];

const html = (text) => `<html><body><p>${text}</p></body></html>`;

/** The fictional responses that stand in for the final URLs. */
export const DEMO_PAGES = {
  // Two redirects drop the tracking probe, so the summary reports the loss.
  '/running-shoes': { code: 302, location: '/shoes' },
  '/shoes': { code: 302, location: '/shoes/spring' },
  '/shoes/spring': {
    code: 200,
    body: html(
      'Trail shoes from $29 a pair. Free shipping on every order. Our 30-day money-back guarantee applies.',
    ),
  },
  // One redirect keeps the tracking probe, so the summary reports no loss.
  '/rain-jackets': {
    code: 302,
    location:
      '/jackets?gclid=adpromise-probe&utm_source=adpromise&utm_medium=cpc&utm_campaign=promise-check',
  },
  '/jackets': {
    code: 200,
    body: html(
      'Rain jackets 25 percent off. Ships in 2 days. No card needed to order.',
    ),
  },
  '/camp-stoves': { code: 404, body: html('The page does not exist.') },
  '/gift-cards': {
    code: 200,
    body: html(
      'Gift cards from $25. Free delivery on every order. Money-back guarantee on every order.',
    ),
  },
  '/tents': {
    code: 200,
    body: html('Tents from $149. Free shipping on every order. Ships in 3 days.'),
  },
  '/sleeping-bags': {
    code: 200,
    body: html('Sleeping bags from $59. Same-day delivery in Boston.'),
  },
};

// One row as AdsApp.search returns it: the ad, its campaign, and its ad group.
function demoRow(ad) {
  return {
    adGroupAd: {
      ad: {
        id: ad.id,
        finalUrls: ad.finalUrl ? [ad.finalUrl] : [],
        responsiveSearchAd: {
          headlines: ad.headlines.map((text) => ({ text })),
          descriptions: ad.descriptions.map((text) => ({ text })),
        },
      },
    },
    campaign: { name: ad.campaign },
    adGroup: { name: ad.adGroup },
  };
}

// The stand-in response for one URL. A request outside the demo fails here, so
// the run cannot reach a real site by accident. The script catches a fetch
// error and reports a dead URL, so runDemo fails the whole run on a violation.
function demoPage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== DEMO_HOST)
    throw new Error(`The demo may not request ${url}.`);
  const page = DEMO_PAGES[parsed.pathname];
  if (!page)
    throw new Error(
      `The demo has no page for ${parsed.pathname}. Add it to DEMO_PAGES.`,
    );
  return page;
}

// The script text as a function that returns its main() and its caps.
function loadScript(scriptText, globals) {
  const factory = new Function(
    'AdsApp',
    'UrlFetchApp',
    'MailApp',
    'Session',
    'Logger',
    `${scriptText}
return { main: main, CAPS: CAPS };`,
  );
  return factory(
    globals.adsApp,
    globals.urlFetchApp,
    globals.mailApp,
    globals.session,
    globals.logger,
  );
}

/**
 * Runs the pasted script with stand-ins for AdsApp, UrlFetchApp, MailApp,
 * Session, and Logger. It returns what the run read, requested, and mailed.
 * A test passes its own ads to exercise the guard against a real request.
 */
export function runDemo(scriptText, ads = DEMO_ADS) {
  const queries = [];
  const requests = [];
  const mails = [];
  const logs = [];
  let next = 0;
  const adsApp = {
    search(query) {
      queries.push(query);
      return {
        hasNext: () => next < ads.length,
        next: () => demoRow(ads[next++]),
      };
    },
  };
  const violations = [];
  const urlFetchApp = {
    fetch(url) {
      try {
        const page = demoPage(url);
        requests.push(url);
        return {
          getResponseCode: () => page.code,
          getHeaders: () => (page.location ? { Location: page.location } : {}),
          getContentText: () => page.body ?? '',
        };
      } catch (error) {
        violations.push(error);
        throw error;
      }
    },
  };
  const mailApp = {
    sendEmail(to, subject, body) {
      mails.push({ to, subject, body });
    },
  };
  const session = { getEffectiveUser: () => ({ getEmail: () => DEMO_OWNER }) };
  const logger = { log: (line) => logs.push(line) };

  const script = loadScript(scriptText, {
    adsApp,
    urlFetchApp,
    mailApp,
    session,
    logger,
  });
  script.main();

  if (violations.length > 0) throw violations[0];
  if (mails.length !== 1)
    throw new Error(`The demo run prepared ${mails.length} emails, not one.`);
  return {
    script: scriptText,
    caps: script.CAPS,
    ads,
    queries,
    requests,
    mails,
    logs,
  };
}

/** The demo run as text for a terminal: the summary email, then what it did. */
export function formatDemoRun(run) {
  const [mail] = run.mails;
  return [
    'AdPromise promise check: demo run',
    '',
    'The demo runs promise-check.js from this folder with made-up ads and pages.',
    'It uses no Google Ads account, makes no network request, and sends no email.',
    '',
    `Subject: ${mail.subject}`,
    '',
    mail.body,
    '',
    '--- end of the summary email ---',
    '',
    `The run read ${run.ads.length} ads and requested ${run.requests.length} demo pages.`,
    `It prepared one email to ${mail.to} and sent nothing.`,
    `Every request went to ${DEMO_HOST}. No request left this folder.`,
  ].join('\n');
}

// Run only when Node.js starts this file, not when a test imports it.
const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const script = readFileSync(
    new URL('./promise-check.js', import.meta.url),
    'utf8',
  );
  process.stdout.write(`${formatDemoRun(runDemo(script))}\n`);
}
