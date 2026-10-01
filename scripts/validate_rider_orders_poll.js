// ============================================================
// validate_rider_orders_poll.js
// ============================================================
// Regression guard for the rider orders sync lifecycle in app.js.
//
// WHY THIS EXISTS
//   The "broad refresh -> targeted refresh" refactor deleted the
//   stopRiderOrdersPoll() definition while keeping its call sites.
//   clearPrivateAuthState() -> clearRiderOrdersSubscription() ->
//   stopRiderOrdersPoll() therefore threw ReferenceError during auth
//   bootstrap, left initialAuthReady=false, and the login form never painted.
//
//   (1) proves the helper is defined exactly once, next to its callers, and
//   (2) exercises the real functions in a vm sandbox so cleanup, realtime and
//   poll paths are covered without a browser.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const createAuthLifecycle = require('../assets/js/auth-lifecycle.js');

// ---- 1. Structural: exactly one definition + the intended call sites. ----
assert.equal((app.match(/function stopRiderOrdersPoll\b/g) || []).length, 1,
  'stopRiderOrdersPoll must be defined exactly once');
const stopCalls = (app.match(/stopRiderOrdersPoll\(\)/g) || []).length;
assert.equal(stopCalls, 5, 'definition + four call sites expected, found ' + stopCalls);
for (const name of ['startRiderOrdersPoll', 'pollRiderActiveOrders', 'subscribeRiderOrdersRealtime',
  'clearRiderOrdersSubscription', 'patchOrderInState', 'fetchOrderFromSupabase',
  'updateOrderInState', 'removeOrderFromRiderPool', 'upsertRiderPoolOrder']) {
  assert.match(app, new RegExp('(?:async )?function ' + name + '\\('), name + ' must be defined');
}
assert.match(app, /riderOrdersRealtimeConnected = true;[\s\S]{0,120}stopRiderOrdersPoll\(\)/,
  'realtime SUBSCRIBED must stop the poll');
assert.match(app, /!location\.hash\.startsWith\('#\/rider'\)[\s\S]{0,120}stopRiderOrdersPoll\(\)/,
  'leaving #/rider must stop the poll');

// ---- 2. Behavioral: run the real rider-poll code in a vm sandbox. ----
const riderPollCode = app.slice(
  app.indexOf('let riderOrdersChannel = null;'),
  app.indexOf('function clearTrackSubscription()')
) + `
globalThis.__riderProbe = {
  timer: () => riderOrdersPollTimer,
  setTimer: v => { riderOrdersPollTimer = v; },
  connected: () => riderOrdersRealtimeConnected,
  setConnected: v => { riderOrdersRealtimeConnected = v; }
};`;

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Fresh sandbox: recording interval/clearInterval and a fake Supabase client
// whose realtime status callback can be triggered by hand.
function makeRiderSandbox() {
  const intervals = new Map();
  const cleared = [];
  let nextId = 1;
  const handlers = {};
  const state = { rider: { id: 'r1' }, orders: [], riderPool: [] };
  const channel = { on() { return channel; }, subscribe(cb) { handlers.status = cb; return channel; } };
  const context = {
    console,
    currentAppState: () => state,
    location: { hash: '#/rider' },
    render: () => {},
    setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
    clearInterval(id) { cleared.push(id); intervals.delete(id); },
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'r1' } } } }) },
      channel: () => channel,
      removeChannel: () => Promise.resolve()
    }
  };
  vm.createContext(context);
  vm.runInContext(riderPollCode, context);
  return { context, intervals, cleared, handlers };
}

async function main() {
  // 1. cleanup with no poll must not throw and must leave no timer.
  {
    const { context } = makeRiderSandbox();
    assert.doesNotThrow(() => context.clearRiderOrdersSubscription());
    assert.equal(context.__riderProbe.timer(), null, 'no timer after cleanup with no poll');
  }

  // 2. cleanup clears an active poll.
  {
    const { context, cleared } = makeRiderSandbox();
    context.startRiderOrdersPoll();
    const id = context.__riderProbe.timer();
    assert.ok(id, 'poll started');
    context.clearRiderOrdersSubscription();
    assert.equal(context.__riderProbe.timer(), null, 'active poll cleared');
    assert.ok(cleared.includes(id), 'clearInterval reached the active timer');
  }

  // 3. stopRiderOrdersPoll is idempotent.
  {
    const { context } = makeRiderSandbox();
    context.startRiderOrdersPoll();
    assert.doesNotThrow(() => { context.stopRiderOrdersPoll(); context.stopRiderOrdersPoll(); });
    assert.equal(context.__riderProbe.timer(), null);
  }

  // 7. realtime SUBSCRIBED stops polling.
  {
    const { context, handlers } = makeRiderSandbox();
    context.startRiderOrdersPoll();
    await context.subscribeRiderOrdersRealtime();
    await tick();
    handlers.status('SUBSCRIBED');
    assert.equal(context.__riderProbe.connected(), true);
    assert.equal(context.__riderProbe.timer(), null, 'SUBSCRIBED stops the poll');
  }

  // 8. leaving #/rider stops polling safely (the interval callback exits).
  {
    const { context, intervals } = makeRiderSandbox();
    context.location.hash = '#/browse';
    context.startRiderOrdersPoll();
    const fn = intervals.get(context.__riderProbe.timer());
    await fn();
    assert.equal(context.__riderProbe.timer(), null, 'poll stops once #/rider is left');
  }

  // 9. a realtime failure restarts polling afterwards.
  {
    const { context, handlers } = makeRiderSandbox();
    await context.subscribeRiderOrdersRealtime();
    await tick();
    handlers.status('CHANNEL_ERROR');
    assert.equal(context.__riderProbe.connected(), false);
    assert.ok(context.__riderProbe.timer(), 'poll restarted after realtime failure');
  }

  // 4. INITIAL_SESSION(null) flows through the REAL cleanup without throwing,
  //    and still resolves the lifecycle to the unauthenticated ready state.
  {
    const published = [];
    const { context: rider } = makeRiderSandbox();
    const lifecycle = createAuthLifecycle({
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      fetchProfile: async () => { throw new Error('no profile fetch for a null session'); },
      clearPrivate: () => rider.clearRiderOrdersSubscription(),
      publish: result => published.push(result)
    });
    await assert.doesNotReject(() => lifecycle.receive('INITIAL_SESSION', null));
    assert.equal(lifecycle.ready, true, 'lifecycle ready after null INITIAL_SESSION');
    assert.equal(lifecycle.bootstrapComplete, true);
    assert.equal(published.at(-1).ready, true);
  }

  // 5. bootstrapAuth() reaches ready=true for logged-out users.
  {
    const published = [];
    const { context: rider } = makeRiderSandbox();
    const lifecycle = createAuthLifecycle({
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      fetchProfile: async () => { throw new Error('no profile fetch for a null session'); },
      clearPrivate: () => rider.clearRiderOrdersSubscription(),
      publish: result => published.push(result)
    });
    const bootstrapCode = app.slice(
      app.indexOf('async function bootstrapAuth()'),
      app.indexOf('void bootstrapAuth();')
    );
    const scope = {
      console,
      supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
      authLifecycle: lifecycle
    };
    vm.createContext(scope);
    vm.runInContext(bootstrapCode, scope);
    await scope.bootstrapAuth();
    assert.equal(published.at(-1).ready, true, 'bootstrapAuth reaches ready=true for logged-out users');
    assert.equal(lifecycle.ready, true);
  }

  // 6. The login view renders the form, and render() maps #/login to it once ready.
  {
    const loginView = vm.runInNewContext(
      app.slice(app.indexOf('function auth(kind)'), app.indexOf('function passwordReset()')) + '; auth',
      {}
    );
    assert.match(loginView('login'), /id="authForm"/, 'login form renders');
    assert.match(loginView('login'), /Sign in/);
    assert.match(app, /if \(isLoginRoute && !state\.user\)[\s\S]{0,140}auth\('login'\)/,
      'render() paints the login form once bootstrap is ready');
  }

  console.log('PASS rider orders poll: definition + call sites intact; cleanup, realtime and poll paths safe; logged-out bootstrap reaches ready.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });