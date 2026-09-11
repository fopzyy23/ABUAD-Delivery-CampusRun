// Throwaway smoke test — executes assets/js/app.js in a stubbed DOM/browser
// environment and asserts the homepage "Reach Us" section renders, the report
// route resolves, and nothing throws at top-level boot. NOT part of the repo.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');

// --- universal element stub (Proxy returns itself for everything) ---
const elementStub = new Proxy(function () {}, {
  get(t, k) {
    if (k === 'children') return [];
    if (k === 'style') return new Proxy({}, { get: () => '', set: () => true });
    if (k === 'classList') return { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
    if (k === 'dataset') return new Proxy({}, { get: () => '', set: () => true });
    if (k === 'rows') return { length: 0 };
    return elementMethodStub;
  },
  set() { return true; },
  apply() { return elementStub; }
});
// Any method called on a stubbed element returns a promise-like no-op so
// `$(sel).addEventListener(...)`, `.animate(...)` etc. never throw.
const elementMethodStub = new Proxy(function () {}, {
  get(t, k) { return elementMethodStub; },
  apply() { return undefined; }
});

const elements = {};
let lastView = '';
const appStub = {
  addEventListener() {},
  set innerHTML(v) { lastView = String(v); },
  get innerHTML() { return lastView; }
};
Object.assign(appStub, elementStub, { addEventListener: () => {} });
// Re-assert accessors (Object.assign may have copied stub values over them)
Object.defineProperty(appStub, 'innerHTML', {
  set(v) { lastView = String(v); },
  get() { return lastView; }
});
const docListeners = {};
const documentStub = {
  getElementById: () => elementStub,
  createElement: () => elementStub,
  querySelector: (sel) => (sel === '#app' ? appStub : elementStub),
  querySelectorAll: () => [],
  addEventListener: (type, cb) => { docListeners[type] = cb; },
  documentElement: { dataset: { theme: 'light' } },
  body: { contains: () => false }
};

const localStorageStub = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const locationStub = { hash: '', pathname: '/', replaceState: () => {} };

// --- supabase stub: resolves realistic shapes so boot session-restore works ---
const FAKE_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'smoke@dropzyy.app',
  user_metadata: { full_name: 'Smoke Tester' }
};
// Generic chain: every await resolves { data: [], error: null }
const genericChain = new Proxy(function () {}, {
  get(t, k) {
    if (k === 'then') return (res) => Promise.resolve({ data: [], error: null }).then(res);
    if (k === 'catch') return () => genericChain;
    if (k === 'finally') return (cb) => { if (cb) cb(); return genericChain; };
    return () => genericChain;
  },
  apply() { return genericChain; },
  set() { return true; }
});
// Table-specific chain (profiles .single() returns a profile row)
function tableChain(table) {
  let single = false;
  const p = new Proxy(function () {}, {
    get(t, k) {
      if (k === 'single' || k === 'maybeSingle') { single = true; return () => p; }
      if (k === 'then') {
        return (res) => Promise.resolve().then(() => {
          if (table === 'profiles') {
            return res({ data: single
              ? { id: FAKE_USER.id, full_name: 'Smoke Tester', role: 'user', vendor_id: null }
              : [{ id: FAKE_USER.id, full_name: 'Smoke Tester', role: 'user', vendor_id: null }], error: null });
          }
          if (single) return res({ data: null, error: null });
          return res({ data: [], error: null });
        });
      }
      if (k === 'catch') return () => p;
      if (k === 'finally') return (cb) => { if (cb) cb(); return p; };
      return () => p;
    },
    apply() { return p; },
    set() { return true; }
  });
  return p;
}
const authStub = {
  getSession: () => Promise.resolve({ data: { session: { user: FAKE_USER, access_token: 'smoke-token' } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
};
const supabaseStub = new Proxy(function () {}, {
  get(t, k) {
    if (k === 'auth') return authStub;
    if (k === 'from') return (table) => tableChain(table);
    if (k === 'then') return (res) => Promise.resolve({ data: [], error: null }).then(res);
    return () => genericChain;
  },
  set() { return true; },
  apply() { return supabaseStub; }
});

globalThis.document = documentStub;
globalThis.window = {
  addEventListener: () => {},
  scrollTo: () => {},
  matchMedia: () => ({ matches: false }),
  AdminHub: null,
  SUPABASE_EDGE_URL: 'https://example.supabase.co'
};
globalThis.localStorage = localStorageStub;
globalThis.location = locationStub;
globalThis.supabase = supabaseStub;
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => '';
globalThis.title = '';
globalThis.navigator = { userAgent: 'smoke' };
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = (cb) => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.IntersectionObserver = class { constructor() {} observe() {} disconnect() {} };
globalThis.ResizeObserver = class { constructor() {} observe() {} disconnect() {} };

try {
  (0, eval)(src); // global-scope eval
} catch (e) {
  console.error('TOP-LEVEL BOOT FAILED:', e.message);
  process.exit(1);
}

let failedCount = 0;

// --- CSS assertions: the Reach Us stylesheet must actually apply ---
// (guards against the earlier regression where the block was nested inside
//  .dropzyy-hero__sub and silently stopped matching anything)
const css = require('fs').readFileSync('assets/css/styles.css', 'utf8');
const reachBlock = (css.match(/DROPZYY HOMEPAGE — "Reach Us"[\s\S]*?(?=\n\/\* ={5,}|$)/) || [''])[0];
const cssChecks = [
  ['Reach Us CSS is top-level (not nested in a hero rule)', /(^|\n)\.dropzyy-reach \{/.test(reachBlock)],
  ['Card grid is fixed 2 columns on desktop', reachBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')],
  ['Grid collapses to 1 column on very narrow screens (300px)', /@media \(max-width: 300px\)[\s\S]*?\.dropzyy-reach__grid \{\s*grid-template-columns: 1fr;/.test(reachBlock)],
  ['Grid stays 2 columns at 720px (mobile)', /@media \(max-width: 720px\)[\s\S]*?\.dropzyy-reach__grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(reachBlock)],
  ['Accordion chevron rotates when open', reachBlock.includes('[open] summary::after')],
  ['Pill buttons applied', reachBlock.includes('border-radius: var(--r-pill)')],
  ['Work With Dropzyy is a separated card', /\.dropzyy-work \{[\s\S]*?border: 1px solid var\(--line\)/.test(reachBlock)],
  ['Braces balanced in stylesheet', (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length]
];
// Footer structure (static markup in index.html): 3 columns + balanced base row
const footerHtml = require('fs').readFileSync('assets/html/index.html', 'utf8');
const footerCssChecks = [
  ['Footer has Company column with heading', footerHtml.includes('footer__col') && footerHtml.includes('>Company</h3>')],
  ['Footer has Support column with heading', footerHtml.includes('>Support</h3>')],
  ['Company column: vendors/browse/rider links', /aria-label="Company"[\s\S]*?#\/vendors[\s\S]*?#\/browse[\s\S]*?#\/rider\/apply[\s\S]*?<\/nav>/.test(footerHtml)],
  ['Support column: orders/faqs/report links', /aria-label="Support"[\s\S]*?#\/orders[\s\S]*?#\/faqs[\s\S]*?#\/report[\s\S]*?<\/nav>/.test(footerHtml)],
  ['Footer base: copyright / email / credit', footerHtml.includes('id="year"') && footerHtml.includes('id="footerEmail"') && footerHtml.includes('Designed &amp; built by Alabi Fopefoluwa')],
  ['Footer CSS: 3-column grid on desktop', /\.footer__inner \{[\s\S]*?grid-template-columns: 1\.3fr 1fr 1fr/.test(css)],
  ['Footer base row is 1fr/auto/1fr grid', /\.footer__base \{[\s\S]*?grid-template-columns: 1fr auto 1fr/.test(css)],
  ['Footer base row has top border separator', /\.footer__base \{[\s\S]*?border-top: 1px solid var\(--line\)/.test(css)],
  ['Footer base row stacks centered on mobile', /@media \(max-width: 700px\)[\s\S]*?\.footer__base \{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?justify-items: center/.test(css)]
];
for (const [name, ok] of footerCssChecks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' — CSS: ' + name);
  if (!ok) failedCount++;
}
for (const [name, ok] of cssChecks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' — CSS: ' + name);
  if (!ok) failedCount++;
}

// Wait for the app's boot-time session restore (getSession → profiles →
// orders load → render) to settle, then exercise the routes.
setTimeout(() => {
// Simulate a hash route change to #/ and render the homepage synchronously.
locationStub.hash = '#/';
Promise.resolve(eval('render()')).then(() => {
  const homeView = lastView;
  const checks = [
    ['Reach Us section rendered', homeView.includes('dropzyy-reach')],
    ['FAQs card links #/faqs (dedicated page)', homeView.includes('href="#/faqs"')],
    ['No inline FAQ accordion left on homepage', !homeView.includes('dropzyy-faq__item')],
    ['Work With Dropzyy rendered', homeView.includes('dropzyy-work')],
    ['WhatsApp card', homeView.includes('Join Our WhatsApp Channel')],
    ['Email card', homeView.includes('Send us an Email') && homeView.includes('mailto:')],
    ['Report card links #/report', homeView.includes('href="#/report"')],
    ['Become a Vendor links #/vendor/apply', homeView.includes('href="#/vendor/apply"')],
    ['Become a Rider links #/rider/apply', homeView.includes('href="#/rider/apply"')],
    ['WhatsApp opens target=_blank', homeView.includes('target="_blank"')]
  ];
  for (const [name, ok] of checks) {
    console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
    if (!ok) failedCount++;
  }
  // Then render the #/report route (Report an Issue form, signed-in user).
  locationStub.hash = '#/report';
  return Promise.resolve(eval('render()')).then(() => {
    const reportView = lastView;
    const reportChecks = [
      ['Report route rendered form', reportView.includes('Report an Issue') && reportView.includes('reportForm')],
      ['Subject dropdown present', reportView.includes('reportSubject')],
      ['Description textarea present', reportView.includes('<textarea')],
      ['Submit button present', reportView.toLowerCase().includes('submit')],
      ['Sign-in gate NOT shown (user hydrated)', !reportView.includes('sign in to continue') || reportView.includes('reportForm')]
    ];
    for (const [name, ok] of reportChecks) {
      console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
      if (!ok) failedCount++;
    }
    // #/report-issue alias must render the same report form.
    locationStub.hash = '#/report-issue';
    return Promise.resolve(eval('render()')).then(() => {
      const aliasView = lastView;
      const aliasChecks = [
        ['#/report-issue alias renders report form', aliasView.includes('reportForm') && aliasView.includes('Report an Issue')]
      ];
      for (const [name, ok] of aliasChecks) {
        console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
        if (!ok) failedCount++;
      }
      // Then the dedicated #/faqs page (public, full accordion).
      locationStub.hash = '#/faqs';
      return Promise.resolve(eval('render()')).then(() => {
        const faqPage = lastView;
        const faqChecks = [
          ['#/faqs page rendered', faqPage.includes('Frequently asked questions')],
          ['FAQ accordion items present', faqPage.includes('dropzyy-faq__item') && faqPage.includes('<details')],
          ['FAQ page links to #/report', faqPage.includes('href="#/report"')],
          ['FAQ page links back home', faqPage.includes('href="#/"')]
        ];
        for (const [name, ok] of faqChecks) {
          console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
          if (!ok) failedCount++;
        }
        // Then the dedicated #/vendor/apply page (structured vendor intake).
        locationStub.hash = '#/vendor/apply';
        return Promise.resolve(eval('render()')).then(() => {
          const vendorApply = lastView;
          const vendorApplyChecks = [
            ['#/vendor/apply renders Become a Vendor page', vendorApply.includes('Become a Vendor')],
            ['Vendor form renders (vendorApplyForm)', vendorApply.includes('vendorApplyForm')],
            ['Matric number field present', vendorApply.includes('matric_number')],
            ['College field present', vendorApply.includes('college')],
            ['Department field present', vendorApply.includes('department')],
            ['What they want to sell field present', vendorApply.includes('what_they_want_to_sell')],
            ['Expected price range field present', vendorApply.includes('expected_price_range')],
            ['Vendor form has submit button', vendorApply.includes('vaSubmitBtn')]
          ];
          for (const [name, ok] of vendorApplyChecks) {
            console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
            if (!ok) failedCount++;
          }
          // Then the #/rider/apply page (extended student-identification form).
          locationStub.hash = '#/rider/apply';
          return Promise.resolve(eval('render()')).then(() => {
            const riderApply = lastView;
            const riderApplyChecks = [
              ['#/rider/apply renders rider form', riderApply.includes('riderForm')],
              ['Rider form has full_name field', riderApply.includes('name="full_name"')],
              ['Rider form has matric field', riderApply.includes('studentId')],
              ['Rider form has college field', riderApply.includes('name="college"')],
              ['Rider form has department field', riderApply.includes('name="department"')],
              ['Rider form has email field', riderApply.includes('name="email"')],
              ['Rider form has phone field', riderApply.includes('name="phone"')]
            ];
            for (const [name, ok] of riderApplyChecks) {
              console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
              if (!ok) failedCount++;
            }
            process.exit(failedCount ? 2 : 0);
          });
        });
      });
    });
  });
}).catch(e => { console.error('RENDER FAILED:', e.message); process.exit(1); });
}, 200);