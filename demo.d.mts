// Types for demo.mjs, the no-account demo run of the promise check script.
// The committed public script and the demo stay in sync through
// test/promise-script-demo.test.ts.

export type DemoAd = {
  id: string;
  campaign: string;
  adGroup: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
};

export type DemoPage = {
  code: number;
  location?: string;
  body?: string;
};

export type DemoMail = {
  to: string;
  subject: string;
  body: string;
};

export type DemoRun = {
  script: string;
  caps: { ads: number; urls: number; redirects: number };
  ads: DemoAd[];
  queries: string[];
  requests: string[];
  mails: DemoMail[];
  logs: string[];
};

export const DEMO_HOST: string;
export const DEMO_OWNER: string;
export const DEMO_ADS: DemoAd[];
export const DEMO_PAGES: Record<string, DemoPage>;
export function runDemo(scriptText: string, ads?: DemoAd[]): DemoRun;
export function formatDemoRun(run: DemoRun): string;
