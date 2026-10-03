const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/js/app.js');
const hosting = read('netlify.toml');
const init = read('supabase/functions/paystack-initialize/index.ts');
const deliveryInit = read('supabase/functions/paystack-initialize-delivery/index.ts');
const http = read('supabase/functions/_shared/http.ts');
assert.match(app, /if \(!initialAuthReady\)/);
assert.match(app, /initialAuthReady = result.ready/);
assert.match(app, /if \(!canAccessPasswordRecovery\(\)\)/);
assert.match(app, /authLifecycle.updatePassword\(password\)/);
assert.equal((app.match(/select\('full_name, role, vendor_id(?:, account_status)?'\)/g) || []).length, 2, 'one profile loader plus missing-row refetch');
assert.match(app, /authLifecycle.receive\(event, session\)/);
assert.match(app, /ticket !== authLifecycle.generation/);
assert.match(app, /state !== currentAppState\(\)/);
assert.ok(!app.includes("toast('Email confirmed. Please sign in.'"));
assert.match(hosting, /from = "\/\*"[\s\S]*?status = 200/);
assert.match(hosting, /publish = "dist"/);
assert.match(read('DEPLOYMENT.md'), /B4 browser verification/);
assert.ok(!/sb_secret_[A-Za-z0-9]{10,}|sk_(?:live|test)_[A-Za-z0-9]{10,}/.test(read('assets/js/config.js')));
const createLifecycle = require('../assets/js/auth-lifecycle.js');
async function lifecycleTests() {
  const { resolveTrustedCallbackUrl } = await import(pathToFileURL(path.join(root, 'supabase/functions/_shared/callback.mjs')).href);
  const resolve = (configuredCallback, requestOrigin, allowedOrigins, requiredPath, environment) =>
    resolveTrustedCallbackUrl({ configuredCallback, requestOrigin, allowedOrigins, requiredPath, environment });
  const productionOrigins = ['https://dropzyy.com', 'https://www.dropzyy.com'];
  const stagingOrigin = 'https://stage.example.test';
  const localOrigin = 'http://127.0.0.1:5500';

  assert.equal(new URL(resolve('https://dropzyy.com/orders', 'https://dropzyy.com', productionOrigins, '/orders', 'production')).pathname, '/orders');
  assert.equal(new URL(resolve('https://dropzyy.com/orders', 'https://www.dropzyy.com', productionOrigins, '/orders', 'production')).origin, 'https://dropzyy.com');
  assert.equal(new URL(resolve(`${stagingOrigin}/orders`, stagingOrigin, [stagingOrigin], '/orders', 'staging')).origin, stagingOrigin);
  assert.equal(new URL(resolve(`${localOrigin}/orders`, localOrigin, [localOrigin], '/orders', 'development')).origin, localOrigin);
  assert.equal(new URL(resolve(`${stagingOrigin}/vendor`, stagingOrigin, [stagingOrigin], '/vendor', 'staging')).pathname, '/vendor');
  assert.throws(() => resolve(`${stagingOrigin}/orders`, stagingOrigin, [stagingOrigin], '/orders', ''), /configuration is invalid/);
  assert.throws(() => resolve('', stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('not a URL', stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${stagingOrigin}/orders`, stagingOrigin, [], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('https://unrelated.example/orders', stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('https://dropzyy.com/orders', stagingOrigin, [stagingOrigin, ...productionOrigins], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${stagingOrigin}/orders`, 'https://attacker.example', [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${stagingOrigin}/orders`, '', [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('http://stage.example.test/orders', stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('ftp://stage.example.test/orders', stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${stagingOrigin}/orders?next=https://dropzyy.com`, stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${stagingOrigin}/vendor`, stagingOrigin, [stagingOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve('https://dropzyy.com/orders', 'https://dropzyy.com', productionOrigins, '/orders', 'staging'), /configuration is invalid/);
  assert.throws(() => resolve(`${localOrigin}/orders`, localOrigin, [localOrigin], '/orders', 'staging'), /configuration is invalid/);
  assert.match(http, /Deno\.env\.get\("ALLOWED_ORIGIN"\)\s*\?\?\s*""/);
  assert.ok(!/https:\/\/(?:www\.)?dropzyy\.com|127\.0\.0\.1:5500/.test(http), 'shared CORS has no implicit production/local allowlist');
  for (const [source, route, label] of [[init, '/orders', 'product/replacement'], [deliveryInit, '/vendor', 'vendor delivery']]) {
    assert.match(source, /import\s*\{\s*resolveTrustedCallbackUrl\s*\}\s*from\s*["']\.\.\/_shared\/callback\.mjs/);
    assert.match(source, /Deno\.env\.get\("PAYSTACK_CALLBACK_URL"\)\s*\?\?\s*""/);
    assert.match(source, /Deno\.env\.get\("DROPZYY_ENVIRONMENT"\)\s*\?\?\s*""/);
    assert.match(source, new RegExp(`requiredPath:\\s*["']${route}["']`));
    assert.ok(!/https:\/\/(?:www\.)?dropzyy\.com\//.test(source), `${label} has no production callback fallback`);
    assert.ok(!/body\.(?:callback_url|callback|return_url|redirect_url|origin)\b/.test(source), `${label} does not trust client callback fields`);
    assert.match(source, /callback_url:\s*callbackUrl/);
  }
  assert.ok(init.indexOf('callbackUrl = resolveCallbackUrl') < init.indexOf('create_replacement_payment_obligation'), 'callback config is checked before replacement obligation mutation');
  assert.ok(deliveryInit.indexOf('callbackUrl = resolveCallbackUrl') < deliveryInit.indexOf('consume_rate_limit'), 'delivery callback config is checked before rate-limit/payment writes');
  assert.ok(deliveryInit.indexOf('callbackUrl = resolveCallbackUrl') < deliveryInit.indexOf('create_vendor_delivery_payment'), 'delivery callback config is checked before payment record creation');
  assert.ok(init.indexOf('callbackUrl = resolveCallbackUrl') < init.indexOf('https://api.paystack.co/transaction/initialize'));
  assert.ok(deliveryInit.indexOf('callbackUrl = resolveCallbackUrl') < deliveryInit.indexOf('https://api.paystack.co/transaction/initialize'));
  let time = 1800000000000, active, fetches = 0, updates = 0, deny = false, clearCount = 0;
  const items = new Map();
  const storage = { getItem: k => items.get(k) || null, setItem: (k, v) => items.set(k, v), removeItem: k => items.delete(k) };
  const session = (id, sid = id) => ({ user: { id }, expires_at: time / 1000 + 3600,
    access_token: 'x.' + Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url') + '.x' });
  const auth = {
    getSession: async () => ({ data: { session: active } }),
    getUser: async () => ({ data: { user: deny ? null : active?.user }, error: deny ? new Error('expired') : null }),
    updateUser: async () => { updates++; return { data: {}, error: null }; }
  };
  let latest;
  const options = { auth, storage, now: () => time,
    fetchProfile: async s => { fetches++; return { id: s.user.id, role: 'user' }; },
    clearPrivate: () => { clearCount++; }, publish: value => { latest = value; } };
  let lifecycle = createLifecycle(options);
  active = session('a');
  await lifecycle.receive('INITIAL_SESSION', active);
  assert.equal(latest.profile.id, 'a');
  const refreshedRole = createLifecycle({ ...options, fetchProfile: async () => ({ id: 'a', role: 'vendor' }) });
  await refreshedRole.receive('SIGNED_IN', active);
  assert.equal(latest.profile.role, 'vendor', 'sign-in resolves fresh database role');
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'manual route with normal session is insufficient');
  const count = fetches;
  await lifecycle.receive('TOKEN_REFRESHED', { ...active });
  assert.equal(fetches, count, 'token refresh does not load profile');
  await lifecycle.receive('MFA_CHALLENGE_VERIFIED', { ...active });
  assert.equal(fetches, count, 'MFA session update does not reset customer UI');
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), true);
  const marker = [...items.values()][0];
  lifecycle = createLifecycle(options); // Simulate browser refresh, keeping only sessionStorage and SDK session.
  await lifecycle.receive('INITIAL_SESSION', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), true, 'valid recovery survives refresh');
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  assert.equal([...items.values()][0], marker, 'event replay cannot extend deadline');
  lifecycle = createLifecycle(options);
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  assert.equal([...items.values()][0], marker, 'replay after refresh cannot extend stored deadline');
  await lifecycle.updatePassword('not-persisted');
  assert.equal(updates, 1);
  assert.equal(items.size, 0);
  await lifecycle.receive('USER_UPDATED', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'password update does not reopen recovery');
  await assert.rejects(lifecycle.updatePassword('not-persisted'));
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  deny = true;
  lifecycle = createLifecycle(options);
  await lifecycle.receive('INITIAL_SESSION', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'Auth server rejection overrides marker');
  deny = false;
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  time += 16 * 60 * 1000;
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'intent expires');
  await assert.rejects(lifecycle.updatePassword('not-persisted'));
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  active = session('b');
  await lifecycle.receive('SIGNED_IN', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'another user cannot inherit intent');
  await lifecycle.receive('PASSWORD_RECOVERY', active);
  active = session('b', 'new-session');
  await lifecycle.receive('SIGNED_IN', active);
  assert.equal(lifecycle.canAccessPasswordRecovery(), false, 'same user, different session cannot inherit intent');
  await lifecycle.receive('SIGNED_OUT', null);
  assert.equal(latest.profile, null);
  assert.equal(items.size, 0);
  assert.ok(clearCount > 0);
  // Late old-user profile requests must not publish across logout/new login.
  let release;
  lifecycle = createLifecycle({ ...options, fetchProfile: s => s.user.id === 'slow'
    ? new Promise(resolve => { release = resolve; }) : options.fetchProfile(s) });
  active = session('slow');
  const stale = lifecycle.receive('SIGNED_IN', active);
  await new Promise(resolve => setTimeout(resolve, 5));
  await lifecycle.receive('SIGNED_OUT', null);
  active = session('new');
  await lifecycle.receive('SIGNED_IN', active);
  release({ id: 'slow', role: 'admin' }); await stale;
  assert.equal(latest.profile.id, 'new');
  lifecycle = createLifecycle({ ...options, fetchProfile: async () => { throw new Error('offline'); } });
  await lifecycle.receive('INITIAL_SESSION', active);
  assert.equal(latest.ready, true); assert.equal(latest.profile, null); assert.ok(latest.error);
  // INITIAL_SESSION following URL exchange must share the active initialization.
  lifecycle = createLifecycle(options); const before = fetches;
  await Promise.all([lifecycle.receive('PASSWORD_RECOVERY', active), lifecycle.receive('INITIAL_SESSION', active)]);
  assert.equal(fetches, before + 1);
  let releaseUpdate;
  const originalUpdate = auth.updateUser;
  auth.updateUser = () => new Promise(resolve => { releaseUpdate = resolve; });
  const firstUpdate = lifecycle.updatePassword('not-persisted');
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(lifecycle.updatePassword('not-persisted'), /already in progress/);
  releaseUpdate({ error: null }); await firstUpdate;
  auth.updateUser = originalUpdate;
  assert.equal(lifecycle.canAccessPasswordRecovery(), false);

  // Execute the real app callback handler with mocked Edge/database boundaries.
  // No payment operation is performed: verifyPaymentWithPaystack is a stub.
  const callbackCode = app.slice(app.indexOf('async function handlePaystackReturn()'), app.indexOf('// While a customer is on a pending Payment page'));
  let callbackState = { user: null, orders: [] }, verifications = 0;
  const location = { search: '?reference=test-ref&order_id=00000000-0000-0000-0000-000000000000', pathname: '/orders', hash: '#/orders' };
  const callbackScope = {
    URLSearchParams, location, currentAppState: () => callbackState,
    history: { replaceState(_a, _b, destination) {
      const parsed = new URL(destination, 'https://dropzyy.com');
      location.search = parsed.search; location.hash = parsed.hash;
    } },
    render() {}, toast() {},
    verifyPaymentWithPaystack: async () => { verifications++; },
    loadOrdersFromSupabase: async () => {}, ensureVendorLoaded: async () => {},
    supabase: { from() { return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { status: 'success' }, error: null }) }; } }
  };
  vm.createContext(callbackScope); vm.runInContext(callbackCode, callbackScope);
  await callbackScope.handlePaystackReturn();
  assert.equal(verifications, 0, 'signed-out callback must wait');
  assert.ok(location.search.includes('reference'), 'callback retained through login');
  callbackState = { user: { id: 'owner' }, orders: [] };
  await Promise.all([callbackScope.handlePaystackReturn(), callbackScope.handlePaystackReturn()]);
  assert.equal(verifications, 1, 'duplicate auth completion cannot verify twice');
  assert.equal(location.search, '', 'consumed callback is cleaned');
  const privateClearCode = app.slice(app.indexOf('function clearPrivateAuthState()'), app.indexOf('async function syncAuthenticatedUser('));
  const oldState = { user: { id: 'a', role: 'admin' }, orders: ['private-a'], notifications: ['private-a'], cart: ['public-cart'], catalog: [] };
  const cleanupScope = { state: oldState, initialPrivateState: { orders: [], notifications: [] }, structuredClone,
    riderLoadPromises: new Map(), ordersLoadPromises: new Map(),
    invalidateMaintenanceGate() {}, resetVendorSessionState() {}, clearRiderOrdersSubscription() {}, clearTrackSubscription() {},
    window: {}, save() {} };
  vm.createContext(cleanupScope); vm.runInContext(privateClearCode, cleanupScope);
  cleanupScope.clearPrivateAuthState();
  oldState.orders.push('late-private-response');
  assert.equal(cleanupScope.state.user, null);
  assert.equal(cleanupScope.state.orders.length, 0, 'late writes cannot repopulate detached private state');
  assert.equal(cleanupScope.state.notifications.length, 0);
  assert.equal(cleanupScope.state.cart[0], 'public-cart', 'harmless cart preserved');
  const resetViewCode = app.slice(app.indexOf('function passwordReset()'), app.indexOf('\n}', app.indexOf('function passwordReset()')) + 2);
  const resetScope = { canAccessPasswordRecovery: () => false };
  vm.createContext(resetScope); vm.runInContext(resetViewCode, resetScope);
  assert.match(resetScope.passwordReset(), /Reset link required/);
  resetScope.canAccessPasswordRecovery = () => true;
  assert.match(resetScope.passwordReset(), /passwordResetForm/);
  // Configuration rejects unknown deploy-preview/staging origins before createClient.
  for (const origin of ['https://dropzyy.com', 'https://preview.example.test', 'http://localhost:5500']) {
    let calls = 0;
    const context = { window: { location: { origin } }, document: { addEventListener() {} }, supabase: { createClient() { calls++; return {}; } } };
    if (origin === 'https://dropzyy.com') vm.runInNewContext(read('assets/js/config.js'), context);
    else assert.throws(() => vm.runInNewContext(read('assets/js/config.js'), context), /not configured/);
    assert.equal(calls, origin === 'https://dropzyy.com' ? 1 : 0);
  }
  console.log('B4 lifecycle, recovery refresh, race, callback and environment checks passed; browser cases NOT RUN.');
}
lifecycleTests().catch(error => { console.error(error); process.exitCode = 1; });
