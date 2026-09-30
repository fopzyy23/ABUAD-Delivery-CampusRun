// ============================================
// Dropzyy Admin Panel
// ============================================
// This module provides the full admin system (Supabase auth, catalog
// management, orders, riders). It is loaded on BOTH index.html (unified)
// and admin.html (legacy redirect). To avoid global variable collisions
// with app.js (both declare $, money, store, state, etc.), this entire
// module is wrapped in an IIFE. The public API is exposed via window.AdminHub.

(function () {

// State management
let state = {
  isAuthenticated: false,
  catalog: null,
  orders: [],
  ordersLoading: false,
  ordersError: null,
  riders: [],
  riderMetrics: {},
  users: [],
  withdrawals: [],
  withdrawalsLoading: false,
  withdrawalsError: null,
  refunds: [],
  payments: [],
  paymentsLoading: false,
  paymentsError: null,
  refundsLoading: false,
  refundsError: null,
  settlements: [],
  bonuses: [],
  transfers: [],
  settlementsLoading: false,
  settlementsError: null,
  reports: [],
  reportsLoading: false,
  reportsError: null,
  ratings: [],
  ratingsLoading: false,
  ratingsError: null,
  notifications: [],
  notificationsLoading: false,
  notificationsError: null,
  auditLogs: [], auditLogsLoading: false, auditLogsError: null,
  adminUsers: [], adminUsersLoading: false, adminUsersError: null,
  vendorApplications: [],
  vendorApplicationsLoading: false,
  vendorApplicationsError: null,
  siteSettings: null,
  siteSettingsLoading: false,
  siteSettingsError: null,
  cancellations: [],
  cancellationsLoading: false,
  cancellationsError: null,
  automaticCutoffClaims: [],
  automaticCutoffClaimsLoading: false,
  automaticCutoffClaimsError: null
  ,mfa: { factors: [], aal: null, enrollment: null, challenge: null, factorId: null, challengeRequired: false, loading: false, error: null }
};

// Order filtering state (presentational only — the full order set is always
// fetched fresh from Supabase, so there are never phantom/stale localStorage
// orders influencing the statistics or the order list.)
let orderFilter = {
  status: 'all',
  dateFrom: '',
  dateTo: ''
};

// Canonical set of order status values used in the status update dropdown.
const ORDER_STATUS_OPTIONS = ['Order confirmed', 'Preparing', 'Ready for pickup', 'Rider assigned', 'Picked up', 'On the Way', 'Delivered', 'Rated', 'Cancelled'];

// Order status saves currently in flight — guards against duplicate
// submissions from rapid select changes / double Save clicks (F11).
const orderStatusSaving = new Set();

// Statuses that represent a terminal, completed order (no longer active).
const COMPLETED_STATUSES = ['Delivered', 'Rated'];
// Status that represents a cancelled order.
const CANCELLED_STATUS = 'Cancelled';

// Supabase authentication tracking
let supabaseAdminUser = null;
let lastVendorSyncError = null;
const initialAdminState = structuredClone(state);
function currentAdminState() { return state; }
function clearAuthState() {
  state = structuredClone(initialAdminState);
  supabaseAdminUser = null;
  orderStatusSaving.clear();
}
if (supabaseAvailable()) supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || (session?.user && supabaseAdminUser && session.user.id !== supabaseAdminUser.id)) {
    clearAuthState();
    setTimeout(() => {
      if (document.querySelector('[data-admin-nav]') || /admin/.test(location.pathname + location.hash)) {
        if (session?.user) void init();
        else renderLogin();
      }
    }, 0);
  } else if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
    setTimeout(() => {
      if (/admin/.test(location.pathname + location.hash)) void init();
    }, 0);
  } else if (event === 'MFA_CHALLENGE_VERIFIED') {
    // The challenge/enrollment submitter already owns navigation and init().
    setTimeout(() => { void refreshAdminMfa(); }, 0);
  }
});

function adminMfaMessage(message) {
  const text = String(message || '');
  return /aal2|mfa|multi-factor|assurance/i.test(text)
    ? 'Complete or enroll Supabase MFA, then retry this admin action.'
    : text;
}

function jwtPayloadMetadata(accessToken) {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=')));
  } catch { return {}; }
}

async function logAdminMfaSessionMetadata(stage) {
  const state = currentAdminState();
  const [{ data: aal }, { data: { session } }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.getSession()
  ]);
  const jwt = session?.access_token ? jwtPayloadMetadata(session.access_token) : {};
  console.info('Admin MFA session metadata:', {
    stage,
    currentLevel: aal?.currentLevel || null,
    nextLevel: aal?.nextLevel || null,
    sessionExists: Boolean(session),
    userId: session?.user?.id || null,
    jwtAal: jwt.aal || null,
    jwtSessionId: jwt.session_id || null
  });
  return { aal, session, jwt };
}

async function ensureAdminAal2() {
  const state = currentAdminState();
  if (!supabaseAvailable() || !state.isAuthenticated) return false;
  let { aal, session, jwt } = await logAdminMfaSessionMetadata('before-admin-write');
  if (aal?.currentLevel !== 'aal2' || jwt.aal !== 'aal2') {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
    ({ aal, session, jwt } = await logAdminMfaSessionMetadata('after-admin-write-refresh'));
  }
  return Boolean(session && aal?.currentLevel === 'aal2' && jwt.aal === 'aal2');
}

async function refreshAdminMfa() {
  const state = currentAdminState();
  if (!supabaseAvailable() || !supabaseAdminUser || !state.isAuthenticated) return;
  state.mfa.loading = true;
  try {
    const [{ data: factors, error: factorError }, { data: aal, error: aalError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (factorError) throw factorError;
    if (aalError) throw aalError;
    state.mfa.factors = (factors?.all || []).filter(f => f.factor_type === 'totp');
    state.mfa.aal = aal || null;
    state.mfa.error = null;
  } catch (err) {
    state.mfa.error = err.message || 'Could not load MFA status.';
    console.error('Admin MFA status failed:', err);
  } finally {
    state.mfa.loading = false;
  }
}

async function prepareAdminMfaChallenge() {
  const state = currentAdminState();
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw aalError;
  state.mfa.aal = aal || null;
  if (aal?.currentLevel !== 'aal1' || aal?.nextLevel !== 'aal2') {
    state.mfa.challengeRequired = false;
    return false;
  }
  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  if (factorError) throw factorError;
  const verified = (factors?.all || []).filter(f => f.factor_type === 'totp' && f.status === 'verified');
  if (!verified.length) return false;
  state.mfa.factors = verified;
  state.mfa.factorId = verified[0].id;
  state.mfa.challengeRequired = true;
  state.mfa.error = null;
  return true;
}

async function verifyAdminMfaChallenge(form) {
  const state = currentAdminState();
  const code = String(new FormData(form).get('code') || '').trim();
  if (!/^\d{6}$/.test(code) || !state.mfa.factorId) { toast('Enter the 6-digit authenticator code.', 'error'); return; }
  state.mfa.loading = true; state.mfa.error = null; renderAdminMfaChallenge();
  try {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: state.mfa.factorId });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: state.mfa.factorId, challengeId: challenge.id, code });
    if (verifyError) throw verifyError;
    let { aal, session, jwt } = await logAdminMfaSessionMetadata('after-mfa-verify');
    if (aal?.currentLevel !== 'aal2' || jwt.aal !== 'aal2') {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      ({ aal, session, jwt } = await logAdminMfaSessionMetadata('after-mfa-refresh'));
    }
    state.mfa.aal = aal;
    if (aal?.currentLevel !== 'aal2' || jwt.aal !== 'aal2') throw new Error('MFA verification did not promote the active session JWT to AAL2. Please try again.');
    state.mfa.challengeRequired = false; state.mfa.factorId = null; state.mfa.loading = false;
    await init();
  } catch (err) {
    state.mfa.loading = false; state.mfa.error = adminMfaMessage(err.message || 'MFA verification failed.');
    console.error('Admin MFA challenge failed:', err);
    renderAdminMfaChallenge();
  }
}

function renderAdminMfaChallenge() {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = `<section class="section container"><div class="auth-wrap" style="max-width:480px"><div class="card"><h1>Admin verification</h1><p class="muted">Enter the 6-digit code from your authenticator app.</p>${state.mfa.error ? `<p class="text-danger">${escHtml(state.mfa.error)}</p>` : ''}<form id="adminMfaChallengeForm" class="stack"><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit code" required ${state.mfa.loading ? 'disabled' : ''}><button class="btn" type="submit" ${state.mfa.loading ? 'disabled' : ''}>${state.mfa.loading ? 'Verifying…' : 'Verify'}</button></form><p class="muted small mt-1">Your admin workspace remains locked until this session reaches AAL2.</p></div></div></section>`;
  $('#adminMfaChallengeForm')?.addEventListener('submit', event => { event.preventDefault(); verifyAdminMfaChallenge(event.target); });
}

async function beginAdminMfaEnrollment() {
  const state = currentAdminState();
  const verified = state.mfa.factors.find(f => f.status === 'verified');
  if (verified) { toast('An authenticator is already enrolled.', 'info'); return; }
  const pending = state.mfa.factors.find(f => f.status !== 'verified');
  if (pending) { toast('An MFA enrollment is already pending. Complete it in Supabase Auth before starting another.', 'info'); return; }
  try {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Dropzyy Admin' });
    if (error) throw error;
    state.mfa.enrollment = data;
    renderAdminWorkspace();
  } catch (err) {
    console.error('Admin MFA enrollment failed:', err);
    toast(adminMfaMessage(err.message || 'Could not start MFA enrollment.'), 'error');
  }
}

async function verifyAdminMfaEnrollment(form) {
  const state = currentAdminState();
  const code = String(new FormData(form).get('code') || '').trim();
  const enrollment = state.mfa.enrollment;
  if (!/^\d{6}$/.test(code) || !enrollment?.id) { toast('Enter the 6-digit authenticator code.', 'error'); return; }
  try {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });
    if (verifyError) throw verifyError;
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal.currentLevel !== 'aal2') throw new Error('MFA verification succeeded, but this session is still AAL1. Refresh and try again.');
    state.mfa.enrollment = null;
    await refreshAdminMfa();
    toast('MFA setup complete — this admin session is AAL2.');
    renderAdminWorkspace();
  } catch (err) {
    console.error('Admin MFA verification failed:', err);
    toast(adminMfaMessage(err.message || 'MFA verification failed.'), 'error');
  }
}

// ============================================
// Utility Functions
// ============================================
const $ = s => document.querySelector(s);
const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const store = (key, value) => localStorage.setItem(`campusrun_${key}`, JSON.stringify(value));
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`campusrun_${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
const clone = value => JSON.parse(JSON.stringify(value));

// Local HTML-escape helper (admin.js also runs standalone via admin.html
// without app.js, so it must not rely on the global esc from app.js).
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only http(s) / protocol-relative / absolute-or-relative safe URLs are allowed
// into an <img src> (mirrors the customer-site helper in app.js). Dangerous
// schemes (javascript:, data:, vbscript:, file:) are rejected up-front.
const safeImageUrl = url => {
  if (!url) return '';
  const s = String(url).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') ||
      lower.startsWith('vbscript:') || lower.startsWith('file:')) return '';
  if (/^(https?:)?\/\//i.test(s)) return s;
  if (/^\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/i.test(s)) return s;
  if (/^[a-z0-9][a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/i.test(s)) return s;
  return '';
};

// ============================================
// Supabase Sync Helpers
// ============================================
// Check if Supabase is available and configured.
function supabaseAvailable() {
  return typeof supabase !== 'undefined' && supabase;
}

// Map a frontend vendor object to the Supabase vendors table row shape.
function vendorToRow(v) {
  return {
    id: v.id,
    name: v.name,
    icon: v.icon,
    type: v.type,
    rating: v.rating,
    time: v.time,
    cover: v.cover,
    open: v.open,
    delivery_method: v.delivery_method || 'rider',
    image: v.image || null,
    description: v.description || null,
    opening_hours: v.opening_hours || null
  };
}

// Map a frontend product object to the Supabase products table row shape.
// The frontend uses `vendor` for the vendor id; Supabase uses `vendor_id`.
function productToRow(p) {
  return {
    id: p.id,
    vendor_id: p.vendor,
    name: p.name,
    desc: p.desc,
    price: p.price,
    icon: p.icon,
    category: p.category,
    active: true,
    image: p.image || null
  };
}

// Upsert a vendor into Supabase. Returns true on success, false on failure.
async function syncVendorToSupabase(vendor) {
  const state = currentAdminState();
  if (!supabaseAvailable()) return false;
  lastVendorSyncError = null;
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_upsert_vendor', { p_vendor: vendorToRow(vendor) });
    if (error) throw error;
    return true;
  } catch (err) {
    lastVendorSyncError = err;
    console.error('Supabase vendor sync failed:', err);
    console.error('Supabase vendor sync details:', {
      code: err?.code,
      message: err?.message,
      details: err?.details,
      hint: err?.hint
    });
    return false;
  }
}

// Upsert a product into Supabase. Returns true on success, false on failure.
async function syncProductToSupabase(product) {
  const state = currentAdminState();
  if (!supabaseAvailable()) return false;
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_upsert_product', { p_product: productToRow(product) });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase product sync failed:', err);
    return false;
  }
}

// Deactivate a vendor and all its products in Supabase. Historical rows are
// retained so product/order foreign keys and order history remain intact.
async function deleteVendorFromSupabase(vendorId) {
  const state = currentAdminState();
  if (!supabaseAvailable()) return false;
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { data: products, error: productReadError } = await supabase.from('products').select('id').eq('vendor_id', vendorId);
    if (productReadError) throw productReadError;
    for (const product of products || []) {
      const { error: productError } = await supabase.rpc('admin_deactivate_product', { p_product_id: product.id });
      if (productError) throw productError;
    }
    const vendor = state.catalog?.vendors?.find(v => v.id === vendorId);
    const { error: vendorError } = await supabase.rpc('admin_upsert_vendor', { p_vendor: vendorToRow({ ...vendor, open: false }) });
    if (vendorError) {
      console.error('Supabase vendor delete failed:', {
        code: vendorError.code,
        message: vendorError.message,
        details: vendorError.details,
        hint: vendorError.hint,
        vendorId,
        operation: 'vendor deactivation',
        entity: 'vendors'
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase vendor delete failed:', {
      code: err?.code,
      message: err?.message,
      details: err?.details,
      hint: err?.hint,
      vendorId,
      operation: 'unexpected delete error',
      entity: 'unknown'
    });
    return false;
  }
}

// Deactivate a product in Supabase (set active = false) instead of hard-deleting.
async function deactivateProductInSupabase(productId) {
  const state = currentAdminState();
  if (!supabaseAvailable()) return false;
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_deactivate_product', { p_product_id: productId });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase product deactivate failed:', err);
    return false;
  }
}

// Load the catalog from Supabase. Returns the catalog object or null on failure.
async function loadCatalogFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) return null;
  try {
    const [vendorsRes, productsRes] = await Promise.all([
      supabase.from('vendors').select('*'),
      supabase.from('products').select('*').eq('active', true)
    ]);
    if (vendorsRes.error) throw vendorsRes.error;
    if (productsRes.error) throw productsRes.error;

    const vendors = vendorsRes.data.map(v => ({
      id: v.id, name: v.name, icon: v.icon, type: v.type,
      rating: v.rating, time: v.time, cover: v.cover, open: v.open,
      delivery_method: v.delivery_method || 'rider',
      image: v.image || '', description: v.description || '',
      opening_hours: v.opening_hours || ''
    }));
    const products = productsRes.data.map(p => ({
      id: p.id, vendor: p.vendor_id, name: p.name, desc: p.desc,
      price: p.price, icon: p.icon, category: p.category,
      image: p.image || ''
    }));
    // Bookshop is removed for Dropzyy 1.0 — strip it before it can be shown,
    // selected in the product form, or written back to the shared catalog key.
    return stripBookshop({ vendors, products }).catalog;
  } catch (err) {
    console.error('Supabase catalog load failed:', err);
    return null;
  }
}

// ============================================================
// Bookshop removal (Dropzyy 1.0)
// ============================================================
// The Bookshop is deferred to Dropzyy 2.0 and must not appear in the admin
// panel either. loadCatalogFromSupabase() / loadCatalog() pass every catalog
// through stripBookshop(), so a Bookshop vendor or product that still exists
// in Supabase is never listed, never selectable in the vendor dropdown and
// never written back into the shared localStorage catalog.
const BOOKSHOP_VENDOR_IDS = new Set(['bookshop', 'campus-bookshop']);
const BOOKSHOP_PRODUCT_IDS = new Set([75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90]);
const isBookshopLabel = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '') === 'bookshop';
const isBookshopVendorId = id => BOOKSHOP_VENDOR_IDS.has(String(id ?? '').trim().toLowerCase());
const isBookshopVendor = v => Boolean(v) && (
  isBookshopVendorId(v.id) || isBookshopLabel(v.type) || isBookshopLabel(v.name)
);
const isBookshopProduct = p => Boolean(p) && (
  BOOKSHOP_PRODUCT_IDS.has(Number(p.id)) || isBookshopLabel(p.category)
  || isBookshopVendorId(p.vendor ?? p.vendor_id)
);
function stripBookshop(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return { catalog, removed: false };
  const vendors = Array.isArray(catalog.vendors) ? catalog.vendors : [];
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const keptVendors = vendors.filter(v => !isBookshopVendor(v));
  const removedVendorIds = new Set(vendors.filter(isBookshopVendor).map(v => v.id));
  const keptProducts = products.filter(p => !isBookshopProduct(p)
    && !removedVendorIds.has(p.vendor) && !removedVendorIds.has(p.vendor_id));
  if (keptVendors.length === vendors.length && keptProducts.length === products.length) {
    return { catalog, removed: false };
  }
  return { catalog: { ...catalog, vendors: keptVendors, products: keptProducts }, removed: true };
}

// Seed data (same as main app)
const SEED_DATA = {
  vendors: [
    { id: 'captain-cook', name: 'Captain Cook', icon: '🍔', type: 'Restaurant', rating: '4.8', time: '15–25 min', cover: '#ffe7bc', open: true, delivery_method: 'rider', description: 'Campus favourite for rice, chicken and hearty plates.', opening_hours: 'Mon–Sun 08:00–21:00' },
    { id: 'season-deli', name: 'Season Deli', icon: '🥪', type: 'Restaurant', rating: '4.7', time: '10–18 min', cover: '#f4d7a6', open: true, delivery_method: 'rider', description: 'Sandwiches, deli-style meals and quick bites.', opening_hours: 'Mon–Sat 09:00–19:00' },
    { id: 'staff-caf', name: 'Staff Caf', icon: '🍛', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#d8e6ff', open: true, delivery_method: 'rider', description: 'Reliable cafeteria meals for the whole campus.', opening_hours: 'Mon–Fri 07:00–18:00, Sat 08:00–14:00' },
    { id: 'caf-1', name: 'Caf 1', icon: '🍲', type: 'Restaurant', rating: '4.8', time: '10–18 min', cover: '#d9f5e9', open: true, delivery_method: 'rider', description: 'Wide menu of Nigerian classics and snacks.', opening_hours: 'Mon–Sun 08:00–20:00' },
    { id: 'caf-2', name: 'Caf 2', icon: '🍝', type: 'Restaurant', rating: '4.5', time: '15–22 min', cover: '#f4def8', open: true, delivery_method: 'rider', description: 'Rice, pasta and shared favourites.', opening_hours: 'Mon–Sun 08:00–20:00' },
    { id: 'caf-3', name: 'Caf 3', icon: '🍗', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#ffe1d6', open: true, delivery_method: 'rider', description: 'Grilled options and daily specials.', opening_hours: 'Mon–Fri 08:00–18:00, Sat 10:00–16:00' },
    { id: 'streat-food', name: 'Streat food', icon: '🍟', type: 'Restaurant', rating: '4.7', time: '8–15 min', cover: '#fff1bd', open: true, delivery_method: 'rider', description: 'Suya, chips and street-food classics.', opening_hours: 'Mon–Sun 12:00–22:00' },
    { id: 'med-caf', name: 'Med Caf', icon: '🥘', type: 'Restaurant', rating: '4.5', time: '15–25 min', cover: '#dceaff', open: true, delivery_method: 'rider', description: 'Wholesome cafeteria meals at student prices.', opening_hours: 'Mon–Sat 08:00–18:00' },
    { id: 'smoothie-shack', name: 'Smoothie Shack', icon: '🥤', type: 'Restaurant', rating: '4.6', time: '10–18 min', cover: '#e4d9ff', open: true, delivery_method: 'rider', description: 'Fresh smoothies, shakes and cold drinks.', opening_hours: 'Mon–Sun 09:00–20:00' },
    { id: 'campus-drinks', name: 'Campus Drinks', icon: '🥤', type: 'Beverages', rating: '4.6', time: '5–10 min', cover: '#ffe4e1', open: true, delivery_method: 'rider', description: 'Cold drinks, juices and refreshments.', opening_hours: 'Mon–Sun 08:00–22:00' }
  ],
  products: [
    { id: 1, vendor: 'caf-1', name: 'Jollof Rice', desc: 'Caf 1 serving.', price: 400, icon: '🍛', category: 'Food' },
    { id: 2, vendor: 'caf-1', name: 'Spaghetti', desc: 'Caf 1 serving.', price: 500, icon: '🍝', category: 'Meals' },
    { id: 3, vendor: 'caf-1', name: 'Chicken', desc: 'Caf 1 serving.', price: 1500, icon: '🍗', category: 'Food' },
    { id: 4, vendor: 'caf-1', name: 'Egg Sauce', desc: 'Caf 1 serving.', price: 650, icon: '🍳', category: 'Meals' },
    { id: 5, vendor: 'caf-1', name: 'Rice & Chicken Sauce', desc: 'Caf 1 serving.', price: 3900, icon: '🍛', category: 'Food' },
    { id: 6, vendor: 'caf-1', name: 'White Beans', desc: 'Caf 1 serving.', price: 500, icon: '🥣', category: 'Meals' },
    { id: 7, vendor: 'caf-1', name: 'Sausages', desc: 'Caf 1 serving.', price: 350, icon: '🌭', category: 'Snacks' },
    { id: 8, vendor: 'caf-1', name: 'Fried Egg', desc: 'Caf 1 serving.', price: 450, icon: '🍳', category: 'Meals' },
    { id: 9, vendor: 'caf-1', name: 'Chicken Pasta', desc: 'Caf 1 serving.', price: 3000, icon: '🍝', category: 'Meals' },
    { id: 10, vendor: 'caf-1', name: 'Moi Moi', desc: 'Caf 1 serving.', price: 500, icon: '🫔', category: 'Meals' },
    { id: 11, vendor: 'caf-1', name: 'Suga Moi Moi', desc: 'Caf 1 serving.', price: 1000, icon: '🫔', category: 'Meals' },
    { id: 12, vendor: 'caf-1', name: 'Salad', desc: 'Caf 1 serving.', price: 500, icon: '🥗', category: 'Food' },
    { id: 13, vendor: 'caf-1', name: 'Plantain Portion', desc: 'Three plantains per portion.', price: 200, icon: '🍌', category: 'Food' },
    { id: 14, vendor: 'caf-1', name: 'Diced Plantain', desc: 'Caf 1 serving.', price: 600, icon: '🍌', category: 'Food' },
    { id: 15, vendor: 'caf-1', name: 'Boiled Egg', desc: 'Caf 1 serving.', price: 350, icon: '🥚', category: 'Meals' },
    { id: 16, vendor: 'caf-1', name: 'Indomie', desc: 'Price per pack.', price: 700, icon: '🍜', category: 'Meals' },
    { id: 17, vendor: 'caf-1', name: 'Porridge Yam (Half Pack)', desc: 'Caf 1 serving.', price: 1200, icon: '🍲', category: 'Meals' },
    { id: 18, vendor: 'caf-1', name: 'Porridge Yam (Full Pack)', desc: 'Caf 1 serving.', price: 2400, icon: '🍲', category: 'Meals' },
    { id: 19, vendor: 'caf-1', name: 'Emerald Delight', desc: 'White rice and vegetable soup.', price: 3200, icon: '🍚', category: 'Food' },
    { id: 20, vendor: 'caf-1', name: 'Swallow with Soup', desc: 'Caf 1 serving.', price: 2500, icon: '🍲', category: 'Meals' },
    { id: 21, vendor: 'caf-1', name: 'Extra Swallow Wrap', desc: 'Caf 1 serving.', price: 600, icon: '🍲', category: 'Meals' },
    { id: 22, vendor: 'caf-1', name: 'Pizza', desc: 'Listed mid-range price (₦7,000–₦8,000).', price: 7500, icon: '🍕', category: 'Food' },
    { id: 23, vendor: 'captain-cook', name: 'Jollof Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍛', category: 'Food' },
    { id: 24, vendor: 'captain-cook', name: 'Fried Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍚', category: 'Food' },
    { id: 25, vendor: 'captain-cook', name: 'Chicken (Small)', desc: 'Captain Cook serving.', price: 900, icon: '🍗', category: 'Food' },
    { id: 26, vendor: 'captain-cook', name: 'Chicken (Large)', desc: 'Captain Cook serving.', price: 1500, icon: '🍗', category: 'Food' },
    { id: 27, vendor: 'captain-cook', name: 'Basmati Rice', desc: 'Jollof or fried rice.', price: 1000, icon: '🍛', category: 'Food' },
    { id: 28, vendor: 'captain-cook', name: 'Spaghetti', desc: 'Captain Cook serving.', price: 800, icon: '🍝', category: 'Meals' },
    { id: 29, vendor: 'captain-cook', name: 'Porridge Beans', desc: 'Captain Cook serving.', price: 1000, icon: '🥣', category: 'Meals' },
    { id: 30, vendor: 'captain-cook', name: 'Beef', desc: 'Captain Cook serving.', price: 500, icon: '🥩', category: 'Food' },
    { id: 31, vendor: 'captain-cook', name: 'Fish (Regular)', desc: 'Captain Cook serving.', price: 600, icon: '🐟', category: 'Food' },
    { id: 32, vendor: 'captain-cook', name: 'Fish (Large)', desc: 'Captain Cook serving.', price: 800, icon: '🐟', category: 'Food' },
    { id: 33, vendor: 'captain-cook', name: 'Ofada Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍚', category: 'Food' },
    { id: 34, vendor: 'captain-cook', name: 'Ofada Sauce', desc: 'Captain Cook serving.', price: 500, icon: '🍲', category: 'Meals' },
    { id: 35, vendor: 'captain-cook', name: 'Ice Cream Cone', desc: 'Captain Cook serving.', price: 1000, icon: '🍦', category: 'Snacks' },
    { id: 36, vendor: 'captain-cook', name: 'Ice Cream Container', desc: 'Captain Cook serving.', price: 2000, icon: '🍨', category: 'Snacks' },
    { id: 37, vendor: 'caf-2', name: 'Jollof Rice', desc: 'Caf 2 price aligned with Caf 1.', price: 400, icon: '🍛', category: 'Food' },
    { id: 38, vendor: 'caf-2', name: 'Spaghetti', desc: 'Caf 2 price aligned with Caf 1.', price: 500, icon: '🍝', category: 'Meals' },
    { id: 39, vendor: 'caf-2', name: 'Chicken', desc: 'Caf 2 price aligned with Caf 1.', price: 1500, icon: '🍗', category: 'Food' },
    { id: 40, vendor: 'caf-2', name: 'Moi Moi', desc: 'Caf 2 price aligned with Caf 1.', price: 500, icon: '🫔', category: 'Meals' },
    { id: 41, vendor: 'caf-2', name: 'Plantain Portion', desc: 'Three plantains per portion; Caf 1 price range.', price: 200, icon: '🍌', category: 'Food' },
    { id: 42, vendor: 'caf-3', name: 'White Rice', desc: 'Caf 3 serving.', price: 500, icon: '🍚', category: 'Food' },
    { id: 43, vendor: 'caf-3', name: 'Jollof Rice', desc: 'Caf 3 serving.', price: 500, icon: '🍛', category: 'Food' },
    { id: 44, vendor: 'caf-3', name: 'Chicken Curry', desc: 'Caf 3 serving; availability may be limited.', price: 2000, icon: '🍛', category: 'Food' },
    { id: 45, vendor: 'med-caf', name: 'Jollof Rice', desc: 'Listed price is subject to confirmation.', price: 500, icon: '🍛', category: 'Food' },
    { id: 46, vendor: 'med-caf', name: 'White Rice', desc: 'Listed price is subject to confirmation.', price: 500, icon: '🍚', category: 'Food' },
    { id: 47, vendor: 'season-deli', name: 'Jollof Rice', desc: 'Season Deli serving.', price: 500, icon: '🍛', category: 'Food' },
    { id: 48, vendor: 'season-deli', name: 'Fried Rice', desc: 'Season Deli serving.', price: 500, icon: '🍚', category: 'Food' },
    { id: 49, vendor: 'season-deli', name: 'White Rice', desc: 'Season Deli serving.', price: 500, icon: '🍚', category: 'Food' },
    { id: 50, vendor: 'season-deli', name: 'Boiled Egg', desc: 'Price is subject to confirmation.', price: 350, icon: '🥚', category: 'Meals' },
    { id: 51, vendor: 'streat-food', name: 'Suya', desc: 'Streat food serving.', price: 800, icon: '🍢', category: 'Food' },
    { id: 52, vendor: 'streat-food', name: 'Suya (Other Stall)', desc: 'Alternative Streat food stall.', price: 500, icon: '🍢', category: 'Food' },
    { id: 53, vendor: 'streat-food', name: 'Ponmo Sauce', desc: 'Streat food serving.', price: 700, icon: '🍲', category: 'Meals' },
    { id: 54, vendor: 'streat-food', name: 'Chicken Sauce', desc: 'Streat food serving.', price: 500, icon: '🍗', category: 'Meals' },
    { id: 55, vendor: 'streat-food', name: 'Asun', desc: 'Listed mid-range price (₦1,000–₦1,200).', price: 1100, icon: '🍖', category: 'Food' },
    { id: 56, vendor: 'streat-food', name: 'Chips', desc: 'Without pack.', price: 1500, icon: '🍟', category: 'Snacks' },
    { id: 57, vendor: 'streat-food', name: 'Chips (With Pack)', desc: 'Streat food serving.', price: 1750, icon: '🍟', category: 'Snacks' },
    { id: 58, vendor: 'streat-food', name: 'Chicken & Chips', desc: 'Listed mid-range price (₦3,500–₦4,000).', price: 3750, icon: '🍗', category: 'Food' },
    { id: 59, vendor: 'streat-food', name: 'Fish Pepper Soup', desc: 'Streat food serving.', price: 2500, icon: '🍲', category: 'Meals' },
    { id: 60, vendor: 'streat-food', name: 'Akara', desc: 'Price per piece.', price: 200, icon: '🧆', category: 'Snacks' },
    { id: 61, vendor: 'streat-food', name: 'Masa', desc: 'Listed higher price per piece.', price: 200, icon: '🫓', category: 'Snacks' },
    { id: 62, vendor: 'streat-food', name: 'Coated Yam', desc: 'Price per piece.', price: 200, icon: '🍠', category: 'Snacks' },
    { id: 63, vendor: 'streat-food', name: 'Shawarma', desc: 'Streat food serving.', price: 3000, icon: '🌯', category: 'Food' },
    { id: 64, vendor: 'streat-food', name: 'Grilled Fish', desc: 'Listed entry price; sizes range to ₦7,000.', price: 1500, icon: '🐟', category: 'Food' },
    { id: 65, vendor: 'streat-food', name: 'Toast', desc: 'Streat food serving.', price: 2300, icon: '🥪', category: 'Food' },
    { id: 66, vendor: 'streat-food', name: 'Cheesesteak', desc: 'Streat food serving.', price: 5000, icon: '🥪', category: 'Food' },
    { id: 67, vendor: 'streat-food', name: 'Bread & Egg', desc: 'Streat food serving.', price: 2500, icon: '🍞', category: 'Food' },
    { id: 68, vendor: 'streat-food', name: 'Fried Egg', desc: 'Streat food serving.', price: 500, icon: '🍳', category: 'Meals' },
    { id: 69, vendor: 'smoothie-shack', name: 'Jollof Rice', desc: 'Price is subject to confirmation.', price: 500, icon: '🍛', category: 'Food' },
    { id: 70, vendor: 'smoothie-shack', name: 'Fried Rice', desc: 'Price is subject to confirmation.', price: 500, icon: '🍚', category: 'Food' },
    { id: 71, vendor: 'smoothie-shack', name: 'White Rice', desc: 'Smoothie Shack serving.', price: 500, icon: '🍚', category: 'Food' },
    { id: 72, vendor: 'smoothie-shack', name: 'Chicken', desc: 'Smoothie Shack serving.', price: 2500, icon: '🍗', category: 'Food' },
    { id: 73, vendor: 'smoothie-shack', name: 'Boiled Egg', desc: 'Listed higher price pending confirmation.', price: 350, icon: '🥚', category: 'Meals' },
    { id: 74, vendor: 'smoothie-shack', name: 'Macaroni', desc: 'Price is subject to confirmation.', price: 500, icon: '🍝', category: 'Meals' },    { id: 91, vendor: 'campus-drinks', name: 'Coca-Cola', desc: 'Classic refreshing cola drink.', price: 300, icon: '🥤', category: 'Drinks' },
    { id: 92, vendor: 'campus-drinks', name: 'Fanta Orange', desc: 'Sweet orange flavored soda.', price: 300, icon: '🍊', category: 'Drinks' },
    { id: 93, vendor: 'campus-drinks', name: 'Fanta Pineapple', desc: 'Tropical pineapple flavor.', price: 300, icon: '🍍', category: 'Drinks' },
    { id: 94, vendor: 'campus-drinks', name: 'Exotic Juice', desc: 'Premium mixed fruit juice.', price: 500, icon: '🧃', category: 'Drinks' },
    { id: 95, vendor: 'campus-drinks', name: 'Red Wine', desc: 'Premium quality red wine.', price: 3500, icon: '🍷', category: 'Drinks' },
    { id: 96, vendor: 'campus-drinks', name: 'Pepsi', desc: 'Refreshing cola beverage.', price: 300, icon: '🥤', category: 'Drinks' },
    { id: 97, vendor: 'campus-drinks', name: 'Sprite', desc: 'Lemon-lime flavored soda.', price: 300, icon: '🥤', category: 'Drinks' },
    { id: 98, vendor: 'campus-drinks', name: 'Malt Drink', desc: 'Nutritious malt beverage.', price: 400, icon: '🍺', category: 'Drinks' },
    { id: 99, vendor: 'campus-drinks', name: 'Chivita Orange Juice', desc: 'Fresh squeezed orange juice.', price: 600, icon: '🍊', category: 'Drinks' },
    { id: 100, vendor: 'campus-drinks', name: 'Bottled Water', desc: 'Pure drinking water 50cl.', price: 200, icon: '💧', category: 'Drinks' },
    { id: 101, vendor: 'campus-drinks', name: 'Energy Drink', desc: 'Boost your energy levels.', price: 800, icon: '⚡', category: 'Drinks' }
  ]
};

// ============================================
// Toast Notifications
// ============================================
function toast(message, kind = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  const text = document.createElement('span');
  text.className = 'toast__text';
  text.textContent = message;
  el.appendChild(text);
  if (kind === 'error') {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'toast__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss message');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => el.remove());
    el.appendChild(dismiss);
  }
  $('#toastRoot').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 9000 : 3400);
}

// ============================================
// Admin Sub-Header (embedded in index.html above the workspace)
// ============================================
function adminNav() {
  return `
    <div class="admin-subheader">
      <div class="container admin-subheader__inner">
        <span class="badge badge--brand">Admin Panel</span>
        <div class="admin-subheader__actions">
          <a href="#/" class="btn btn--ghost btn--sm">← Back to Site</a>
          <button class="btn btn--dangerSoft btn--sm" id="adminLogoutBtn">Sign out</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// Authentication (Supabase Auth only)
// ============================================
// Admin authentication is strictly Supabase Auth based. There are NO hardcoded
// credentials and NO localStorage fallback. A user is only granted admin access
// when ALL of the following are true:
//   1. Supabase is available and configured.
//   2. There is a valid Supabase session (auth.getSession() returns a user).
//   3. The authenticated user's profile row has role === 'admin'.
// If Supabase authentication is unavailable, admin login is denied.

// Fetch the authenticated user's profile using their auth.uid() (user id).
// Returns the profile row or null. Never defaults a missing/unknown role.
async function fetchAdminProfile() {
  const state = currentAdminState();
  if (!supabaseAvailable() || !supabaseAdminUser) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseAdminUser.id)
      .maybeSingle();
    if (error) throw error;
    if (state !== currentAdminState()) return null;
    if (!data) return null;
    state.user = {
      id: data.id,
      name: data.full_name || supabaseAdminUser.email.split('@')[0],
      email: data.email,
      role: data.role
    };
    return data;
  } catch (err) {
    console.error('Failed to fetch admin profile:', err);
    return null;
  }
}

// Verify the current Supabase session belongs to a user whose profile role is
// exactly 'admin'. Returns true only when the session is valid AND the role
// check passes. A forged localStorage value can never grant admin access.
async function checkAuth() {
  const state = currentAdminState();
  // Admin access requires Supabase. If it is unavailable, deny access.
  if (!supabaseAvailable()) {
    console.error('Admin auth denied: Supabase is not available.');
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (state !== currentAdminState()) return false;
    if (!session || !session.user) {
      console.error('Admin auth denied: no valid Supabase session.');
      clearAuthState();
      renderLogin();
      return false;
    }
    supabaseAdminUser = session.user;
    const profile = await fetchAdminProfile();
    if (state !== currentAdminState()) return false;
    if (!profile || profile.role !== 'admin') {
      console.error('Admin auth denied: profile role is not exactly "admin".');
      clearAuthState();
      renderLogin();
      return false;
    }
    state.isAuthenticated = true;
    await prepareAdminMfaChallenge();
    if (state !== currentAdminState()) return false;
    return true;
  } catch (err) {
    console.error('Supabase session check failed:', err);
    if (state !== currentAdminState()) return false;
    state.isAuthenticated = false;
    supabaseAdminUser = null;
    return false;
  }
}

// Sign in via Supabase Auth only. If Supabase is unavailable or signInWithPassword
// fails, admin login is denied — there is no fallback.
async function login(email, password) {
  const state = currentAdminState();
  // Admin login requires Supabase. If it is unavailable, deny login.
  if (!supabaseAvailable()) {
    toast('Admin login unavailable: Supabase authentication is not configured.', 'error');
    return false;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (state !== currentAdminState()) return false;
    if (error) throw error;
    if (!data.user) throw new Error('No user returned from Supabase authentication.');

    supabaseAdminUser = data.user;
    const profile = await fetchAdminProfile();
    if (state !== currentAdminState()) return false;
    if (!profile || profile.role !== 'admin') {
      // The user authenticated with Supabase but is not an admin — deny access.
      await supabase.auth.signOut().catch(() => {});
      state.isAuthenticated = false;
      supabaseAdminUser = null;
      toast('Access denied: this account does not have admin privileges.', 'error');
      return false;
    }

    state.isAuthenticated = true;
    return true;
  } catch (err) {
    toast('Authentication failed: ' + (err.message || 'Invalid credentials'), 'error');
    return false;
  }
}

function logout() {
  clearAuthState();
  renderLogin();
  // Clear Supabase session and redirect to the admin login screen.
  if (supabaseAvailable()) {
    supabase.auth.signOut().finally(() => {
      location.hash = '#/admin/login';
    });
  } else {
    location.hash = '#/admin/login';
  }
}

// ============================================
// Catalog Management
// ============================================

// Merge any missing seed vendors/products into the loaded catalog. This repairs
// stale localStorage data that predates new catalog entries (e.g. the drinks
// vendor) so those sections are always present. Bookshop is removed for
// Dropzyy 1.0, so loadCatalog() strips it afterwards.
function mergeSeedIntoStored(cat) {
  let changed = false;
  SEED_DATA.vendors.forEach(seedV => {
    if (!cat.vendors.some(v => v.id === seedV.id)) { cat.vendors.push(clone(seedV)); changed = true; }
  });
  SEED_DATA.products.forEach(seedP => {
    if (!cat.products.some(p => p.id === seedP.id)) { cat.products.push(clone(seedP)); changed = true; }
  });
  if (changed) { state.catalog = cat; store('catalog_v3', cat); }
  return cat;
}

async function loadCatalog() {
  const state = currentAdminState();
  // Try to load from Supabase first (source of truth)
  const supabaseCatalog = await loadCatalogFromSupabase();
  if (supabaseCatalog) {
    state.catalog = stripBookshop(supabaseCatalog).catalog;
    store('catalog_v3', state.catalog);
    return;
  }
  // Fall back to localStorage if Supabase is unavailable
  state.catalog = stripBookshop(mergeSeedIntoStored(load('catalog_v3', clone(SEED_DATA)))).catalog;
}

function saveCatalog() {
  // 'catalog_v3' is the shared localStorage key used by both the admin
  // panel and the main customer site, so saving here automatically keeps
  // them in sync (as long as the main app re-reads this key before writing).
  store('catalog_v3', state.catalog);
}

// ============================================
// Vendor Management
// ============================================
async function addVendor(formData) {
  const state = currentAdminState();
  const vendor = {
    id: formData.get('id') || `${formData.get('name').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`,
    name: formData.get('name').trim(),
    type: formData.get('type').trim(),
    icon: formData.get('icon').trim() || '🏪',
    time: formData.get('time').trim() || '15–25 min',
    rating: formData.get('rating') || '4.5',
    cover: formData.get('cover') || '#d9f5e9',
    open: formData.get('open') === 'on',
    delivery_method: formData.get('delivery_method') || 'rider',
    image: safeImageUrl(formData.get('image')),
    description: (formData.get('description') || '').trim(),
    opening_hours: (formData.get('opening_hours') || '').trim()
  };

  const synced = await syncVendorToSupabase(vendor);
  if (!synced) {
    toast(adminMfaMessage(lastVendorSyncError?.message || 'Vendor save failed; no local changes were made'), 'error');
  } else {
    const existingIndex = state.catalog.vendors.findIndex(v => v.id === vendor.id);
    if (existingIndex >= 0) state.catalog.vendors[existingIndex] = vendor;
    else state.catalog.vendors.push(vendor);
    saveCatalog();
    toast('Vendor saved successfully');
  }

  renderAdminWorkspace();
}

async function deleteVendor(vendorId) {
  const state = currentAdminState();
  if (await DropzyyModal.confirm({ title:'Deactivate vendor', message:'Deactivate this vendor and all its products? Historical orders will be preserved.', confirmText:'Deactivate vendor', danger:true })) {
    const vendorProductIds = state.catalog.products.filter(p => p.vendor === vendorId).map(p => p.id);
    // Sync to Supabase
    const synced = await deleteVendorFromSupabase(vendorId);
    if (!synced) {
      toast('Vendor deactivation failed — local state was not changed', 'error');
    } else {
      state.catalog.vendors = state.catalog.vendors.map(v => v.id === vendorId ? { ...v, open: false } : v);
      state.catalog.products = state.catalog.products.map(p => p.vendor === vendorId ? { ...p, active: false } : p);
      // Remove any cart entries that referenced the deleted vendor's products
      const cart = load('cart', []);
      store('cart', cart.filter(x => !vendorProductIds.includes(x.id)));

      // Save to localStorage only after Supabase succeeds.
      saveCatalog();
      toast('Vendor deactivated successfully');
    }

    renderAdminWorkspace();
  }
}

async function toggleVendor(vendorId) {
  const state = currentAdminState();
  const vendor = state.catalog.vendors.find(v => v.id === vendorId);
  if (vendor) {
    vendor.open = !vendor.open;

    const synced = await syncVendorToSupabase(vendor);
    if (!synced) {
      vendor.open = !vendor.open;
      toast(adminMfaMessage(lastVendorSyncError?.message || 'Vendor update failed; no local changes were made'), 'error');
    } else {
      saveCatalog();
      toast(`Vendor ${vendor.open ? 'opened' : 'closed'}`);
    }

    renderAdminWorkspace();
  }
}

// ============================================
// Product Management
// ============================================
async function addProduct(formData) {
  const state = currentAdminState();
  const product = {
    id: formData.get('id') ? Number(formData.get('id')) : Math.max(0, ...state.catalog.products.map(p => p.id)) + 1,
    vendor: formData.get('vendor'),
    name: formData.get('name').trim(),
    price: Number(formData.get('price')),
    category: formData.get('category').trim(),
    icon: formData.get('icon').trim() || '🍽️',
    desc: formData.get('desc').trim(),
    image: safeImageUrl(formData.get('image'))
  };

  const synced = await syncProductToSupabase(product);
  if (!synced) {
    toast('Product save failed; no local changes were made', 'error');
  } else {
    const existingIndex = state.catalog.products.findIndex(p => p.id === product.id);
    if (existingIndex >= 0) state.catalog.products[existingIndex] = product;
    else state.catalog.products.push(product);
    saveCatalog();
    toast('Product saved successfully');
  }

  renderAdminWorkspace();
}

async function deleteProduct(productId) {
  const state = currentAdminState();
  if (await DropzyyModal.confirm({ title:'Delete product', message:'Delete this product?', confirmText:'Delete product', danger:true })) {
    const previousProducts = clone(state.catalog.products);
    state.catalog.products = state.catalog.products.filter(p => p.id !== Number(productId));
    // Remove any cart entries that referenced the deleted product
    const cart = load('cart', []);
    store('cart', cart.filter(x => x.id !== Number(productId)));

    // Save to localStorage (fallback)
    saveCatalog();

    // Deactivate in Supabase (soft delete — keeps FK integrity)
    const synced = await deactivateProductInSupabase(Number(productId));
    if (!synced) {
      state.catalog.products = previousProducts;
      saveCatalog();
      toast('Product deactivation failed; no local changes were made', 'error');
    } else {
      toast('Product deleted');
    }

    renderAdminWorkspace();
  }
}

// ============================================
// Admin Initialization
// ============================================
// Called by app.js (index.html) when the user navigates to an admin route.
// Also called automatically when admin.html is loaded directly (legacy).
async function init() {
  const state = currentAdminState();
  const authed = await checkAuth();
  if (state !== currentAdminState()) return false;
  if (!authed) {
    // Not authenticated — render the login screen so the user can sign in.
    renderLogin();
    return false;
  }
  if (state.mfa.challengeRequired) {
    renderAdminMfaChallenge();
    return true;
  }
  await refreshAdminMfa();
  if (state !== currentAdminState()) return false;
  // Load catalog, orders, riders, and assignable users only once (lazy load on
  // first admin entry). loadAssignableUsers requires admin auth, which
  // checkAuth() already enforced above.
  if (!state.catalog) {
    // Show a loading shell so the admin gets immediate visual feedback while
    // the Supabase queries resolve.
    state.ordersLoading = true;
    state.ordersError = null;
    $('#app').innerHTML =
      `${adminNav()}` +
      `<section class="section container">` +
        `<div class="card"><div class="muted center" style="padding:32px">Loading admin dashboard…</div></div>` +
      `</section>`;
    await loadCatalog();
    if (state !== currentAdminState()) return false;
    await loadOrders();
    if (state !== currentAdminState()) return false;
    await loadRiders();
    if (state !== currentAdminState()) return false;
    await loadRiderMetrics();
    if (state !== currentAdminState()) return false;
    await loadAssignableUsers();
    if (state !== currentAdminState()) return false;
  }
  // Withdrawal requests are always refreshed on admin entry so newly
  // submitted rider requests appear even after the first lazy load.
  await loadWithdrawalsFromSupabase();
  if (state !== currentAdminState()) return false;
  // Refund requests are always refreshed on admin entry.
  await loadRefundsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadPaymentsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadSettlementsFromSupabase();
  if (state !== currentAdminState()) return false;
  // Issue reports are always refreshed on admin entry so new reports from
  // customers (homepage "Report an Issue") appear.
  await loadReportsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadRatingsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadNotificationsFromSupabase();
  if (state !== currentAdminState()) return false;
  // Automatic cutoff claims are refreshed on entry so failed claims are retried.
  await loadAutomaticCutoffClaimsFromSupabase();
  if (state !== currentAdminState()) return false;
  // Vendor applications are refreshed on entry so new "Become a Vendor"
  // submissions appear for review.
  await loadVendorApplicationsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadSiteSettingsFromSupabase();
  if (state !== currentAdminState()) return false;
  await loadGovernanceData();
  if (state !== currentAdminState()) return false;
  // If orders failed to load, the error banner renders here.
  if (state !== currentAdminState()) return false;
  renderAdminWorkspace();
  return true;
}

// Load the global settings from Supabase. The database row is the source of
// truth; this is intentionally not backed by localStorage.
async function loadPaymentsFromSupabase() {
  const state = currentAdminState();
  state.paymentsLoading = true; state.paymentsError = null;
  try {
    const { data, error } = await supabase.from('payments').select('id,order_id,reference,transaction_id,amount,currency,status,gateway,created_at,updated_at').order('created_at', { ascending: false });
    if (error) throw error;
    state.payments = data || [];
  } catch (err) {
    state.payments = []; state.paymentsError = err.message || 'Could not load payment ledger.';
  } finally { state.paymentsLoading = false; }
}

async function loadSiteSettingsFromSupabase() {
  const state = currentAdminState();
  state.siteSettingsLoading = true;
  state.siteSettingsError = null;
  if (!supabaseAvailable()) {
    state.siteSettingsLoading = false;
    state.siteSettingsError = 'Supabase is not configured.';
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('maintenance_mode,weekday_delivery_start,weekday_delivery_end,weekend_delivery_start,weekend_delivery_end,timezone,updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Global site settings row was not found.');
    state.siteSettings = data;
    return data;
  } catch (err) {
    console.error('Site settings load failed:', err);
    state.siteSettings = null;
    state.siteSettingsError = err.message || 'Could not load site settings.';
    return null;
  } finally {
    state.siteSettingsLoading = false;
  }
}

async function loadGovernanceData() {
  const s = currentAdminState();
  s.auditLogsLoading = true; s.adminUsersLoading = true;
  try { const q = await supabase.from('admin_action_audit').select('*').order('created_at',{ascending:false}).limit(500); if (q.error) throw q.error; s.auditLogs=q.data||[]; } catch(e) { s.auditLogs=[]; s.auditLogsError=e.message||'Audit log load failed'; } finally { s.auditLogsLoading=false; }
  try { const q = await supabase.from('profiles').select('id,full_name,email,role,created_at').eq('role','admin').order('created_at',{ascending:false}); if(q.error) throw q.error; s.adminUsers=q.data||[]; } catch(e) { s.adminUsers=[]; s.adminUsersError=e.message||'Admin list load failed'; } finally { s.adminUsersLoading=false; }
}

async function updateMaintenanceMode(enabled) {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    toast('Maintenance mode unavailable: Supabase is not configured.', 'error');
    return false;
  }
  try {
    // Require AAL2 for platform-wide maintenance toggle
    const { data: setting, error } = await supabase.rpc('admin_set_maintenance_mode', { p_enabled: Boolean(enabled) });
    if (error) throw error;
    state.siteSettings = { maintenance_mode: Boolean(setting) };
    window.dispatchEvent(new CustomEvent('dropzyy:maintenance-changed', {
      detail: { enabled: Boolean(setting) }
    }));
    const maintenanceChannel = new BroadcastChannel('dropzyy-maintenance');
    maintenanceChannel.postMessage({
      type: 'maintenance-changed',
      enabled: Boolean(setting)
    });
    maintenanceChannel.close();
    toast(`Maintenance Mode turned ${setting ? 'ON' : 'OFF'}`);
    return true;
  } catch (err) {
    console.error('Maintenance mode update failed:', err);
    toast('Could not update Maintenance Mode: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

async function saveSiteSettings(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const required = ['weekday_delivery_start','weekday_delivery_end','weekend_delivery_start','weekend_delivery_end','timezone'];
  if (required.some(key => !String(values[key] || '').trim())) { toast('Complete all platform settings fields.', 'error'); return false; }
  if (values.weekday_delivery_start >= values.weekday_delivery_end || values.weekend_delivery_start >= values.weekend_delivery_end) { toast('Opening time must be earlier than closing time.', 'error'); return false; }
  const save = form.querySelector('[type="submit"]'), cancel = form.querySelector('[data-settings-cancel]');
  if (save) { save.disabled = true; save.textContent = 'Saving…'; } if (cancel) cancel.disabled = true;
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this settings change');
    const { data, error } = await supabase.rpc('admin_update_site_settings', {
      p_maintenance_mode: values.maintenance_mode === 'on',
      p_weekday_start: values.weekday_delivery_start,
      p_weekday_end: values.weekday_delivery_end,
      p_weekend_start: values.weekend_delivery_start,
      p_weekend_end: values.weekend_delivery_end,
      p_timezone: values.timezone.trim()
    });
    if (error) throw error;
    currentAdminState().siteSettings = data;
    toast('Platform settings saved successfully');
    renderAdminWorkspace();
    return true;
  } catch (err) { toast('Could not save platform settings: ' + (err.message || 'unknown error'), 'error'); return false; }
  finally { if (save) { save.disabled = false; save.textContent = 'Save Changes'; } if (cancel) cancel.disabled = false; }
}

// Re-render just the catalog tables (alias for the full workspace).
function renderCatalog() {
  renderAdminWorkspace();
}

// ============================================
// View Renderers
// ============================================
function renderLogin() {
  const app = $('#app');
  app.innerHTML = `
    ${adminNav()}
    <section class="container">
      <div class="auth-wrap">
        <div class="card">
          <div class="center">
            <span class="brand__logo" style="display:inline-grid">🛵</span>
            <h1 class="mt-1">Admin Access</h1>
            <p class="muted">Enter admin credentials to continue.</p>
          </div>
          <form id="loginForm" class="stack mt-2">
            <div class="field">
              <label for="adminEmail">Admin email</label>
              <input required class="input" type="email" name="email" id="adminEmail" placeholder="admin@dropzyy.app" autocomplete="email">
            </div>
            <div class="field">
              <label for="adminPassword">Admin password</label>
              <input required class="input" type="password" name="password" id="adminPassword" placeholder="Enter admin password" autocomplete="current-password">
            </div>
            <button class="btn btn--block btn--lg" type="submit">Access Admin Panel</button>
          </form>
        </div>
      </div>
    </section>
  `;

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');

    login(email, password).then(isValid => {
      if (isValid) {
        toast('Admin access granted');
        // Delegate to app.js routing: hash change triggers render() → init()
        location.hash = '#/admin';
      } else {
        toast('Invalid credentials', 'error');
      }
    });
  });
}

// ============================================
// Admin Section Navigation (UI/UX restructure)
// ============================================
// The admin panel is organized into single-section views behind a responsive
// sidebar, so sections are no longer stacked on one long page. `adminSection`
// is module state and the default landing view is the Dashboard. All renders
// (initial load AND every mutation flow) pass through renderAdminWorkspace(),
// which renders ONLY the active section — nothing else is in the DOM. This is
// pure client-side navigation (no URL changes): it keeps the existing #/admin
// gate in app.js and the standalone admin.html entry, and changes no data,
// RLS, RPC, or business logic.
let adminSection = 'dashboard';
let financeFilter = { query: '', status: 'all', page: 1 };

// Sidebar navigation with at-a-glance pending-count badges (presentational).
function adminSidebar() {
  // The navigation is intentionally broader than the underlying data loaders.
  // Related views reuse the existing, audited management workflows below.
  const sections = [
    { key: 'dashboard', label: 'Dashboard', icon: '⌂', group: 'Overview' },
    { key: 'orders', label: 'Orders', icon: '▤', group: 'Operations' },
    { key: 'deliveries', label: 'Deliveries', icon: '⌁', group: 'Operations' },
    { key: 'customers', label: 'Customers', icon: '♙', group: 'Operations' },
    { key: 'riders', label: 'Riders', icon: '◉', group: 'Operations', count: (state.riders || []).filter(r => r.status === 'pending').length },
    { key: 'vendors', label: 'Vendors', icon: '▣', group: 'Marketplace', count: (state.vendorApplications || []).filter(a => a.status === 'Pending').length },
    { key: 'restaurants', label: 'Restaurants', icon: '⌂', group: 'Marketplace' },
    { key: 'products', label: 'Products', icon: '□', group: 'Marketplace' },
    { key: 'categories', label: 'Categories', icon: '≡', group: 'Marketplace' },
    { key: 'payments', label: 'Payments', icon: '₦', group: 'Finance', count: (state.refunds || []).filter(r => r.status === 'requested').length },
    { key: 'settlements', label: 'Settlements', icon: '⇄', group: 'Finance' },
    { key: 'withdrawals', label: 'Withdrawals', icon: '↓', group: 'Finance' },
    { key: 'transfers', label: 'Transfers', icon: '→', group: 'Finance' },
    { key: 'refunds', label: 'Refunds / Reimbursements', icon: '↩', group: 'Finance' },
    { key: 'ratings', label: 'Ratings', icon: '★', group: 'Insights' },
    { key: 'reports', label: 'Reports', icon: '▥', group: 'Insights', count: (state.reports || []).filter(r => r.status === 'Open').length },
    { key: 'notifications', label: 'Notifications', icon: '◌', group: 'System' },
    { key: 'settings', label: 'Platform Settings', icon: '⚙', group: 'System' },
    { key: 'admin-management', label: 'Admin Management', icon: '♟', group: 'System' },
    { key: 'audit-logs', label: 'Audit Logs', icon: '⌕', group: 'System' },
    { key: 'security', label: 'Security', icon: '◇', group: 'System' }
  ];
  let previousGroup = '';
  return `<button class="admin-mobile-menu" type="button" aria-controls="adminNav" aria-expanded="false" data-admin-menu>☰ <span>Menu</span></button><nav id="adminNav" class="admin-nav" aria-label="Admin sections"><ul class="admin-nav__list">${sections.map(s => `${s.group !== previousGroup ? `<li class="admin-nav__group">${previousGroup = s.group}</li>` : ''}<li><button type="button" class="admin-nav__item${adminSection === s.key ? ' is-active' : ''}" data-admin-nav="${s.key}"${adminSection === s.key ? ' aria-current="page"' : ''}><span class="admin-nav__icon" aria-hidden="true">${s.icon}</span><span class="admin-nav__label">${s.label}</span>${s.count ? `<span class="admin-nav__count">${s.count}</span>` : ''}</button></li>`).join('')}</ul></nav>`;
// Legacy sidebar retained for reference during rollout.
  const legacySections = [
    { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { key: 'orders', label: 'Orders', icon: '🧾' },
    {
      key: 'vendors', label: 'Vendors', icon: '🏪',
      count: (state.vendorApplications || []).filter(a => a.status === 'Pending').length
    },
    {
      key: 'riders', label: 'Riders', icon: '🛵',
      count: (state.riders || []).filter(r => r.status === 'pending').length
    },
{ key: 'customers', label: 'Customers', icon: '👥' },
    { key: 'catalog', label: 'Catalog', icon: '📦' },
    {
      key: 'payments', label: 'Payments & Settlements', icon: '💳',
      count: (state.refunds || []).filter(r => r.status === 'requested').length + (state.withdrawals || []).filter(w => w.status === 'pending').length
    },
    {
      key: 'financial', label: 'Financial Resolution', icon: '⚖️',
      count: (state.cancellations || []).filter(c => c.stage === 'admin_resolution_required' || c.stage === 'reimbursement_failed').length +
             (state.automaticCutoffClaims || []).filter(c => c.status === 'admin_resolution_required' || c.status === 'failed').length
    },
    { key: 'reports', label: 'Reports / Activity', icon: '📋',
      count: (state.reports || []).filter(r => r.status === 'Open').length
    },
    { key: 'settings', label: 'Settings', icon: '⚙️' }
  ]; // array terminator (was missing — made the whole module fail to parse)
  return `<nav class="admin-nav" aria-label="Admin sections"><ul class="admin-nav__list">
    ${sections.map(s => `
      <li>
        <button type="button" class="admin-nav__item${adminSection === s.key ? ' is-active' : ''}" data-admin-nav="${s.key}"${adminSection === s.key ? ' aria-current="page"' : ''}>
          <span class="admin-nav__icon" aria-hidden="true">${s.icon}</span>
          <span class="admin-nav__label">${s.label}</span>
          ${s.count ? `<span class="admin-nav__count">${s.count}</span>` : ''}
        </button>
      </li>`).join('')}
  </ul></nav>`;
}

function renderAdminUtilitySection(key) {
  const labels = {
    ratings: ['Ratings', 'Monitor customer and rider feedback without altering historical ratings.'],
    notifications: ['Notifications', 'Review operational notifications and delivery alerts.'],
    'admin-management': ['Admin Management', 'Manage administrator access through Supabase Auth and MFA.'],
    'audit-logs': ['Audit Logs', 'Immutable operational history for sensitive admin activity.'],
    security: ['Security', 'Review MFA posture and protected financial operations.']
  };
  const [title, description] = labels[key] || ['Admin workspace', ''];
  return `<div class="page-head"><div><span class="badge badge--brand">Control center</span><h1 class="mt-1">${title}</h1><p class="muted">${description}</p></div></div><div class="card utility-panel"><div class="card__head"><h3>${title} workspace</h3><span class="badge badge--info">Protected</span></div><p class="muted">This workspace is ready for live records and keeps financial and order history intact. Use the existing operational sections for actions currently backed by Supabase.</p><div class="admin-actions"><button class="btn btn--soft" data-admin-nav="dashboard">Back to dashboard</button><button class="btn btn--ghost" data-admin-nav="settings">Review platform settings</button></div></div>`;
}
function renderAdminManagementWorkspace() {
  const q=(document.getElementById('adminUserSearch')?.value||'').toLowerCase(); const rows=(state.adminUsers||[]).filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
  return `<div class="page-head"><div><span class="badge badge--brand">Governance</span><h1 class="mt-1">Admin Management</h1><p class="muted">Read-only administrator roster. Role changes remain server-controlled.</p></div><button class="btn btn--soft" data-governance-refresh>Refresh</button></div><div class="card mt-2"><div class="toolbar"><input class="input" id="adminUserSearch" placeholder="Search admins"></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>MFA</th></tr></thead><tbody>${adminSupportTableState(rows,state.adminUsersLoading,state.adminUsersError,5,'No administrators found.')||rows.map(x=>`<tr><td>${escHtml(x.full_name||'—')}</td><td>${escHtml(x.email||'—')}</td><td>${escHtml(x.role)}</td><td>${x.created_at?formatDate(x.created_at):'—'}</td><td>Session MFA required for protected actions</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderAuditLogsWorkspace() {
  const q=(document.getElementById('auditSearch')?.value||'').toLowerCase(); const rows=(state.auditLogs||[]).filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));
  return `<div class="page-head"><div><span class="badge badge--brand">Governance</span><h1 class="mt-1">Audit Logs</h1><p class="muted">Immutable sensitive-action history. No edit, delete, or clear operation is available.</p></div><button class="btn btn--soft" data-governance-refresh>Refresh</button></div><div class="card mt-2"><div class="toolbar"><input class="input" id="auditSearch" placeholder="Search actor, action or entity"></div><div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>Before / After</th></tr></thead><tbody>${adminSupportTableState(rows,state.auditLogsLoading,state.auditLogsError,5,'No audit events found.')||rows.map(x=>`<tr data-audit-detail="${x.id}"><td>${x.created_at?formatDate(x.created_at):'—'}</td><td>${escHtml(x.admin_id)}</td><td>${escHtml(x.action)}</td><td>${escHtml(x.entity_type)} ${escHtml(x.entity_id||'')}</td><td><button class="link-btn" data-audit-view="${x.id}">View JSON</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderSecurityWorkspace() {
  const sensitive=(state.auditLogs||[]).filter(x=>/admin|suspend|maintenance|withdraw|refund|transfer|review|settings/i.test(`${x.action} ${x.entity_type}`)).slice(0,25);
  return `<div class="page-head"><div><span class="badge badge--brand">Security</span><h1 class="mt-1">Security Center</h1><p class="muted">Safe posture and recent sensitive activity.</p></div></div><div class="stats-grid mt-2"><div class="stat-card"><span>Current AAL</span><b>${escHtml(state.mfa.aal?.currentLevel||'unknown')}</b></div><div class="stat-card"><span>MFA enrolled</span><b>${state.mfa.factors.some(f=>f.status==='verified')?'Yes':'No'}</b></div></div><div class="card mt-2"><div class="card__head"><h3>Recent security-sensitive events</h3><button class="link-btn" data-admin-nav="audit-logs">Open audit logs</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead><tbody>${sensitive.length?sensitive.map(x=>`<tr><td>${x.created_at?formatDate(x.created_at):'—'}</td><td>${escHtml(x.action)}</td><td>${escHtml(x.entity_type)} ${escHtml(x.entity_id||'')}</td></tr>`).join(''):'<tr><td colspan="3" class="muted center">No security events found.</td></tr>'}</tbody></table></div></div><div class="card mt-2"><p class="muted">Session/device management and MFA secrets are not exposed or managed here. Paystack keys, tokens, passwords, and TOTP secrets remain unavailable to the panel.</p></div>`;
}
function paymentReconciliation(p) {
  const order = state.orders.find(o => o.dbId === p.order_id);
  if (!order) return '<span class="badge badge--danger">Order missing</span>';
  if (p.status === 'success' && order.payment_status && order.payment_status !== 'success') return '<span class="badge badge--danger">Payment/order mismatch</span>';
  return `<span class="badge badge--${p.status === 'failed' ? 'danger' : p.status === 'success' ? 'success' : 'warn'}">${escHtml(p.status)}</span>`;
}
function transferReconciliation(t) {
  const stale = ['pending','processing'].includes(t.status) && t.created_at && Date.now() - new Date(t.created_at).getTime() > 60 * 60 * 1000;
  return `<span class="badge badge--${['failed','reversed'].includes(t.status) ? 'danger' : stale ? 'warn' : t.status === 'success' ? 'success' : 'info'}">${stale ? 'Stuck ' : ''}${escHtml(t.status)}</span>`;
}
function withdrawalReconciliation(w) {
  const t = state.transfers.find(x => Number(x.withdrawal_request_id) === Number(w.id));
  if (['approved','paid'].includes(w.status) && !t) return '<span class="badge badge--danger">Transfer missing</span>';
  return withdrawalStatusBadge(w.status);
}
function settlementReconciliation(s) {
  const t = state.transfers.find(x => (s.kind === 'vendor' ? x.vendor_settlement_id : x.delivery_settlement_id) === s.id);
  if (s.status === 'pending' && t?.status === 'success') return '<span class="badge badge--danger">State mismatch</span>';
  return `<span class="badge badge--${t?.status === 'success' ? 'success' : t?.status === 'failed' ? 'danger' : 'warn'}">${escHtml(s.status)}</span>`;
}
function renderRefundWorkspace() { return `<div class="page-head"><div><span class="badge badge--brand">Finance</span><h1 class="mt-1">Refunds / Reimbursements</h1><p class="muted">Provider-authoritative refunds and reimbursement recovery.</p></div></div>${renderPaymentsSection()}`; }
function renderFinancialResolutionWorkspace() {
  const cases = [];
  state.transfers.filter(t => ['failed','reversed'].includes(t.status)).forEach(t => cases.push({ id:t.id, type:'Transfer', reason:t.status, target:'transfers' }));
  state.payments.filter(p => paymentReconciliation(p).includes('danger')).forEach(p => cases.push({ id:p.id, type:'Payment', reason:'payment/order mismatch', target:'payments' }));
  state.withdrawals.filter(w => withdrawalReconciliation(w).includes('danger')).forEach(w => cases.push({ id:w.id, type:'Withdrawal', reason:'transfer missing', target:'withdrawals' }));
  (state.cancellations || []).filter(c => ['admin_resolution_required','reimbursement_failed'].includes(c.stage)).forEach(c => cases.push({ id:c.id, type:'Reimbursement', reason:c.stage, target:'refunds' }));
  return `<div class="page-head"><div><span class="badge badge--brand">Finance</span><h1 class="mt-1">Financial Resolution</h1><p class="muted">Read-only exception queue. Use the linked workspace for supported recovery actions.</p></div><button class="btn btn--ghost btn--sm" data-finance-refresh>Refresh</button></div><div class="card"><div class="card__head"><h3>Exceptions requiring attention</h3><span class="muted small">${cases.length} detected</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Record</th><th>Reason</th><th>Workspace</th></tr></thead><tbody>${cases.length ? cases.map(c => `<tr><td>${escHtml(c.type)}</td><td>${escHtml(c.id)}</td><td><span class="badge badge--danger">${escHtml(c.reason)}</span></td><td><button class="link-btn" data-admin-nav="${c.target}">Open</button></td></tr>`).join('') : '<tr><td colspan="4" class="muted center">No financial exceptions detected.</td></tr>'}</tbody></table></div></div>`;
}
function renderFinanceWorkspace(kind) {
  const titles = { payments: 'Payments', settlements: 'Settlements', withdrawals: 'Withdrawals', transfers: 'Transfers', refunds: 'Refunds / Reimbursements', financial: 'Financial Resolution' };
  const title = titles[kind] || 'Finance';
  if (kind === 'refunds') return renderRefundWorkspace();
  if (kind === 'financial') return renderFinancialResolutionWorkspace();
  const source = kind === 'payments' ? state.payments : kind === 'withdrawals' ? state.withdrawals : kind === 'transfers' ? state.transfers : state.settlements;
  const query = financeFilter.query.toLowerCase();
  const rows = source.filter(row => {
    const text = JSON.stringify(row).toLowerCase();
    return (!query || text.includes(query)) && (financeFilter.status === 'all' || row.status === financeFilter.status);
  });
  const pageSize = 20, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  financeFilter.page = Math.min(financeFilter.page, pages);
  const visible = rows.slice((financeFilter.page - 1) * pageSize, financeFilter.page * pageSize);
  const cells = kind === 'payments' ? ['Payment', 'Order', 'Amount', 'State', 'Provider', 'Created'] : kind === 'withdrawals' ? ['Withdrawal', 'Rider', 'Amount', 'State', 'Transfer', 'Requested'] : kind === 'transfers' ? ['Transfer', 'Payee', 'Amount', 'State', 'Reference', 'Created'] : ['Settlement', 'Order', 'Payee', 'Amount', 'State', 'Transfer'];
  const body = visible.length ? visible.map(row => {
    if (kind === 'payments') return `<tr><td><b>${escHtml(row.reference)}</b><div class="muted small">${escHtml(row.id)}</div></td><td>${escHtml(state.orders.find(o => o.dbId === row.order_id)?.id || row.order_id)}</td><td>${money(row.amount)}</td><td>${escHtml(row.status)}</td><td>${escHtml(row.gateway)}</td><td>${formatDate(row.created_at)}</td></tr>`;
    if (kind === 'withdrawals') return `<tr><td>${row.id}</td><td>${escHtml(row.rider_id)}</td><td>${money(row.amount)}</td><td>${withdrawalStatusBadge(row.status)}</td><td>${escHtml((state.transfers.find(t => Number(t.withdrawal_request_id) === Number(row.id)) || {}).status || '—')}</td><td>${formatDate(row.requested_at)}</td></tr>`;
    if (kind === 'transfers') return `<tr><td>${escHtml(row.id)}</td><td>${escHtml(row.payee_type)}</td><td>${money(row.amount)}</td><td>${escHtml(row.status)}</td><td>${escHtml(row.paystack_reference)}</td><td>${formatDate(row.created_at)}</td></tr>`;
    return `<tr><td>${escHtml(row.id)}</td><td>${escHtml(state.orders.find(o => o.dbId === row.order_id)?.id || row.order_id)}</td><td>${escHtml(row.kind === 'vendor' ? row.vendor_id : row.rider_id)}</td><td>${money(row.authoritative_amount)}</td><td>${escHtml(row.status)}</td><td>${escHtml((state.transfers.find(t => (row.kind === 'vendor' ? t.vendor_settlement_id : t.delivery_settlement_id) === row.id) || {}).status || '—')}</td></tr>`;
  }).join('') : `<tr><td colspan="6" class="muted center">No ${title.toLowerCase()} match the current filters.</td></tr>`;
  const statuses = [...new Set(source.map(r => r.status).filter(Boolean))];
  return `<div class="page-head"><div><span class="badge badge--brand">Finance</span><h1 class="mt-1">${title}</h1><p class="muted">Server-authoritative financial records. No browser-side success marking.</p></div><button class="btn btn--ghost btn--sm" data-finance-refresh>Refresh</button></div><div class="card"><div class="admin-filters"><input class="input" data-finance-search placeholder="Search records" value="${escHtml(financeFilter.query)}"><select class="select" data-finance-status><option value="all">All statuses</option>${statuses.map(s => `<option value="${escHtml(s)}" ${financeFilter.status === s ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div class="admin-filters"><span class="muted small">${rows.length} records · page ${financeFilter.page} of ${pages}</span><div><button class="btn btn--ghost btn--sm" data-finance-page="prev" ${financeFilter.page <= 1 ? 'disabled' : ''}>Previous</button> <button class="btn btn--ghost btn--sm" data-finance-page="next" ${financeFilter.page >= pages ? 'disabled' : ''}>Next</button></div></div></div>${kind === 'payments' && state.paymentsError ? `<p class="orders-error">${escHtml(state.paymentsError)}</p>` : ''}`;
}
function renderAdminWorkspace() {
  if (!state.isAuthenticated) { renderLogin(); return; }
  const vendors = state.catalog ? state.catalog.vendors : [];
  const products = state.catalog ? state.catalog.products : [];
  const orders = state.orders;
  const riders = state.riders;

  // ---- Compute order statistics from the Supabase-sourced order set ----
  // These numbers are always derived from state.orders, which loadOrders()
  // populates exclusively from Supabase (never from localStorage).
  const totalOrders = orders.length;
  const activeOrders = orders.filter(isOrderActive).length;
  const completedOrders = orders.filter(isOrderCompleted).length;
  const cancelledOrders = orders.filter(isOrderCancelled).length;
  const orderValue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

  // ---- Apply the active client-side filter for the order table ----
  // Filtering is purely presentational — the source of truth is still the
  // full Supabase load in state.orders.
  const filteredOrders = applyOrderFilter(orders);

  // ---- Render ONLY the active section ----
  const shared = { vendors, products, orders, riders, totalOrders, activeOrders, completedOrders, cancelledOrders, orderValue, filteredOrders };
  let view;
  if (adminSection === 'dashboard') view = renderDashboardSection(shared);
  else if (adminSection === 'orders') view = renderOrdersSection(shared);
  else if (adminSection === 'deliveries') view = renderDeliveriesSection(shared);
  else if (adminSection === 'vendors') view = renderVendorsSection(shared);
  else if (adminSection === 'riders') view = renderRidersSection(shared);
  else if (adminSection === 'customers') view = renderCustomerOperationsSection(shared);
  else if (adminSection === 'restaurants') view = renderRestaurantOperationsSection(shared);
  else if (adminSection === 'products') view = renderCatalogSection(shared);
  else if (adminSection === 'categories') view = renderCategoriesOperationsSection(shared);
  else if (adminSection === 'catalog') view = renderCatalogSection(shared);
  else if (['payments', 'settlements', 'withdrawals', 'transfers', 'refunds', 'financial'].includes(adminSection)) view = renderFinanceWorkspace(adminSection);
  else if (['financial', 'refunds'].includes(adminSection)) view = renderFinancialSection(shared);
  else if (adminSection === 'reports') view = renderReportsWorkspace();
  else if (adminSection === 'ratings') view = renderRatingsWorkspace();
  else if (adminSection === 'notifications') view = renderNotificationsWorkspace();
  else if (adminSection === 'admin-management') view = renderAdminManagementWorkspace();
  else if (adminSection === 'audit-logs') view = renderAuditLogsWorkspace();
  else if (adminSection === 'security') view = renderSecurityWorkspace();
  else view = renderSettingsSection(shared);

  const app = $('#app');
  app.innerHTML = `
    ${adminNav()}
    <section class="section container">
      <div class="admin-layout">
        <aside class="admin-sidebar">${adminSidebar()}</aside>
        <div class="admin-content">
          ${view}
        </div>
      </div>
    </section>
  `;

  // Attach event listeners for the rendered section
  attachAdminEventListeners();
}

// ---------------------------------------------------------------------------
// Dashboard: overview + things requiring attention. No full management tables.
// ---------------------------------------------------------------------------
function renderDeliveriesSection({ orders, riders, vendors }) {
  const deliveryOrders = orders.filter(o => o.delivery_method !== 'vendor_self');
  const status = financeFilter.deliveryStatus || 'all';
  const query = financeFilter.deliveryQuery || '';
  const vendor = financeFilter.deliveryVendor || 'all';
  const rider = financeFilter.deliveryRider || 'all';
  const rows = deliveryOrders.filter(o => (!query || JSON.stringify(o).toLowerCase().includes(query.toLowerCase())) && (status === 'all' || o.status === status) && (vendor === 'all' || o.vendor_id === vendor) && (rider === 'all' || o.rider_id === rider));
  const pageSize = 20, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  financeFilter.deliveryPage = Math.min(financeFilter.deliveryPage || 1, pages);
  const visible = rows.slice((financeFilter.deliveryPage - 1) * pageSize, financeFilter.deliveryPage * pageSize);
  const stalled = o => ['Order confirmed','Rider assigned','Picked up','On the Way'].includes(o.status) && o.created && Date.now() - new Date(o.created).getTime() > 60 * 60 * 1000;
  return `<div class="page-head"><div><span class="badge badge--brand">Operations</span><h1 class="mt-1">Deliveries</h1><p class="muted">Order-backed delivery lifecycle. No duplicate delivery records are created.</p></div><button class="btn btn--ghost btn--sm" data-delivery-refresh>Refresh</button></div><div class="grid grid--stats"><div class="stat"><span class="stat__label">Awaiting rider</span><span class="stat__value">${deliveryOrders.filter(o => !o.rider_id && ['Order confirmed','Ready for pickup'].includes(o.status)).length}</span></div><div class="stat"><span class="stat__label">Active</span><span class="stat__value">${deliveryOrders.filter(o => ['Rider assigned','Picked up','On the Way'].includes(o.status)).length}</span></div><div class="stat"><span class="stat__label">Stalled</span><span class="stat__value">${deliveryOrders.filter(stalled).length}</span></div><div class="stat"><span class="stat__label">Delivered</span><span class="stat__value">${deliveryOrders.filter(o => ['Delivered','Rated'].includes(o.status)).length}</span></div></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-delivery-search placeholder="Search order, customer or location" value="${escHtml(query)}"><select class="select" data-delivery-status><option value="all">All statuses</option>${['Order confirmed','Ready for pickup','Rider assigned','Picked up','On the Way','Delivered','Rated','Cancelled'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select class="select" data-delivery-rider><option value="all">All riders</option>${riders.map(r => `<option value="${r.id}" ${rider === r.id ? 'selected' : ''}>${escHtml(r.full_name || r.matric_number || r.id)}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Pickup / delivery</th><th>Rider</th><th>Payment</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${visible.length ? visible.map(o => `<tr class="${stalled(o) ? 'report-row--open' : ''}"><td><b>#${escHtml(o.id)}</b></td><td>${escHtml(o.user_id || '—')}</td><td>${escHtml(o.spot || '—')}</td><td>${escHtml(o.rider_id || 'Awaiting rider')}</td><td>${escHtml(o.payment_status || 'unknown')}</td><td><span class="status-badge ${orderStatusClass(o.status)}">${escHtml(o.status)}${stalled(o) ? ' · stalled' : ''}</span></td><td>${formatDate(o.created)}</td><td><button class="link-btn" data-delivery-detail="${escHtml(o.dbId)}">Details</button>${!['Delivered','Rated','Cancelled'].includes(o.status) ? ` <button class="link-btn" data-assign-delivery="${escHtml(o.dbId)}">Assign</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="8" class="muted center">No deliveries match the current filters.</td></tr>'}</tbody></table></div><div class="admin-filters"><span class="muted small">${rows.length} deliveries · page ${financeFilter.deliveryPage} of ${pages}</span><button class="btn btn--ghost btn--sm" data-delivery-page="next" ${financeFilter.deliveryPage >= pages ? 'disabled' : ''}>Next</button></div></div>`;
}

function renderDashboardSection({ vendors, products, orders, riders, totalOrders, activeOrders, completedOrders, cancelledOrders, orderValue }) {
  const pendingNow = orders.filter(o => (o.status || 'Order confirmed') === 'Order confirmed').length;
  const attention = [
    { key: 'orders', icon: '🧾', label: 'Orders awaiting action', count: pendingNow },
    { key: 'vendors', icon: '🏪', label: 'Pending vendor applications', count: (state.vendorApplications || []).filter(a => a.status === 'Pending').length },
    { key: 'riders', icon: '🛵', label: 'Pending rider applications', count: (state.riders || []).filter(r => r.status === 'pending').length },
    { key: 'payments', icon: '💳', label: 'Refund requests to review', count: (state.refunds || []).filter(r => r.status === 'requested').length },
    { key: 'payments', icon: '💵', label: 'Withdrawal requests to review', count: (state.withdrawals || []).filter(w => w.status === 'pending').length },
    { key: 'reports', icon: '📋', label: 'Open issue reports', count: (state.reports || []).filter(r => r.status === 'Open').length }
  ];
  attention.push({ key: 'deliveries', icon: '!', label: 'Stalled deliveries', count: orders.filter(o => ['Rider assigned','Picked up','On the Way'].includes(o.status) && o.created && Date.now()-new Date(o.created).getTime()>60*60*1000).length });
  attention.push({ key: 'transfers', icon: '→', label: 'Failed or reversed transfers', count: (state.transfers||[]).filter(t=>['failed','reversed'].includes(t.status)).length });
  attention.push({ key: 'financial', icon: '⚖', label: 'Financial resolution required', count: (state.cancellations||[]).filter(c=>c.stage==='admin_resolution_required').length + (state.automaticCutoffClaims||[]).filter(c=>c.status==='admin_resolution_required').length });
  const waiting = attention.filter(a => a.count > 0);
  const recent = orders.slice(0, 5);
  const quickActions = [
    { key: 'orders', label: 'Manage orders' },
    { key: 'catalog', label: 'Products & catalog' },
    { key: 'vendors', label: 'Vendors & applications' },
    { key: 'riders', label: 'Riders & applications' },
    { key: 'payments', label: 'Refunds & withdrawals' },
    { key: 'reports', label: 'Issue reports' }
  ];
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Platform Control</span>
        <h1 class="mt-1">Admin Dashboard</h1>
        <p class="muted">High-level overview — open a section to manage it in detail.</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid--stats">
      <div class="stat stat--brand">
        <span class="stat__label">Total Orders</span>
        <span class="stat__value">${totalOrders}</span>
        <span class="stat__hint">${activeOrders} active · ${completedOrders} delivered</span>
      </div>
      <div class="stat">
        <span class="stat__label">Active Orders</span>
        <span class="stat__value">${activeOrders}</span>
        <span class="stat__hint">Pending, preparing, on the way…</span>
      </div>
      <div class="stat">
        <span class="stat__label">Delivered Orders</span>
        <span class="stat__value">${completedOrders}</span>
        <span class="stat__hint">Delivered or rated</span>
      </div>
      <div class="stat">
        <span class="stat__label">Cancelled Orders</span>
        <span class="stat__value">${cancelledOrders}</span>
        <span class="stat__hint">Cancelled by customer or admin</span>
      </div>
      <div class="stat">
        <span class="stat__label">Order Value</span>
        <span class="stat__value">${money(orderValue)}</span>
        <span class="stat__hint">Total value across all orders</span>
      </div>
      <div class="stat">
        <span class="stat__label">Vendors</span>
        <span class="stat__value">${vendors.length}</span>
        <span class="stat__hint">Visible on the marketplace</span>
      </div>
      <div class="stat">
        <span class="stat__label">Products</span>
        <span class="stat__value">${products.length}</span>
        <span class="stat__hint">Available menu items</span>
      </div>
      <div class="stat">
        <span class="stat__label">Riders</span>
        <span class="stat__value">${riders.length}</span>
        <span class="stat__hint">Registered rider applications</span>
      </div>
    </div>

    <div class="split mt-3">
      <div class="card">
        <div class="card__head">
          <h3>Needs attention</h3>
          <span class="muted small">Jump straight to pending work</span>
        </div>
        ${waiting.length
          ? waiting.map(a => `
            <button type="button" class="attention-row" data-admin-nav="${a.key}">
              <span class="attention-row__icon" aria-hidden="true">${a.icon}</span>
              <span class="attention-row__label">${a.label}</span>
              <span class="badge badge--warn">${a.count}</span>
            </button>`).join('')
          : '<p class="muted small mb-0">All caught up — nothing needs attention right now.</p>'}
      </div>
      <div class="card">
        <div class="card__head">
          <h3>Quick actions</h3>
          <span class="muted small">Open a management section</span>
        </div>
        <div class="admin-actions">
          ${quickActions.map(a => `<button type="button" class="btn btn--soft btn--block" data-admin-nav="${a.key}">${a.label}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="card mt-3">
      <div class="card__head"><h3>Rider Daily Bonuses</h3><span class="muted small">Server-awarded fifth-delivery bonuses</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Rider</th><th>Date</th><th>Amount</th><th>Reason</th><th>Created</th></tr></thead><tbody>${renderBonusRows()}</tbody></table></div>
    </div>

    <div class="card mt-3">
      <div class="card__head">
        <h3>Recent orders</h3>
        <span class="muted small">Latest ${recent.length} order${recent.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${recent.length
              ? recent.map(order => `
                <tr>
                  <td><b>#${order.id}</b></td>
                  <td class="muted small">${formatDate(order.created)}</td>
                  <td>${money(order.total)}</td>
                  <td><span class="status-badge ${orderStatusClass(order.status)}">${escHtml(order.status) || 'Order confirmed'}</span></td>
                </tr>`).join('')
              : '<tr><td colspan="4" class="muted center">No orders yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="mt-2">
        <button type="button" class="btn btn--ghost btn--sm" data-admin-nav="orders">View all orders →</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Orders: full order table + presentational status/date filters. Filter tabs
// only reference statuses that already exist (admin.js ORDER_STATUS_OPTIONS =
// the orders.status CHECK constraint in migration 20260901).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Homepage demo tracking control (migration 20261220_demo_tracking_sync.sql).
// Flags AT MOST ONE order as the public demo order behind the homepage waybill
// card. set_demo_tracking_order() is admin-only + AAL2-gated server-side, always
// clears the previous flag first, and accepts NULL/blank to clear — which drops
// the public card back into its explicitly labelled simulation mode. Only
// privacy-safe fields ever leave the database (order_number, status,
// delivery_method, rider_assigned, reported_at).
// ---------------------------------------------------------------------------
async function loadDemoTrackingStatusLine() {
  const state = currentAdminState();
  const el = document.getElementById('demoTrackCurrent');
  if (!el) return;
  if (!supabaseAvailable()) { el.textContent = 'Supabase unavailable.'; return; }
  try {
    const { data, error } = await supabase.rpc('get_demo_tracking_status');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    el.textContent = row && row.order_number
      ? `${row.order_number} — ${row.status}${row.rider_assigned ? ' (rider assigned)' : ''}`
      : 'none — the homepage card is in labelled simulation mode.';
  } catch (err) {
    el.textContent = 'could not read it — is migration 20261220_demo_tracking_sync applied?';
  }
}

async function setHomepageDemoOrder(orderNumber) {
  const state = currentAdminState();
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return; }
  const value = (orderNumber || '').trim();
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { data, error } = await supabase.rpc('set_demo_tracking_order', {
      p_order_number: value || null
    });
    if (error) throw error;
    toast(value
      ? `Homepage now follows ${data || value} (live rider status)`
      : 'Homepage demo cleared — card falls back to simulation');
    await loadDemoTrackingStatusLine();
  } catch (err) {
    toast(err.message || 'Could not update the homepage demo order', 'error');
  }
}

function renderOrdersSection({ filteredOrders, orders }) {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Operations</span>
        <h1 class="mt-1">Orders</h1>
        <p class="muted">All orders and status management.</p>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head">
        <h3>Homepage demo tracking</h3>
        <span class="muted small">Mirrors ONE real order on the public waybill card</span>
      </div>
      <div class="admin-filters">
        <div class="field" style="flex:1;min-width:200px;">
          <label for="demoTrackOrderInput">Order number</label>
          <input class="input input--sm" id="demoTrackOrderInput" placeholder="e.g. DZ-4417LG" autocomplete="off">
        </div>
        <button type="button" class="btn btn--sm" id="demoTrackSetBtn">Go live on homepage</button>
        <button type="button" class="btn btn--ghost btn--sm" id="demoTrackClearBtn">Clear (simulation)</button>
      </div>
      <p class="muted small mb-0">Currently live: <b id="demoTrackCurrent">Loading…</b></p>
      <p class="muted small mb-0">The public card shows status stages only — never GPS, customer names, locations or totals. AAL2/MFA required.</p>
    </div>

    <div class="card mt-2">
      <div class="card__head">
        <h3>Orders</h3>
        <span class="muted small">${filteredOrders.length} of ${orders.length} order${orders.length !== 1 ? 's' : ''}</span>
      </div>

      ${state.ordersError
        ? `<div class="orders-error">⚠ ${escHtml(state.ordersError)}</div>`
        : ''}

      <!-- Order Status Filters / Tabs -->
      <div class="admin-filters">
        <div class="filter-tabs">
          <button type="button" class="filter-tab ${orderFilter.status === 'all' ? 'is-active' : ''}" data-order-filter="all">All Orders</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'active' ? 'is-active' : ''}" data-order-filter="active">Active</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'Order confirmed' ? 'is-active' : ''}" data-order-filter="Order confirmed">Order confirmed</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'Preparing' ? 'is-active' : ''}" data-order-filter="Preparing">Preparing</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'Ready for pickup' ? 'is-active' : ''}" data-order-filter="Ready for pickup">Ready for pickup</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'On the Way' ? 'is-active' : ''}" data-order-filter="On the Way">On the Way</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'completed' ? 'is-active' : ''}" data-order-filter="completed">Completed</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'Delivered' ? 'is-active' : ''}" data-order-filter="Delivered">Delivered</button>
          <button type="button" class="filter-tab ${orderFilter.status === 'cancelled' ? 'is-active' : ''}" data-order-filter="cancelled">Cancelled</button>
        </div>
        <div class="filter-date">
          <label for="orderDateFrom" class="filter-date__label">From</label>
          <input type="date" class="input input--sm" id="orderDateFrom" value="${orderFilter.dateFrom}">
          <label for="orderDateTo" class="filter-date__label">To</label>
          <input type="date" class="input input--sm" id="orderDateTo" value="${orderFilter.dateTo}">
          <button type="button" class="btn btn--ghost btn--sm" data-order-filter-reset>Reset</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Items</th>
              <th>Delivery</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.ordersLoading
              ? '<tr><td colspan="7" class="muted center">Loading orders…</td></tr>'
              : filteredOrders.length
                ? filteredOrders.map(order => `
                  <tr>
                    <td><b>#${order.id}</b></td>
                    <td class="muted small">${formatDate(order.created)}</td>
                    <td>${(Array.isArray(order.items) ? order.items : []).map(item => `${escHtml(item.name)} × ${item.qty}`).join(', ') || '—'}</td>
                    <td>${escHtml(order.spot) || '—'}</td>
                    <td>${money(order.total)}</td>
                    <td>
                      <span class="status-badge ${orderStatusClass(order.status)}">${escHtml(order.status) || 'Order confirmed'}</span>
                    </td>
                    <td>
                      <select class="select select--sm" data-order-status="${order.id}">
                        ${ORDER_STATUS_OPTIONS.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                      </select>
                      <button class="link-btn" data-save-order-status="${order.id}">Save</button>
                      <button class="link-btn" data-feature-demo-order="${escHtml(order.id)}" title="Show this order's live status on the homepage waybill card">Homepage demo</button>
                    </td>
                  </tr>
                `).join('')
                : '<tr><td colspan="7" class="muted center">No orders match the current filters.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Vendors: vendor storefronts + applications.
// ---------------------------------------------------------------------------
function renderVendorOperationsSection({ vendors, products, orders }) {
  const q=financeFilter.vendorQuery||'', status=financeFilter.vendorStatus||'all'; const rows=vendors.filter(v=>(!q||JSON.stringify(v).toLowerCase().includes(q.toLowerCase()))&&(status==='all'||(v.open?'open':'closed')===status)); const page=financeFilter.vendorPage||1,size=20,pages=Math.max(1,Math.ceil(rows.length/size)),visible=rows.slice((page-1)*size,page*size);
  return `<div class="page-head"><div><span class="badge badge--brand">Marketplace</span><h1 class="mt-1">Vendors</h1><p class="muted">Vendor profiles, applications, catalog linkage and order activity.</p></div><button class="btn btn--ghost btn--sm" data-vendor-refresh>Refresh</button></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-vendor-search placeholder="Search vendors" value="${escHtml(q)}"><select class="select" data-vendor-status><option value="all">All storefronts</option><option value="open" ${status==='open'?'selected':''}>Open</option><option value="closed" ${status==='closed'?'selected':''}>Closed</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Vendor</th><th>Type</th><th>Store</th><th>Products</th><th>Active orders</th><th>Completed</th><th>Delivery</th><th></th></tr></thead><tbody>${visible.length?visible.map(v=>{const ps=products.filter(p=>p.vendor===v.id),os=orders.filter(o=>o.vendor_id===v.id);return `<tr><td><b>${escHtml(v.name)}</b><div class="muted small">${escHtml(v.id)}</div></td><td>${escHtml(v.type||'—')}</td><td>${v.open?'Open':'Closed'}</td><td>${ps.length}</td><td>${os.filter(o=>!['Delivered','Rated','Cancelled'].includes(o.status)).length}</td><td>${os.filter(o=>['Delivered','Rated'].includes(o.status)).length}</td><td>${escHtml(v.delivery_method||'rider')}</td><td><button class="link-btn" data-vendor-detail="${escHtml(v.id)}">Details</button></td></tr>`}).join(''):'<tr><td colspan="8" class="muted center">No vendors match these filters.</td></tr>'}</tbody></table></div><div class="admin-filters"><span class="muted small">Page ${page} of ${pages}</span><button class="btn btn--ghost btn--sm" data-vendor-page="next" ${page>=pages?'disabled':''}>Next</button></div></div><div class="card mt-2"><div class="card__head"><h3>Vendor applications</h3><span class="muted small">${state.vendorApplications.filter(a=>a.status==='Pending').length} pending</span></div><div class="table-wrap"><table class="table"><tbody>${renderVendorApplicationRows()}</tbody></table></div></div>`;
}
function renderRestaurantOperationsSection(shared) { return renderVendorOperationsSection({ ...shared, vendors: shared.vendors.filter(v=>/restaurant/i.test(v.type||'')) }); }

function renderVendorsSection({ vendors }) {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Marketplace</span>
        <h1 class="mt-1">Vendors</h1>
        <p class="muted">Vendor storefronts, applications, and approvals.</p>
      </div>
    </div>

    <div class="split mt-2">
      <!-- Add Vendor Form -->
      <form class="card stack" id="vendorForm">
        <div class="card__head">
          <h3 id="vendorFormTitle">Add Vendor</h3>
          <button class="link-btn" type="button" id="clearVendorForm">Clear</button>
        </div>
        <input type="hidden" name="id">
        <div class="form-grid">
          <div class="field">
            <label for="adminVendorName">Vendor Name</label>
            <input class="input" name="name" id="adminVendorName" required placeholder="e.g. Campus Pharmacy">
          </div>
          <div class="field">
            <label for="adminVendorType">Type</label>
            <input class="input" name="type" id="adminVendorType" required placeholder="e.g. Essentials">
          </div>
          <div class="field">
            <label for="adminVendorIcon">Icon</label>
            <input class="input" name="icon" id="adminVendorIcon" value="🏪" maxlength="8">
          </div>
          <div class="field">
            <label for="adminVendorTime">Delivery Time</label>
            <input class="input" name="time" id="adminVendorTime" value="15–25 min">
          </div>
          <div class="field">
            <label for="adminVendorRating">Rating</label>
            <input class="input" name="rating" id="adminVendorRating" type="number" min="0" max="5" step="0.1" value="4.5">
          </div>
          <div class="field">
            <label for="adminVendorCover">Cover Colour</label>
            <input class="input" name="cover" id="adminVendorCover" value="#d9f5e9" pattern="#[0-9a-fA-F]{6}">
          </div>
          <div class="field">
            <label for="adminVendorImage">Image URL (optional)</label>
            <input class="input" name="image" id="adminVendorImage" placeholder="https://… shown on vendor cards when set">
          </div>
          <div class="field">
            <label for="adminVendorHours">Opening Hours (optional)</label>
            <input class="input" name="opening_hours" id="adminVendorHours" placeholder="e.g. Mon–Fri 08:00–18:00, Sat 09:00–14:00">
          </div>
          <div class="field col-2">
            <label for="adminVendorDescription">Description (optional)</label>
            <textarea class="textarea" name="description" id="adminVendorDescription" placeholder="A short blurb shown on the vendor card."></textarea>
          </div>
          <div class="field">
            <label for="adminVendorDeliveryMethod">Delivery Method</label>
            <select class="select" name="delivery_method" id="adminVendorDeliveryMethod">
              <option value="rider">Rider (rider collects & delivers)</option>
              <option value="vendor_self">Vendor self-delivery</option>
              <option value="both">Both (vendor can choose)</option>
            </select>
          </div>
        </div>
        <label class="radio-card">
          <input name="open" type="checkbox" checked> Open for orders
        </label>
        <button class="btn btn--block" type="submit">Save Vendor</button>
      </form>

      <!-- Vendors Table -->
      <div class="card">
        <div class="card__head">
          <h3>Vendors</h3>
          <span class="muted small">Edit availability or details · changes appear across the customer pages instantly</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Type</th>
                <th>Time</th>
                <th>Delivery</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map(v => `
                <tr>
                  <td>${escHtml(v.icon)} <b>${escHtml(v.name)}</b></td>
                  <td>${escHtml(v.type)}</td>
                  <td>${escHtml(v.time)}</td>
                  <td>${escHtml(v.delivery_method || 'rider')}</td>
                  <td><button class="link-btn" data-toggle-vendor="${v.id}">${v.open ? 'Open' : 'Closed'}</button></td>
                  <td>
                    <button class="link-btn" data-edit-vendor="${v.id}">Edit</button> ·
                    <button class="link-btn" data-delete-vendor="${v.id}">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Vendor Applications Section (Become a Vendor → vendor_applications) -->
    <div class="card mt-3">
      <div class="card__head">
        <h3>Vendor Applications</h3>
        <span class="muted small">${state.vendorApplications.filter(a => a.status === 'Pending').length} pending · ${state.vendorApplications.length} total — approve creates their storefront &amp; grants vendor access</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Matric</th>
              <th>College / Dept</th>
              <th style="min-width:220px">What they want to sell</th>
              <th>Price range</th>
              <th>Status</th>
              <th>Applied</th>
              <th style="min-width:340px">Review</th>
            </tr>
          </thead>
          <tbody>
            ${renderVendorApplicationRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Riders: applications + active/suspended riders.
// ---------------------------------------------------------------------------
function renderRidersLegacySection() {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Fleet</span>
        <h1 class="mt-1">Riders</h1>
        <p class="muted">Rider applications, approvals, and suspensions.</p>
      </div>
    </div>

    <!-- Rider Applications Section -->
    <div class="card mt-2">
      <div class="card__head">
        <h3>Rider Applications</h3>
        <span class="muted small">Pending riders awaiting approval</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Matric Number</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Applied</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.riders.length ? state.riders.map(rider => {
              // Show only pending riders
              if (rider.status !== 'pending') return '';
              return `
              <tr>
                <td>${escHtml(rider.matric_number) || '—'}</td>
                <td>${escHtml(rider.phone) || '—'}</td>
                <td><span class="status--pending">Pending</span></td>
                <td>${rider.created_at ? rider.created_at.substring(0, 10) : '—'}</td>
                <td>
                  <button class="link-btn btn--danger" data-approve-rider="${rider.id}">Approve</button>
                  <button class="link-btn btn--danger" data-reject-rider="${rider.id}">Reject</button>
                </td>
              </tr>
              `;
            }).join('') : '<tr><td colspan="5" class="muted center">No pending rider applications.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Active Riders Section (approved) -->
    <div class="card mt-3">
      <div class="card__head">
        <h3>Active Riders</h3>
        <span class="muted small">Approved riders can be suspended; suspended riders can be reactivated with Unsuspend</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Matric Number</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.riders.length ? state.riders.map(rider => {
              // Show approved (active) and suspended riders (suspended ones are reactivated here)
              if (rider.status !== 'approved' && rider.status !== 'suspended') return '';
              const isSuspended = rider.status === 'suspended';
              return `
              <tr>
                <td>${escHtml(rider.matric_number) || '—'}</td>
                <td>${escHtml(rider.phone) || '—'}</td>
                <td><span class="status--${isSuspended ? 'cancelled' : 'approved'}">${isSuspended ? 'Suspended' : 'Approved'}</span></td>
                <td>
                  ${isSuspended
                    ? `<button class="link-btn" data-unsuspend-rider="${rider.id}">Unsuspend</button>`
                    : `<button class="link-btn btn--danger" data-suspend-rider="${rider.id}">Suspend</button>`}
                </td>
              </tr>
              `;
            }).join('') : '<tr><td colspan="4" class="muted center">No active or suspended riders.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRidersSection() {
  const q = financeFilter.riderQuery || '', status = financeFilter.riderStatus || 'all';
  const filtered = state.riders.filter(r => (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) && (status === 'all' || r.status === status));
  const page = financeFilter.riderPage || 1, size = 20, pages = Math.max(1, Math.ceil(filtered.length / size));
  const rows = filtered.slice((page - 1) * size, page * size);
  return `<div class="page-head"><div><span class="badge badge--brand">Fleet</span><h1 class="mt-1">Riders</h1><p class="muted">Authoritative rider status, availability, delivery activity and earnings.</p></div><button class="btn btn--ghost btn--sm" data-rider-refresh>Refresh</button></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-rider-search placeholder="Search rider" value="${escHtml(q)}"><select class="select" data-rider-status><option value="all">All statuses</option>${['pending','approved','suspended','rejected'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Rider</th><th>Status</th><th>Availability</th><th>Active</th><th>Completed</th><th>Rating</th><th>Gross</th><th>Available balance</th><th>Pending withdrawals</th><th></th></tr></thead><tbody>${rows.length ? rows.map(r => { const m=state.riderMetrics[r.id]||{}, e=m.earnings||{}; return `<tr><td><b>${escHtml(r.full_name || r.matric_number || r.id)}</b><div class="muted small">${escHtml(r.phone || '')}</div></td><td>${escHtml(r.status)}</td><td>${r.status === 'approved' ? (r.available ? 'Available' : 'Offline / busy') : '—'}</td><td>${m.active ?? '—'}</td><td>${m.completed ?? '—'}</td><td>${r.rating_avg ?? '—'} (${r.rating_count || 0})</td><td>${e.gross_earned != null ? money(e.gross_earned) : '—'}</td><td>${e.available_balance != null ? money(e.available_balance) : '—'}</td><td>${state.withdrawals.filter(w => w.rider_id === r.id && ['pending','approved'].includes(w.status)).length}</td><td><button class="link-btn" data-rider-detail="${r.id}">Details</button></td></tr>`; }).join('') : '<tr><td colspan="10" class="muted center">No riders match these filters.</td></tr>'}</tbody></table></div><div class="admin-filters"><span class="muted small">Page ${page} of ${pages}</span><button class="btn btn--ghost btn--sm" data-rider-page="next" ${page >= pages ? 'disabled' : ''}>Next</button></div></div>`;
}

// ---------------------------------------------------------------------------
// Customers: user accounts + vendor assignment (the existing account/role table).
// ---------------------------------------------------------------------------
function renderProductsOperationsSection({ vendors, products }) {
  const q=financeFilter.productQuery||'', vf=financeFilter.productVendor||'all', cf=financeFilter.productCategory||'all', af=financeFilter.productAvailability||'all';
  const rows=products.filter(p=>(!q||JSON.stringify(p).toLowerCase().includes(q.toLowerCase()))&&(vf==='all'||p.vendor===vf)&&(cf==='all'||p.category===cf)&&(af==='all'||(af==='active'?p.active:!p.active))); const page=financeFilter.productPage||1,size=20,pages=Math.max(1,Math.ceil(rows.length/size)),visible=rows.slice((page-1)*size,page*size); const categories=[...new Set(products.map(p=>p.category).filter(Boolean))];
  return `<div class="page-head"><div><span class="badge badge--brand">Catalog</span><h1 class="mt-1">Products</h1><p class="muted">Server-authoritative products. Historical order items are preserved.</p></div><button class="btn btn--ghost btn--sm" data-product-refresh>Refresh</button></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-product-search placeholder="Search products" value="${escHtml(q)}"><select class="select" data-product-vendor><option value="all">All vendors</option>${vendors.map(v=>`<option value="${escHtml(v.id)}" ${vf===v.id?'selected':''}>${escHtml(v.name)}</option>`).join('')}</select><select class="select" data-product-category><option value="all">All categories</option>${categories.map(c=>`<option value="${escHtml(c)}" ${cf===c?'selected':''}>${escHtml(c)}</option>`).join('')}</select><select class="select" data-product-availability><option value="all">All availability</option><option value="active" ${af==='active'?'selected':''}>Active</option><option value="inactive" ${af==='inactive'?'selected':''}>Deactivated</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Vendor</th><th>Category</th><th>Price</th><th>Availability</th><th>Image</th><th></th></tr></thead><tbody>${visible.length?visible.map(p=>`<tr><td><b>${escHtml(p.name)}</b></td><td>${escHtml(vendors.find(v=>v.id===p.vendor)?.name||p.vendor)}</td><td>${escHtml(p.category||'—')}</td><td>${money(p.price)}</td><td>${p.active===false?'Deactivated':'Active'}</td><td>${p.image?'Yes':'—'}</td><td><button class="link-btn" data-product-detail="${p.id}">Details</button></td></tr>`).join(''):'<tr><td colspan="7" class="muted center">No products match these filters.</td></tr>'}</tbody></table></div><div class="admin-filters"><span class="muted small">Page ${page} of ${pages}</span><button class="btn btn--ghost btn--sm" data-product-page="next" ${page>=pages?'disabled':''}>Next</button></div></div>`;
}
function renderCategoriesOperationsSection({ products }) { const q=financeFilter.categoryQuery||'', all=[...new Set(products.map(p=>p.category).filter(Boolean))].filter(c=>c.toLowerCase().includes(q.toLowerCase())), page=financeFilter.categoryPage||1,size=20,pages=Math.max(1,Math.ceil(all.length/size)); return `<div class="page-head"><div><span class="badge badge--brand">Catalog</span><h1 class="mt-1">Categories</h1><p class="muted">Categories remain product strings; no normalization migration was introduced.</p></div><button class="btn btn--ghost btn--sm" data-product-refresh>Refresh</button></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-category-search placeholder="Search categories" value="${escHtml(q)}"></div><div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th>Product count</th><th>Vendor usage</th><th>Visibility</th></tr></thead><tbody>${all.slice((page-1)*size,page*size).map(c=>{const ps=products.filter(p=>p.category===c);return `<tr><td><b>${escHtml(c)}</b></td><td>${ps.length}</td><td>${new Set(ps.map(p=>p.vendor)).size}</td><td>Supported through product availability</td></tr>`}).join('')||'<tr><td colspan="4" class="muted center">No categories found.</td></tr>'}</tbody></table></div></div>`; }
function renderCustomerOperationsSection({ orders }) { const q=financeFilter.customerQuery||'', rows=state.users.filter(u=>!q||JSON.stringify(u).toLowerCase().includes(q.toLowerCase())); const page=financeFilter.customerPage||1,size=20,pages=Math.max(1,Math.ceil(rows.length/size)); return `<div class="page-head"><div><span class="badge badge--brand">Accounts</span><h1 class="mt-1">Customers</h1><p class="muted">Read-only customer operations; order and financial history is preserved.</p></div><button class="btn btn--ghost btn--sm" data-customer-refresh>Refresh</button></div><div class="card mt-2"><div class="admin-filters"><input class="input" data-customer-search placeholder="Search name, email or phone" value="${escHtml(q)}"></div><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Active</th><th>Completed</th><th>Cancelled</th><th></th></tr></thead><tbody>${rows.slice((page-1)*size,page*size).map(u=>{const os=orders.filter(o=>o.user_id===u.id);return `<tr><td><b>${escHtml(u.full_name||u.id)}</b></td><td>${escHtml(u.email||'—')}</td><td>${escHtml(u.phone||'—')}</td><td>${os.length}</td><td>${os.filter(o=>!['Delivered','Rated','Cancelled'].includes(o.status)).length}</td><td>${os.filter(o=>['Delivered','Rated'].includes(o.status)).length}</td><td>${os.filter(o=>o.status==='Cancelled').length}</td><td><button class="link-btn" data-customer-detail="${u.id}">Details</button></td></tr>`}).join('')||'<tr><td colspan="8" class="muted center">No customers found.</td></tr>'}</tbody></table></div><div class="admin-filters"><span class="muted small">Page ${page} of ${pages}</span><button class="btn btn--ghost btn--sm" data-customer-page="next" ${page>=pages?'disabled':''}>Next</button></div></div>`; }

function renderCustomersSection({ vendors }) {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Accounts</span>
        <h1 class="mt-1">Customers</h1>
        <p class="muted">User accounts and vendor assignments.</p>
      </div>
    </div>

    <!-- Vendor Assignment Section (admin only) -->
    <div class="card mt-2">
      <div class="card__head">
        <h3>Customers &amp; Vendor Assignment</h3>
        <span class="muted small">Assign user accounts (role = user) to a vendor. Admin only.</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Current Vendor</th>
              <th style="min-width:200px">Assign to Vendor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.users.length ? state.users.map(user => {
              const current = user.vendor_id ? vendors.find(v => v.id === user.vendor_id) : null;
              return `
              <tr data-user-id="${user.id}">
                <td>${escHtml(user.full_name) || '—'}<div class="muted small">${escHtml(user.email) || ''}</div></td>
                <td>${current ? escHtml(current.name) : escHtml(user.vendor_id) || '—'}</td>
                <td>
                  <select class="select" name="vendor" data-user-vendor="${user.id}">
                    <option value="">(unassigned)</option>
                    ${vendors.map(v => `<option value="${escHtml(v.id)}" ${user.vendor_id === v.id ? 'selected' : ''}>${escHtml(v.name)}</option>`).join('')}
                  </select>
                </td>
                <td><button class="link-btn" data-assign-user="${user.id}">Assign</button></td>
              </tr>
              `;
            }).join('') : '<tr><td colspan="4" class="muted center">No users to assign.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Catalog: products + product creation/editing.
// ---------------------------------------------------------------------------
function renderCatalogSection({ vendors, products }) {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Catalog</span>
        <h1 class="mt-1">Catalog</h1>
        <p class="muted">Product items available across the marketplace — changes are saved instantly and appear across the customer pages.</p>
      </div>
    </div>

    <div class="split mt-2">
      <!-- Add Product Form -->
      <form class="card stack" id="productForm">
        <div class="card__head">
          <h3 id="productFormTitle">Add Product</h3>
          <button class="link-btn" type="button" id="clearProductForm">Clear</button>
        </div>
        <input type="hidden" name="id">
        <div class="form-grid">
          <div class="field">
            <label for="adminProductName">Product Name</label>
            <input class="input" name="name" id="adminProductName" required placeholder="e.g. Meat pie">
          </div>
          <div class="field">
            <label for="adminProductVendor">Vendor</label>
            <select class="select" name="vendor" id="adminProductVendor" required>
              ${vendors.map(v => `<option value="${escHtml(v.id)}">${escHtml(v.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="adminProductPrice">Price (₦)</label>
            <input class="input" name="price" id="adminProductPrice" required min="0" type="number" placeholder="1000">
          </div>
          <div class="field">
            <label for="adminProductCategory">Category</label>
            <input class="input" name="category" id="adminProductCategory" required placeholder="Food">
          </div>
          <div class="field">
            <label for="adminProductIcon">Icon</label>
            <input class="input" name="icon" id="adminProductIcon" value="🍽️" maxlength="8">
          </div>
          <div class="field col-2">
            <label for="adminProductImage">Image URL (optional)</label>
            <input class="input" name="image" id="adminProductImage" placeholder="https://… shown on product cards when set">
          </div>
          <div class="field col-2">
            <label for="adminProductDesc">Description</label>
            <textarea class="textarea" name="desc" id="adminProductDesc" required placeholder="A short description for customers."></textarea>
          </div>
        </div>
        <button class="btn btn--block" type="submit">Save Product</button>
      </form>

      <!-- Products Table -->
      <div class="card">
        <div class="card__head">
          <h3>Products</h3>
          <span class="muted small">${products.length} live items</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${products.map(p => {
                const vendor = vendors.find(v => v.id === p.vendor);
                return `
                  <tr>
                    <td>${escHtml(p.icon)} <b>${escHtml(p.name)}</b></td>
                    <td>${vendor ? escHtml(vendor.name) : '—'}</td>
                    <td>${escHtml(p.category)}</td>
                    <td>${money(p.price)}</td>
                    <td>
                      <button class="link-btn" data-edit-product="${p.id}">Edit</button> ·
                      <button class="link-btn" data-delete-product="${p.id}">Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Payments & Settlements: refunds + rider withdrawals (financial reviews).
// ---------------------------------------------------------------------------
function renderPaymentsSection() {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Finance</span>
        <h1 class="mt-1">Payments &amp; Settlements</h1>
        <p class="muted">Refunds, settlements, and secure payout execution.</p>
      </div>
    </div>

    <div class="card mt-3">
      <div class="card__head"><h3>Settlements &amp; transfers</h3><span class="muted small">Amounts and recipients are read-only from server ledgers.</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Payee</th><th>Order</th><th>Amount</th><th>Settlement</th><th>Transfer</th><th>Action</th></tr></thead><tbody>${renderSettlementRows()}</tbody></table></div>
    </div>

    <!-- Refund Management Section -->
    <div class="card mt-2">
      <div class="card__head">
        <h3>Refund Requests</h3>
        <span class="muted small">Review, approve/reject, and execute refunds</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Refund ID</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Requested</th>
              <th>Approve</th>
              <th>Reject</th>
              <th>Execute</th>
            </tr>
          </thead>
          <tbody>
            ${renderRefundRows()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Withdrawal Requests Section (admin review only) -->
    <div class="card mt-3">
      <div class="card__head">
        <h3>Rider Withdrawal Requests</h3>
        <span class="muted small">Pending / admin-reviewed records only — no money moves in-app</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
                            <th>Rider</th>
              <th>Amount</th>
              <th>Bank account</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Reviewed</th>
              <th style="min-width:320px">Review</th>
            </tr>
          </thead>
          <tbody>
            ${renderWithdrawalRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadSettlementsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) return null;
  state.settlementsLoading = true; state.settlementsError = null;
  try {
    const [v, d, t, b] = await Promise.all([
      supabase.from('vendor_settlements').select('id,order_id,vendor_id,amount,status,created_at').order('created_at', { ascending: false }),
      supabase.from('delivery_settlements').select('id,order_id,rider_id,delivery_fee,rider_amount,platform_amount,status,created_at').order('created_at', { ascending: false }),
      supabase.from('transfers').select('id,vendor_settlement_id,delivery_settlement_id,withdrawal_request_id,payee_type,amount,currency,status,paystack_reference,created_at').order('created_at', { ascending: false }),
      supabase.from('rider_daily_bonuses').select('id,rider_id,qualifying_date,amount,bonus_type,reason,created_at').order('qualifying_date', { ascending: false })
    ]);
    if (v.error) throw v.error; if (d.error) throw d.error; if (t.error) throw t.error; if (b.error) throw b.error;
    state.settlements = [...(v.data || []).map(x => ({ ...x, kind: 'vendor', authoritative_amount: Number(x.amount) })), ...(d.data || []).map(x => ({ ...x, kind: 'rider', authoritative_amount: Number(x.rider_amount) }))];
    state.transfers = t.data || []; state.bonuses = b.data || []; state.settlementsLoading = false; return state.settlements;
  } catch (err) { state.settlementsLoading = false; state.settlementsError = err.message || 'Load failed'; state.settlements = []; state.transfers = []; return null; }
}

function renderBonusRows() {
  if (!state.bonuses.length) return '<tr><td colspan="5" class="muted center">No rider bonuses awarded yet.</td></tr>';
  return state.bonuses.map(b => `<tr><td>${escHtml(b.rider_id)}</td><td>${escHtml(b.qualifying_date)}</td><td>${money(b.amount)}</td><td>${escHtml(b.reason || b.bonus_type)}</td><td>${b.created_at ? new Date(b.created_at).toLocaleString('en-NG') : '—'}</td></tr>`).join('');
}

function renderSettlementRows() {
  if (state.settlementsLoading) return '<tr><td colspan="6" class="muted center">Loading settlements…</td></tr>';
  if (state.settlementsError) return `<tr><td colspan="6" class="muted center">Could not load settlements: ${escHtml(state.settlementsError)}</td></tr>`;
  if (!state.settlements.length) return '<tr><td colspan="6" class="muted center">No settlements generated yet.</td></tr>';
  return state.settlements.map(s => {
    const tr = state.transfers.find(x => (s.kind === 'vendor' ? x.vendor_settlement_id : x.delivery_settlement_id) === s.id);
    const order = state.orders.find(o => o.dbId === s.order_id || o.id === s.order_id);
    const eligible = s.status === 'pending' && order && order.status === 'Delivered';
    const hasTransfer = !!tr;
    const transferStatus = tr ? escHtml(tr.status) : 'No transfer';
    let actionHtml = '—';
    if (tr) {
      if (tr.status === 'pending') {
        actionHtml = `<button class="link-btn" data-execute-transfer="${tr.id}">Execute</button>`;
      } else if (tr.status === 'processing') {
        actionHtml = `<span class="badge badge--info">Processing</span>`;
      } else if (tr.status === 'success') {
        actionHtml = `<span class="badge badge--success">Paid</span>`;
      } else if (tr.status === 'failed') {
        actionHtml = `<span class="badge badge--danger">Failed</span> <button class="link-btn" data-prepare-settlement-transfer="${s.id}" data-settlement-kind="${s.kind}">Retry</button>`;
      } else if (tr.status === 'reversed') {
        actionHtml = `<span class="badge badge--warn">Reversed</span>`;
      }
    } else if (eligible) {
      actionHtml = `<button class="link-btn" data-prepare-settlement-transfer="${s.id}" data-settlement-kind="${s.kind}">Prepare Transfer</button>`;
    }
    return `<tr><td>${s.kind === 'vendor' ? `Vendor ${escHtml(s.vendor_id)}` : `Rider ${escHtml(s.rider_id || '—')}`}</td><td>${escHtml(order?.order_number || s.order_id)}</td><td>${money(s.authoritative_amount)}</td><td>${escHtml(s.status)}</td><td>${transferStatus}</td><td>${actionHtml}</td></tr>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Financial Resolution: cancellations & cutoff claims requiring admin review.
// ---------------------------------------------------------------------------
function renderFinancialSection() {
  const cancellations = (state.cancellations || []).filter(c =>
    c.stage === 'admin_resolution_required' || c.stage === 'reimbursement_failed'
  );
  const cutoffClaims = (state.automaticCutoffClaims || []).filter(c =>
    c.status === 'admin_resolution_required' || c.status === 'failed'
  );

  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Finance</span>
        <h1 class="mt-1">Financial Resolution</h1>
        <p class="muted">Cancellations and cutoff claims requiring admin review or action.</      </div>
    </div>

    <div class="card mt-3">
      <div class="card__head"><h3>Cancellations Requiring Resolution</h3><span class="muted small">${cancellations.length} items</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Stage</th><th>Failure Reason</th><th>Created</th><th>Action</th></tr></thead><tbody>${renderCancellationResolutionRows(cancellations)}</tbody></table></div>
    </div>

    <div class="card mt-3">
      <div class="card__head"><h3>Automatic 8 PM Cutoff Claims Requiring Resolution</h3><span class="muted small">${cutoffClaims.length} items</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Error</th><th>Created</th><th>Action</th></tr></thead><tbody>${renderCutoffResolutionRows(cutoffClaims)}</tbody></table></div>
    </div>
  `;
}

function renderCancellationResolutionRows(cancellations) {
  if (!cancellations.length) return '<tr><td colspan="7" class="muted center">No cancellations requiring resolution.</td></tr>';
  return cancellations.map(c => {
    const order = state.orders.find(o => o.id === c.order_id);
    const customer = order ? (order.user || 'Unknown') : 'Unknown';
    return `
      <tr data-cancellation-id="${c.id}">
        <td>${c.order_id?.slice(0, 8)}...</td>
        <td>${escHtml(customer)}</td>
        <td>${money(c.reimbursement_amount || 0)}</td>
        <td><span class="badge badge--warn">${escHtml(c.stage)}</span></td>
        <td class="muted small">${escHtml(c.reimbursement_failure_reason || '—')}</td>
        <td class="muted small">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>
          <button class="link-btn" data-review-cancellation="${c.id}">Review</button>
        </td>
      </tr>`;
  }).join('');
}

function renderCutoffResolutionRows(claims) {
  if (!claims.length) return '<tr><td colspan="7" class="muted center">No cutoff claims requiring resolution.</td></tr>';
  return claims.map(c => {
    const order = state.orders.find(o => o.id === c.order_id);
    const customer = order ? (order.user || 'Unknown') : 'Unknown';
    return `
      <tr data-claim-id="${c.id}">
        <td>${c.order_id?.slice(0, 8)}...</td>
        <td>${escHtml(customer)}</td>
        <td>${money(c.reimbursement_amount || 0)}</td>
        <td><span class="badge badge--danger">${escHtml(c.status)}</span></td>
        <td class="muted small">${escHtml(c.last_error || '—')}</td>
        <td class="muted small">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>
          <button class="link-btn" data-retry-cutoff="${c.id}">Retry Reimbursement</button>
        </td>
      </tr>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Reports / Activity: customer issue reports.
// ---------------------------------------------------------------------------
async function loadRatingsFromSupabase() {
  const s = currentAdminState(); s.ratingsLoading = true; s.ratingsError = null;
  try { const { data, error } = await supabase.from('rider_ratings').select('*').order('created_at', { ascending: false }); if (error) throw error; s.ratings = data || []; }
  catch (e) { s.ratings = []; s.ratingsError = e.message || 'Load failed'; }
  s.ratingsLoading = false;
}

async function loadNotificationsFromSupabase() {
  const s = currentAdminState(); s.notificationsLoading = true; s.notificationsError = null;
  try { const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }); if (error) throw error; s.notifications = data || []; }
  catch (e) { s.notifications = []; s.notificationsError = e.message || 'Load failed'; }
  s.notificationsLoading = false;
}

function adminSupportTableState(items, loading, error, colspan, empty) {
  if (loading && !items.length) return `<tr><td colspan="${colspan}" class="muted center">Loading…</td></tr>`;
  if (error) return `<tr><td colspan="${colspan}" class="muted center">${escHtml(error)} <button class="link-btn" data-admin-refresh="${adminSection}">Refresh</button></td></tr>`;
  if (!items.length) return `<tr><td colspan="${colspan}" class="muted center">${empty}</td></tr>`;
  return null;
}

function renderRatingsWorkspace() {
  const rows = state.ratings || [], avg = rows.length ? (rows.reduce((n, r) => n + Number(r.rating || 0), 0) / rows.length).toFixed(2) : '—';
  return `<div class="page-head"><div><span class="badge badge--brand">Quality</span><h1 class="mt-1">Ratings</h1><p class="muted">Authoritative rider ratings. Ratings are preserved and read-only.</p></div><button class="btn btn--soft" data-admin-refresh="ratings">Refresh</button></div>
    <div class="stats-grid mt-2"><div class="stat-card"><span>Total ratings</span><b>${rows.length}</b></div><div class="stat-card"><span>Average score</span><b>${avg}</b></div></div>
    <div class="card mt-2"><div class="toolbar"><input class="input" id="ratingSearch" placeholder="Search review, order or rider ID"><select class="select" id="ratingFilter"><option value="all">All scores</option>${[5,4,3,2,1].map(n=>`<option value="${n}">${n} stars</option>`).join('')}</select></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Score</th><th>Review</th><th>Order</th><th>Rider</th><th>Customer</th><th>Date</th></tr></thead><tbody>${(()=>{const q=(document.getElementById('ratingSearch')?.value||'').toLowerCase(), f=document.getElementById('ratingFilter')?.value||'all'; const a=rows.filter(r=>(f==='all'||String(r.rating)===f)&&(!q||JSON.stringify(r).toLowerCase().includes(q))); const empty=adminSupportTableState(a,state.ratingsLoading,state.ratingsError,6,'No ratings found.'); return empty||a.map(r=>`<tr data-rating-detail="${r.id}"><td><b>${escHtml(String(r.rating))}/5</b></td><td>${escHtml(r.review||'—')}</td><td>${escHtml((r.order_id||'').slice(0,8)||'—')}</td><td>${escHtml((r.rider_id||'').slice(0,8)||'—')}</td><td>${escHtml((r.reviewer_id||'').slice(0,8)||'—')}</td><td>${r.created_at?formatDate(r.created_at):'—'}</td></tr>`).join('')})()}</tbody></table></div></div>`;
}

function renderReportsWorkspace() {
  const rows = state.reports || [];
  return `<div class="page-head"><div><span class="badge badge--brand">Support</span><h1 class="mt-1">Reports & Support</h1><p class="muted">Review customer reports with audited, AAL2-protected status changes.</p></div><button class="btn btn--soft" data-admin-refresh="reports">Refresh</button></div>
    <div class="card mt-2"><div class="toolbar"><input class="input" id="supportSearch" placeholder="Search reports, customers or orders"><select class="select" id="supportStatus"><option value="all">All statuses</option>${REPORT_STATUS_OPTIONS.map(x=>`<option>${x}</option>`).join('')}</select><select class="select" id="supportType"><option value="all">All types</option>${[...new Set(rows.map(r=>r.subject).filter(Boolean))].map(x=>`<option>${escHtml(x)}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>Report</th><th>Reporter</th><th>Type</th><th>Order</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${(()=>{const q=(document.getElementById('supportSearch')?.value||'').toLowerCase(), s=document.getElementById('supportStatus')?.value||'all', t=document.getElementById('supportType')?.value||'all'; const a=rows.filter(r=>(s==='all'||r.status===s)&&(t==='all'||r.subject===t)&&(!q||JSON.stringify(r).toLowerCase().includes(q))); const empty=adminSupportTableState(a,state.reportsLoading,state.reportsError,7,'No reports found.'); return empty||a.map(r=>`<tr data-report-row="${r.id}"><td>${escHtml(r.id.slice(0,8))}…</td><td>${escHtml(r.reporter_name||r.reporter_email||r.user_id||'Unknown')}</td><td>${escHtml(r.subject)}</td><td>${escHtml(r.order_number||'—')}</td><td>${escHtml(r.status)}</td><td>${r.created_at?formatDate(r.created_at):'—'}</td><td><button class="link-btn" data-report-detail="${r.id}">View</button><button class="link-btn" data-review-report="${r.id}">Review</button></td></tr>`).join('')})()}</tbody></table></div></div>`;
}

function renderNotificationsWorkspace() {
  const rows = state.notifications || [];
  return `<div class="page-head"><div><span class="badge badge--brand">System</span><h1 class="mt-1">Notifications</h1><p class="muted">Server-generated in-app notifications. Email, SMS and push are not integrated.</p></div><button class="btn btn--soft" data-admin-refresh="notifications">Refresh</button></div>
    <div class="card mt-2"><div class="toolbar"><input class="input" id="notificationSearch" placeholder="Search title, message or recipient"><select class="select" id="notificationType"><option value="all">All types</option>${[...new Set(rows.map(r=>r.type).filter(Boolean))].map(x=>`<option>${escHtml(x)}</option>`).join('')}</select><select class="select" id="notificationAudience"><option value="all">All recipients</option><option value="read">Read</option><option value="unread">Unread</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Message</th><th>Recipient</th><th>Type</th><th>State</th><th>Created</th></tr></thead><tbody>${(()=>{const q=(document.getElementById('notificationSearch')?.value||'').toLowerCase(), t=document.getElementById('notificationType')?.value||'all', a=document.getElementById('notificationAudience')?.value||'all'; const x=rows.filter(r=>(t==='all'||r.type===t)&&(a==='all'||(a==='read'?r.is_read:!r.is_read))&&(!q||JSON.stringify(r).toLowerCase().includes(q))); const empty=adminSupportTableState(x,state.notificationsLoading,state.notificationsError,6,'No notifications found.'); return empty||x.map(r=>`<tr data-notification-detail="${r.id}"><td>${escHtml(r.title)}</td><td>${escHtml(r.message)}</td><td>${escHtml((r.user_id||'').slice(0,8)||'—')}</td><td>${escHtml(r.type)}</td><td>${r.is_read?'Read':'Unread'}</td><td>${r.created_at?formatDate(r.created_at):'—'}</td></tr>`).join('')})()}</tbody></table></div></div>`;
}

function renderReportsSection() {
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">Support</span>
        <h1 class="mt-1">Reports / Activity</h1>
        <p class="muted">Customer issue reports and admin responses.</p>
      </div>
    </div>

    <!-- Issue Reports Section (customer "Report an Issue") -->
    <div class="card mt-2">
      <div class="card__head">
        <h3>Issue Reports</h3>
        <span class="muted small">${state.reports.filter(r => r.status === 'Open').length} open · ${state.reports.length} total — change status or add a response</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Subject</th>
              <th style="min-width:260px">Description</th>
              <th>Order</th>
              <th>Submitted</th>
              <th>Status</th>
              <th style="min-width:360px">Review</th>
            </tr>
          </thead>
          <tbody>
            ${renderReportRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Settings: read-only platform configuration (display only — no writes).
// ---------------------------------------------------------------------------
function renderSettingsSection({ vendors, orders }) {
  const deliveryFees = [...new Set((orders || []).map(o => o.fee).filter(Boolean))];
  const deliveryMethods = [...new Set((vendors || []).map(v => v.delivery_method || 'rider'))];
  const rows = [
    { k: 'Order statuses (admin editable)', v: ORDER_STATUS_OPTIONS.join(' · ') },
    { k: 'Completed (terminal) statuses', v: COMPLETED_STATUSES.join(' · ') || '—' },
    { k: 'Cancelled status', v: CANCELLED_STATUS },
    { k: 'Delivery fee values (from loaded orders)', v: deliveryFees.map(f => money(f)).join(' · ') || '—' },
    { k: 'Vendor delivery methods in use', v: deliveryMethods.join(' · ') || '—' },
    { k: 'Weekday delivery hours', v: state.siteSettings ? `${state.siteSettings.weekday_delivery_start || '—'} – ${state.siteSettings.weekday_delivery_end || '—'}` : '—' },
    { k: 'Weekend delivery hours', v: state.siteSettings ? `${state.siteSettings.weekend_delivery_start || '—'} – ${state.siteSettings.weekend_delivery_end || '—'}` : '—' },
    { k: 'Timezone', v: state.siteSettings?.timezone || '—' }
  ];
  return `
    <div class="page-head">
      <div>
        <span class="badge badge--brand">System</span>
        <h1 class="mt-1">Settings</h1>
        <p class="muted">Authoritative platform settings. Sensitive changes require admin AAL2.</p>
      </div>
    </div>

    <div class="card mt-2">
      <div class="card__head"><h3>Admin Security</h3><span class="badge badge--${state.mfa.aal?.currentLevel === 'aal2' ? 'success' : 'warn'}">${state.mfa.aal?.currentLevel === 'aal2' ? 'AAL2' : 'AAL1'}</span></div>
      <p class="muted">Authenticator MFA is required for protected admin writes.</p>
      <p><b>${state.mfa.factors.some(f => f.status === 'verified') ? 'MFA enrolled' : 'MFA not enrolled'}</b> · Current session: ${escHtml(state.mfa.aal?.currentLevel || 'unknown')}</p>
      ${state.mfa.error ? `<p class="muted">${escHtml(state.mfa.error)}</p>` : ''}
      ${state.mfa.enrollment ? `<div class="card mt-1"><p>Scan this QR code with your authenticator app:</p><img src="${escHtml(state.mfa.enrollment.totp.qr_code)}" alt="Admin MFA QR code" style="max-width:220px"><p class="small">Manual secret: <code>${escHtml(state.mfa.enrollment.totp.secret)}</code></p><form id="adminMfaVerifyForm" class="row row--wrap" style="gap:8px"><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit code" required><button class="btn" type="submit">Verify authenticator</button></form></div>` : state.mfa.factors.some(f => f.status === 'verified') ? '<p class="muted">A verified authenticator is enrolled.</p>' : '<button class="btn btn--soft" id="adminMfaEnrollBtn" type="button">Set up authenticator</button>'}
    </div>
    <div class="card mt-2">
      <div class="card__head">
        <h3>Maintenance Mode</h3>
        <span class="muted small">${state.siteSettingsLoading ? 'Loading current value…' : state.siteSettingsError ? 'Unable to load current value' : 'Global platform access control'}</span>
      </div>
      ${state.siteSettingsError
        ? `<p class="muted">${escHtml(state.siteSettingsError)}</p>`
        : `<label class="settings-row" for="maintenanceModeToggle">
            <span>
              <span class="settings-row__label">Maintenance Mode</span>
              <span class="muted small">When enabled, customers, vendors and riders will be unable to access the platform. Admin access remains available.</span>
            </span>
            <input type="checkbox" id="maintenanceModeToggle" role="switch"${state.siteSettings?.maintenance_mode ? ' checked' : ''}${state.siteSettingsLoading ? ' disabled' : ''}>
          </label>`}
    </div>

    <div class="card mt-2">
      <div class="card__head">
        <h3>Platform configuration</h3>
        <span class="muted small">Display only — configuration lives in the application code and database; no runtime-editable settings exist.</span>
      </div>
      <form id="siteSettingsForm" class="form-grid mb-2">
        <div class="field"><label for="settingsWeekdayStart">Weekday opening time</label><input class="input" id="settingsWeekdayStart" name="weekday_delivery_start" type="time" value="${escHtml((state.siteSettings?.weekday_delivery_start || '').slice(0,5))}" required></div>
        <div class="field"><label for="settingsWeekdayEnd">Weekday closing time</label><input class="input" id="settingsWeekdayEnd" name="weekday_delivery_end" type="time" value="${escHtml((state.siteSettings?.weekday_delivery_end || '').slice(0,5))}" required></div>
        <div class="field"><label for="settingsWeekendStart">Weekend opening time</label><input class="input" id="settingsWeekendStart" name="weekend_delivery_start" type="time" value="${escHtml((state.siteSettings?.weekend_delivery_start || '').slice(0,5))}" required></div>
        <div class="field"><label for="settingsWeekendEnd">Weekend closing time</label><input class="input" id="settingsWeekendEnd" name="weekend_delivery_end" type="time" value="${escHtml((state.siteSettings?.weekend_delivery_end || '').slice(0,5))}" required></div>
        <div class="field"><label for="settingsTimezone">Timezone</label><input class="input" id="settingsTimezone" name="timezone" value="${escHtml(state.siteSettings?.timezone || 'Africa/Lagos')}" required></div>
        <label class="radio-card"><input name="maintenance_mode" type="checkbox"${state.siteSettings?.maintenance_mode ? ' checked' : ''}> Maintenance mode enabled</label>
        <div class="admin-actions col-2"><button class="btn" type="submit">Save Changes</button><button class="btn btn--ghost" type="button" data-settings-cancel>Cancel</button></div>
      </form>
      <dl class="settings-list">
        ${rows.map(r => `<div class="settings-row"><dt>${r.k}</dt><dd>${r.v}</dd></div>`).join('')}
      </dl>
    </div>
  `;
}

function showAdminSupportDetail(title, record) {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal finance-detail-drawer" role="dialog" aria-modal="true"><div class="modal__head"><h3>${escHtml(title)} detail</h3><button class="icon-btn" data-close-modal>×</button></div><div class="modal__body"><dl class="detail-list">${Object.entries(record).map(([k,v])=>`<div><dt>${escHtml(k.replaceAll('_',' '))}</dt><dd>${escHtml(v == null || v === '' ? '—' : String(v))}</dd></div>`).join('')}</dl></div></div></div>`;
  root.querySelectorAll('[data-close-modal]').forEach(x => x.addEventListener('click', e => { if (e.target === x || x.matches('button')) root.innerHTML = ''; }));
}

function attachAdminEventListeners() {
  document.querySelector('[data-admin-menu]')?.addEventListener('click', e => { const nav=document.getElementById('adminNav'); const open=nav?.classList.toggle('is-open'); e.currentTarget.setAttribute('aria-expanded', String(Boolean(open))); });
  document.querySelectorAll('[data-governance-refresh]').forEach(btn => btn.addEventListener('click', async () => { await loadSiteSettingsFromSupabase(); await loadGovernanceData(); renderAdminWorkspace(); }));
  ['adminUserSearch','auditSearch'].forEach(id => { const el=document.getElementById(id); if(el) el.addEventListener('input',()=>renderAdminWorkspace()); });
  document.querySelectorAll('[data-audit-view]').forEach(btn => btn.addEventListener('click', () => { const row=state.auditLogs.find(x=>String(x.id)===String(btn.dataset.auditView)); if(row) showAdminSupportDetail('Audit event',row); }));
  document.querySelectorAll('[data-admin-refresh]').forEach(btn => btn.addEventListener('click', async () => {
    const section = btn.dataset.adminRefresh;
    if (section === 'ratings') await loadRatingsFromSupabase();
    else if (section === 'notifications') await loadNotificationsFromSupabase();
    else if (section === 'reports') await loadReportsFromSupabase();
    renderAdminWorkspace();
  }));
  ['ratingSearch','ratingFilter','supportSearch','supportStatus','supportType','notificationSearch','notificationType','notificationAudience'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', () => renderAdminWorkspace());
  });
  document.querySelectorAll('[data-rating-detail]').forEach(row => row.addEventListener('click', () => {
    const r = state.ratings.find(x => x.id === row.dataset.ratingDetail); if (r) showAdminSupportDetail('Rating', r);
  }));
  document.querySelectorAll('[data-notification-detail]').forEach(row => row.addEventListener('click', () => {
    const r = state.notifications.find(x => x.id === row.dataset.notificationDetail); if (r) showAdminSupportDetail('Notification', r);
  }));
  document.querySelectorAll('[data-report-detail]').forEach(btn => btn.addEventListener('click', () => {
    const r = state.reports.find(x => x.id === btn.dataset.reportDetail); if (r) showAdminSupportDetail('Report', r);
  }));
  document.querySelectorAll('[data-customer-detail]').forEach(b=>b.addEventListener('click',()=>showCustomerDetail(b.dataset.customerDetail)));
  document.querySelectorAll('[data-product-detail]').forEach(b=>b.addEventListener('click',()=>showProductDetail(b.dataset.productDetail)));
  document.querySelector('[data-product-search]')?.addEventListener('input',e=>{financeFilter.productQuery=e.target.value;financeFilter.productPage=1;renderAdminWorkspace();});
  document.querySelector('[data-product-vendor]')?.addEventListener('change',e=>{financeFilter.productVendor=e.target.value;financeFilter.productPage=1;renderAdminWorkspace();});
  document.querySelector('[data-product-category]')?.addEventListener('change',e=>{financeFilter.productCategory=e.target.value;financeFilter.productPage=1;renderAdminWorkspace();});
  document.querySelector('[data-product-availability]')?.addEventListener('change',e=>{financeFilter.productAvailability=e.target.value;financeFilter.productPage=1;renderAdminWorkspace();});
  document.querySelector('[data-product-page="next"]')?.addEventListener('click',()=>{financeFilter.productPage=(financeFilter.productPage||1)+1;renderAdminWorkspace();});
  document.querySelector('[data-product-refresh]')?.addEventListener('click',async()=>{await loadCatalog();renderAdminWorkspace();});
  document.querySelector('[data-category-search]')?.addEventListener('input',e=>{financeFilter.categoryQuery=e.target.value;financeFilter.categoryPage=1;renderAdminWorkspace();});
  document.querySelector('[data-customer-search]')?.addEventListener('input',e=>{financeFilter.customerQuery=e.target.value;financeFilter.customerPage=1;renderAdminWorkspace();});
  document.querySelector('[data-customer-page="next"]')?.addEventListener('click',()=>{financeFilter.customerPage=(financeFilter.customerPage||1)+1;renderAdminWorkspace();});
  document.querySelector('[data-customer-refresh]')?.addEventListener('click',async()=>{await loadAssignableUsers();await loadOrders();renderAdminWorkspace();});
  document.querySelectorAll('[data-vendor-detail]').forEach(btn=>btn.addEventListener('click',()=>showVendorDetail(btn.dataset.vendorDetail)));
  document.querySelector('[data-vendor-search]')?.addEventListener('input',e=>{financeFilter.vendorQuery=e.target.value;financeFilter.vendorPage=1;renderAdminWorkspace();});
  document.querySelector('[data-vendor-status]')?.addEventListener('change',e=>{financeFilter.vendorStatus=e.target.value;financeFilter.vendorPage=1;renderAdminWorkspace();});
  document.querySelector('[data-vendor-page="next"]')?.addEventListener('click',()=>{financeFilter.vendorPage=(financeFilter.vendorPage||1)+1;renderAdminWorkspace();});
  document.querySelector('[data-vendor-refresh]')?.addEventListener('click',async()=>{await loadCatalog();await loadVendorApplicationsFromSupabase();renderAdminWorkspace();});

  document.querySelectorAll('[data-rider-detail]').forEach(btn => btn.addEventListener('click', () => showRiderDetail(btn.dataset.riderDetail)));
  document.querySelector('[data-rider-search]')?.addEventListener('input', e => { financeFilter.riderQuery=e.target.value; financeFilter.riderPage=1; renderAdminWorkspace(); });
  document.querySelector('[data-rider-status]')?.addEventListener('change', e => { financeFilter.riderStatus=e.target.value; financeFilter.riderPage=1; renderAdminWorkspace(); });
  document.querySelector('[data-rider-page="next"]')?.addEventListener('click', () => { financeFilter.riderPage=(financeFilter.riderPage||1)+1; renderAdminWorkspace(); });
  document.querySelector('[data-rider-refresh]')?.addEventListener('click', async () => { await loadRiders(); await loadRiderMetrics(); renderAdminWorkspace(); });

  document.querySelectorAll('[data-delivery-detail]').forEach(btn => btn.addEventListener('click', () => showDeliveryDetail(btn.dataset.deliveryDetail)));
  document.querySelectorAll('[data-assign-delivery]').forEach(btn => btn.addEventListener('click', async () => {
    const riderId = await DropzyyModal.prompt({ title:'Assign rider', message:'Enter an approved rider ID. The server validates eligibility, payment state and the active-delivery cap.', label:'Rider ID', placeholder:'UUID', confirmText:'Assign' });
    if (!riderId) return;
    const { error } = await supabase.rpc('admin_assign_delivery_rider', { p_order_id: btn.dataset.assignDelivery, p_rider_id: riderId.trim() });
    if (error) { toast('Assignment failed: ' + (error.message || 'unknown error'), 'error'); return; }
    toast('Rider assigned'); await loadOrders(); renderAdminWorkspace();
  }));
  document.querySelector('[data-delivery-search]')?.addEventListener('input', e => { financeFilter.deliveryQuery = e.target.value; financeFilter.deliveryPage = 1; renderAdminWorkspace(); });
  document.querySelector('[data-delivery-status]')?.addEventListener('change', e => { financeFilter.deliveryStatus = e.target.value; financeFilter.deliveryPage = 1; renderAdminWorkspace(); });
  document.querySelector('[data-delivery-rider]')?.addEventListener('change', e => { financeFilter.deliveryRider = e.target.value; financeFilter.deliveryPage = 1; renderAdminWorkspace(); });
  document.querySelector('[data-delivery-page="next"]')?.addEventListener('click', () => { financeFilter.deliveryPage += 1; renderAdminWorkspace(); });
  document.querySelector('[data-delivery-refresh]')?.addEventListener('click', async () => { await loadOrders(); renderAdminWorkspace(); });

  document.querySelectorAll('[data-finance-detail]').forEach(btn => btn.addEventListener('click', () => showFinanceDetail(btn.dataset.financeDetail)));

  const financeSearch = document.querySelector('[data-finance-search]');
  financeSearch?.addEventListener('input', () => { financeFilter.query = financeSearch.value; financeFilter.page = 1; renderAdminWorkspace(); });
  document.querySelector('[data-finance-status]')?.addEventListener('change', (event) => { financeFilter.status = event.target.value; financeFilter.page = 1; renderAdminWorkspace(); });
  document.querySelector('[data-finance-page="prev"]')?.addEventListener('click', () => { financeFilter.page -= 1; renderAdminWorkspace(); });
  document.querySelector('[data-finance-page="next"]')?.addEventListener('click', () => { financeFilter.page += 1; renderAdminWorkspace(); });
  document.querySelector('[data-finance-refresh]')?.addEventListener('click', async () => { await loadPaymentsFromSupabase(); await loadWithdrawalsFromSupabase(); await loadSettlementsFromSupabase(); await loadRefundsFromSupabase(); renderAdminWorkspace(); });

  const maintenanceToggle = $('#maintenanceModeToggle');
  if (maintenanceToggle) {
    maintenanceToggle.addEventListener('change', async () => {
      const requestedValue = maintenanceToggle.checked;
      maintenanceToggle.disabled = true;
      const updated = await updateMaintenanceMode(requestedValue);
      if (!updated) maintenanceToggle.checked = !requestedValue;
      maintenanceToggle.disabled = false;
    });
  }
  $('#siteSettingsForm')?.addEventListener('submit', event => { event.preventDefault(); saveSiteSettings(event.currentTarget); });
  document.querySelector('[data-settings-cancel]')?.addEventListener('click', () => renderAdminWorkspace());
  $('#adminMfaEnrollBtn')?.addEventListener('click', beginAdminMfaEnrollment);
  $('#adminMfaVerifyForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    verifyAdminMfaEnrollment(event.target);
  });

  document.querySelectorAll('[data-generate-settlement]').forEach(btn => btn.addEventListener('click', async () => {
    try { const { error } = await supabase.rpc('admin_generate_settlement', { p_order_id: btn.dataset.generateSettlement }); if (error) throw error; toast('Settlement generated'); await loadSettlementsFromSupabase(); renderAdminWorkspace(); }
    catch (err) { toast(err.message || 'Settlement generation failed', 'error'); }
  }));

  // Prepare settlement transfer - creates transfer for settlement when recipient is available
  document.querySelectorAll('[data-prepare-settlement-transfer]').forEach(btn => btn.addEventListener('click', async () => {
    try { 
      const settlementId = btn.dataset.prepareSettlementTransfer;
      const isVendor = btn.dataset.settlementKind === 'vendor';
      const { data, error } = await supabase.rpc('prepare_settlement_transfer', {
        p_vendor_settlement_id: isVendor ? settlementId : null,
        p_delivery_settlement_id: isVendor ? null : settlementId
      });
      if (error) throw error;
      if (data?.already_exists) {
        toast('Transfer already prepared');
      } else {
        toast('Transfer prepared - click Execute to initiate payout');
      }
      await loadSettlementsFromSupabase(); renderAdminWorkspace();
    }
    catch (err) { toast(err.message || 'Transfer preparation failed', 'error'); }
  }));
  document.querySelectorAll('[data-execute-transfer]').forEach(btn => btn.addEventListener('click', async () => {
    if (!supabaseAvailable()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in required');
      const res = await fetch(window.SUPABASE_EDGE_URL + '/functions/v1/paystack-transfer', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ transfer_id: btn.dataset.executeTransfer }) });
      const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || 'Transfer execution failed');
      toast('Transfer submitted securely'); await loadSettlementsFromSupabase(); renderAdminWorkspace();
    } catch (err) { toast(adminMfaMessage(err.message || 'Transfer execution failed'), 'error'); }
  }));

  // Vendor form submission
  $('#vendorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addVendor(new FormData(e.target));
  });
  // Product form submission
  $('#productForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addProduct(new FormData(e.target));
  });

  // Clear forms
  $('#clearVendorForm')?.addEventListener('click', () => {
    $('#vendorForm').reset();
    $('#vendorForm').querySelector('input[name="id"]').value = '';
    $('#vendorFormTitle').textContent = 'Add Vendor';
  });

  $('#clearProductForm')?.addEventListener('click', () => {
    $('#productForm').reset();
    $('#productForm').querySelector('input[name="id"]').value = '';
    $('#productFormTitle').textContent = 'Add Product';
  });

  // Edit/Delete/Toggle buttons
  document.querySelectorAll('[data-edit-vendor]').forEach(btn => {
    btn.addEventListener('click', () => editVendor(btn.dataset.editVendor));
  });

  document.querySelectorAll('[data-delete-vendor]').forEach(btn => {
    btn.addEventListener('click', () => deleteVendor(btn.dataset.deleteVendor));
  });

  document.querySelectorAll('[data-toggle-vendor]').forEach(btn => {
    btn.addEventListener('click', () => toggleVendor(btn.dataset.toggleVendor));
  });

  document.querySelectorAll('[data-edit-product]').forEach(btn => {
    btn.addEventListener('click', () => editProduct(btn.dataset.editProduct));
  });

  document.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct));
  });

  document.querySelectorAll('[data-save-order-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = document.querySelector(`[data-order-status="${btn.dataset.saveOrderStatus}"]`).value;
      updateOrderStatus(btn.dataset.saveOrderStatus, status);
    });
  });

  // F11: save immediately when the administrator changes the status select —
  // no separate Save click required. updateOrderStatus guards duplicates and
  // only confirms (toast / persisted value) once the server succeeds; failures
  // restore the previous value. The Save button remains as a fallback.
  document.querySelectorAll('[data-order-status]').forEach(sel => {
    sel.addEventListener('change', () => {
      updateOrderStatus(sel.dataset.orderStatus, sel.value);
    });
  });

  // Order status filter tabs (All / Active / Completed / Cancelled)
  document.querySelectorAll('[data-order-filter]').forEach(tab => {
    tab.addEventListener('click', () => setOrderFilter('status', tab.dataset.orderFilter));
  });

  // Homepage demo tracking: show the currently-flagged order (if any) and wire
  // the set/clear controls. All three are null outside the Orders section.
  if (document.getElementById('demoTrackCurrent')) loadDemoTrackingStatusLine();
  const demoTrackSetBtn = document.getElementById('demoTrackSetBtn');
  if (demoTrackSetBtn) {
    demoTrackSetBtn.addEventListener('click', () => {
      const input = document.getElementById('demoTrackOrderInput');
      const value = (input ? input.value : '').trim();
      if (!value) { toast('Enter the order number to feature on the homepage', 'info'); return; }
      setHomepageDemoOrder(value);
    });
  }
  const demoTrackClearBtn = document.getElementById('demoTrackClearBtn');
  if (demoTrackClearBtn) demoTrackClearBtn.addEventListener('click', () => setHomepageDemoOrder(''));
  document.querySelectorAll('[data-feature-demo-order]').forEach(btn => {
    btn.addEventListener('click', () => setHomepageDemoOrder(btn.dataset.featureDemoOrder));
  });

  // Order date filters
  const dateFromInput = document.getElementById('orderDateFrom');
  if (dateFromInput) {
    dateFromInput.addEventListener('change', () => setOrderFilter('dateFrom', dateFromInput.value));
  }
  const dateToInput = document.getElementById('orderDateTo');
  if (dateToInput) {
    dateToInput.addEventListener('change', () => setOrderFilter('dateTo', dateToInput.value));
  }

  // Reset all order filters
  document.querySelectorAll('[data-order-filter-reset]').forEach(btn => {
    btn.addEventListener('click', resetOrderFilter);
  });

  // Approve/Reject Rider Applications
  document.querySelectorAll('[data-approve-rider]').forEach(btn => {
    btn.addEventListener('click', () => {
      approveRider(btn.dataset.approveRider);
    });
  });

  document.querySelectorAll('[data-reject-rider]').forEach(btn => {
    btn.addEventListener('click', () => {
      rejectRider(btn.dataset.rejectRider);
    });
  });

  // Suspend an approved rider
  document.querySelectorAll('[data-suspend-rider]').forEach(btn => {
    btn.addEventListener('click', () => {
      suspendRider(btn.dataset.suspendRider);
    });
  });

  // Unsuspend a suspended rider
  document.querySelectorAll('[data-unsuspend-rider]').forEach(btn => {
    btn.addEventListener('click', () => {
      unsuspendRider(btn.dataset.unsuspendRider);
    });
  });

  // Review a withdrawal request (approve / reject / mark paid). Reads the
  // status select and admin-note input from the same row as the button.
  document.querySelectorAll('[data-review-withdrawal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const requestId = btn.dataset.reviewWithdrawal;
      const row = btn.closest('[data-withdrawal-row]');
      const select = row ? row.querySelector('[data-withdrawal-status]') : null;
      const noteInput = row ? row.querySelector('[data-withdrawal-note]') : null;
      const newStatus = select ? select.value : null;
      reviewWithdrawal(requestId, newStatus, noteInput ? noteInput.value : '');
    });
  });

  // Assign a user to a vendor (admin-only RPC). The client never updates
  // profiles directly — assignUserToVendor() calls the server-side RPC.
  document.querySelectorAll('[data-assign-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.assignUser;
      const row = btn.closest('[data-user-id]');
      const select = row ? row.querySelector('select[name="vendor"]') : null;
      const vendorId = select && select.value ? select.value : null;
      assignUserToVendor(userId, vendorId);
    });
  });

  // Approve a refund request
  document.querySelectorAll('[data-approve-refund]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await DropzyyModal.confirm({ title:'Approve refund request', message:'Approve this refund request? This will mark it as approved and ready for execution.', confirmText:'Approve refund' })) {
        approveRefund(btn.dataset.approveRefund);
      }
    });
  });

  // Reject a refund request (with reason prompt)
  document.querySelectorAll('[data-reject-refund]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reason = (await DropzyyModal.prompt({ title:'Reject refund request', message:'A reason is optional. It will be shown to the customer.', label:'Reason for rejection (optional)', placeholder:'e.g. Duplicate request', confirmText:'Next' })) || '';
      if (await DropzyyModal.confirm({ title:'Reject refund request', message:`Reject this refund request${reason ? ' with reason: ' + reason : ''}?`, confirmText:'Reject refund', danger:true })) {
        rejectRefund(btn.dataset.rejectRefund, reason);
      }
    });
  });

  // Execute an approved refund via Paystack Edge Function
  document.querySelectorAll('[data-execute-refund]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await DropzyyModal.confirm({ title:'Execute refund', message:'Execute this refund through Paystack? This will initiate an actual refund transaction. This action cannot be undone.', confirmText:'Execute refund', danger:true })) {
        executeRefund(btn.dataset.executeRefund);
      }
    });
  });

  // Review an issue report (change status + add/update admin response).
  // Reads the status select and response input from the same row as the button.
  document.querySelectorAll('[data-review-report]').forEach(btn => {
    btn.addEventListener('click', () => {
      const reportId = btn.dataset.reviewReport;
      const row = btn.closest('[data-report-row]');
      const select = row ? row.querySelector('[data-report-status]') : null;
      const responseInput = row ? row.querySelector('[data-report-response]') : null;
      const newStatus = select ? select.value : null;
      updateReportReview(reportId, newStatus, responseInput ? responseInput.value : '');
    });
  });

  // Approve/Reject a vendor application (approval creates the storefront and
  // activates the vendor relationship via assign_user_to_vendor).
  document.querySelectorAll('[data-approve-vendor-app]').forEach(btn => {
    btn.addEventListener('click', () => {
      approveVendorApplication(btn.dataset.approveVendorApp);
    });
  });

  document.querySelectorAll('[data-reject-vendor-app]').forEach(btn => {
    btn.addEventListener('click', () => {
      rejectVendorApplication(btn.dataset.rejectVendorApp);
    });
  });

  // Save vendor-application status + admin response (approve/reopen/reject).
  document.querySelectorAll('[data-review-vendor-app]').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.reviewVendorApp;
      const row = btn.closest('[data-vendor-app-row]');
      const select = row ? row.querySelector('[data-vendor-app-status]') : null;
      const responseInput = row ? row.querySelector('[data-vendor-app-response]') : null;
      updateVendorApplicationReview(appId, select ? select.value : null, responseInput ? responseInput.value : '');
    });
  });

  // Financial Resolution: Review cancellation requiring admin resolution
  document.querySelectorAll('[data-review-cancellation]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cancellationId = btn.dataset.reviewCancellation;
      // For now, just show the cancellation details - admin can manually resolve
      const c = state.cancellations.find(c => c.id === cancellationId);
      if (!c) return;
      const o = state.orders.find(o => o.id === c.order_id);
      const customer = o ? (o.user || 'Unknown') : 'Unknown';
      toast(`Cancellation ${cancellationId.slice(0,8)} · ${customer} · ${money(c.reimbursement_amount || 0)} · ${c.stage}. ${c.reimbursement_failure_reason || 'Manual provider review required.'}`, 'info');
    });
  });

  // Financial Resolution: Retry automatic cutoff reimbursement
  document.querySelectorAll('[data-retry-cutoff]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const claimId = btn.dataset.retryCutoff;
      if (!supabaseAvailable()) return;
      try {
        const { data, error } = await supabase.functions.invoke('admin-financial-recovery', { body: { action: 'retry_cutoff_reimbursement', claim_id: claimId } });
        if (error) throw error;
        const recovery = data?.recovery;
        toast(recovery?.status === 'completed' ? 'Reimbursement completed' : recovery?.status === 'processing' ? 'Reimbursement processing' : `Recovery status: ${recovery?.status || 'unknown'}`);
        await loadReportsFromSupabase(); // reload cutoff claims
        renderAdminWorkspace();
      } catch (err) {
        console.error('Cutoff retry failed:', err);
        toast('Retry failed: ' + (err.message || 'unknown error'), 'error');
      }
    });
  });
}

function showProductDetail(id){const p=state.catalog?.products?.find(x=>String(x.id)===String(id));if(!p)return;const root=$('#modalRoot');root.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>${escHtml(p.name)}</h3><button class="btn btn--ghost btn--sm" data-close-product>Close</button></div><dl class="settings-list">${[['Vendor',p.vendor],['Category',p.category],['Price',money(p.price)],['Status',p.active===false?'Deactivated':'Active'],['Image',p.image||'—'],['Description',p.desc||'—']].map(([k,v])=>`<div class="settings-row"><dt>${k}</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl></div></div>`;root.querySelector('[data-close-product]')?.addEventListener('click',()=>root.innerHTML='');}
function showCustomerDetail(id){const u=state.users.find(x=>x.id===id);if(!u)return;const os=state.orders.filter(o=>o.user_id===id);const root=$('#modalRoot');root.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>${escHtml(u.full_name||u.id)}</h3><button class="btn btn--ghost btn--sm" data-close-customer>Close</button></div><dl class="settings-list">${[['Email',u.email||'—'],['Phone',u.phone||'—'],['Profile status',u.role||'user'],['Orders',os.length],['Active',os.filter(o=>!['Delivered','Rated','Cancelled'].includes(o.status)).length],['Completed',os.filter(o=>['Delivered','Rated'].includes(o.status)).length],['Cancelled',os.filter(o=>o.status==='Cancelled').length]].map(([k,v])=>`<div class="settings-row"><dt>${k}</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl><h4>Recent orders</h4><p class="muted small">${os.slice(0,10).map(o=>`#${escHtml(o.id)} · ${escHtml(o.status)}`).join('<br>')||'No orders.'}</p><p class="muted small">Account controls are read-only because no safe customer suspension model exists in the current schema.</p></div></div>`;root.querySelector('[data-close-customer]')?.addEventListener('click',()=>root.innerHTML='');}

function showVendorDetail(vendorId){const v=state.catalog?.vendors?.find(x=>x.id===vendorId);if(!v)return;const products=state.catalog.products.filter(p=>p.vendor===vendorId),orders=state.orders.filter(o=>o.vendor_id===vendorId);const root=$('#modalRoot');root.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>${escHtml(v.name)}</h3><button class="btn btn--ghost btn--sm" data-close-vendor>Close</button></div><dl class="settings-list">${[['Type',v.type],['Store',v.open?'Open':'Closed'],['Delivery',v.delivery_method],['Products',products.length],['Active orders',orders.filter(o=>!['Delivered','Rated','Cancelled'].includes(o.status)).length],['Completed orders',orders.filter(o=>['Delivered','Rated'].includes(o.status)).length]].map(([k,x])=>`<div class="settings-row"><dt>${k}</dt><dd>${escHtml(x)}</dd></div>`).join('')}</dl><h4>Products</h4><p class="muted small">${products.map(p=>escHtml(p.name)).join(', ')||'No products'}</p><h4>Application</h4><p class="muted small">${escHtml(state.vendorApplications.find(a=>a.vendor_id===vendorId)?.status||'No linked application')}</p></div></div>`;root.querySelector('[data-close-vendor]')?.addEventListener('click',()=>root.innerHTML='');}

function showRiderDetail(riderId) {
  const rider = state.riders.find(r => String(r.id) === String(riderId)); if (!rider) return;
  const m = state.riderMetrics[rider.id] || {}, active = state.orders.filter(o => o.rider_id === rider.id && ['Rider assigned','Picked up','On the Way'].includes(o.status));
  const ratings = m.ratings || [], e = m.earnings || {};
  const actions = rider.status === 'pending' ? `<button class="btn btn--soft" data-approve-rider="${rider.id}">Approve</button><button class="btn btn--dangerSoft" data-reject-rider="${rider.id}">Reject</button>` : rider.status === 'approved' ? `<button class="btn btn--dangerSoft" data-suspend-rider="${rider.id}">Suspend</button>` : rider.status === 'suspended' ? `<button class="btn btn--soft" data-unsuspend-rider="${rider.id}">Unsuspend</button>` : '';
  const root=$('#modalRoot'); root.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>Rider details</h3><button class="btn btn--ghost btn--sm" data-close-rider>Close</button></div><p><b>${escHtml(rider.full_name || rider.matric_number || rider.id)}</b> · ${escHtml(rider.status)} · ${rider.available ? 'Available' : 'Offline / busy'}</p><div class="admin-actions">${actions}</div><h4>Authoritative earnings</h4><dl class="settings-list">${[['Gross earned',e.gross_earned],['Withdrawn',e.withdrawn_amount],['Reserved',e.reserved_amount],['Available balance',e.available_balance],['Pending earnings',e.pending_earnings],['Bonus today',e.bonus_earned_today]].map(([k,v])=>`<div class="settings-row"><dt>${k}</dt><dd>${v != null ? money(v) : '—'}</dd></div>`).join('')}</dl><h4>Active deliveries (${active.length})</h4><p class="muted small">${active.map(o=>`#${escHtml(o.id)} · ${escHtml(o.status)}`).join('<br>') || 'None'}</p><h4>Recent ratings</h4><p class="muted small">${ratings.map(x=>`${x.rating}/5 · ${escHtml(x.review || 'No comment')} · ${formatDate(x.created_at)}`).join('<br>') || 'No ratings loaded.'}</p><h4>Withdrawal requests</h4><p class="muted small">${state.withdrawals.filter(w=>w.rider_id===rider.id).map(w=>`${w.id} · ${money(w.amount)} · ${escHtml(w.status)}`).join('<br>') || 'None'}</p></div></div>`;
  root.querySelector('[data-close-rider]')?.addEventListener('click',()=>{root.innerHTML='';});
  root.querySelectorAll('[data-approve-rider],[data-reject-rider],[data-suspend-rider],[data-unsuspend-rider]').forEach(btn=>btn.addEventListener('click',()=>{root.innerHTML=''; document.querySelector(`[data-${btn.dataset.approveRider?'approve':btn.dataset.rejectRider?'reject':btn.dataset.suspendRider?'suspend':'unsuspend'}-rider="${rider.id}"]`)?.click();}));
}

function showDeliveryDetail(orderId) {
  const order = state.orders.find(o => String(o.dbId) === String(orderId)); if (!order) return;
  const root = $('#modalRoot'); root.innerHTML = `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>Delivery details</h3><button class="btn btn--ghost btn--sm" data-close-delivery>Close</button></div><dl class="settings-list">${Object.entries(order).map(([k,v]) => `<div class="settings-row"><dt>${escHtml(k)}</dt><dd>${escHtml(Array.isArray(v) ? JSON.stringify(v) : v)}</dd></div>`).join('')}</dl><p class="muted small">Historical status-event timestamps are not available in the current order model; this view shows authoritative current lifecycle fields only.</p></div></div>`;
  root.querySelector('[data-close-delivery]')?.addEventListener('click', () => { root.innerHTML = ''; });
}

function showFinanceDetail(id) {
  const record = [...state.payments, ...state.withdrawals, ...state.transfers, ...state.settlements, ...state.refunds].find(x => String(x.id) === String(id));
  if (!record) return;
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="card finance-detail-drawer"><div class="card__head"><h3>Financial record</h3><button class="btn btn--ghost btn--sm" data-close-finance-detail>Close</button></div><dl class="settings-list">${Object.entries(record).filter(([k]) => k !== 'raw_payload').map(([k,v]) => `<div class="settings-row"><dt>${escHtml(k)}</dt><dd>${escHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</dd></div>`).join('')}</dl></div></div>`;
  root.querySelector('[data-close-finance-detail]')?.addEventListener('click', () => { root.innerHTML = ''; });
}

function editVendor(vendorId) {
  const vendor = state.catalog.vendors.find(v => v.id === vendorId);
  if (!vendor) return;

  const form = $('#vendorForm');
  form.querySelector('input[name="id"]').value = vendor.id;
  form.querySelector('input[name="name"]').value = vendor.name;
  form.querySelector('input[name="type"]').value = vendor.type;
  form.querySelector('input[name="icon"]').value = vendor.icon;
  form.querySelector('input[name="time"]').value = vendor.time;
  form.querySelector('input[name="rating"]').value = vendor.rating;
  form.querySelector('input[name="cover"]').value = vendor.cover;
  form.querySelector('input[name="image"]').value = vendor.image || '';
  form.querySelector('input[name="opening_hours"]').value = vendor.opening_hours || '';
  form.querySelector('textarea[name="description"]').value = vendor.description || '';
  form.querySelector('select[name="delivery_method"]').value = vendor.delivery_method || 'rider';
  form.querySelector('input[name="open"]').checked = vendor.open;
  $('#vendorFormTitle').textContent = 'Edit Vendor';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function editProduct(productId) {
  const product = state.catalog.products.find(p => p.id === Number(productId));
  if (!product) return;

  const form = $('#productForm');
  form.querySelector('input[name="id"]').value = product.id;
  form.querySelector('input[name="name"]').value = product.name;
  form.querySelector('select[name="vendor"]').value = product.vendor;
  form.querySelector('input[name="price"]').value = product.price;
  form.querySelector('input[name="category"]').value = product.category;
  form.querySelector('input[name="icon"]').value = product.icon;
  form.querySelector('input[name="image"]').value = product.image || '';
  form.querySelector('textarea[name="desc"]').value = product.desc;
  $('#productFormTitle').textContent = 'Edit Product';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// Vendor Assignment (admin only)
// ============================================
// Loads profiles where role = 'user' for the assignment UI. Admins read all
// profiles via the profiles_select_admin policy; we filter to role='user' so
// admins/vendors are not assignable here.
async function loadAssignableUsers() {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    state.users = [];
    return;
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, vendor_id')
      // No role filter: any existing account (user/admin/rider) may be
      // assigned a vendor capability — capabilities are additive, so an
      // admin assigned as a vendor keeps the admin role.
      .order('full_name', { ascending: true });
    if (error) throw error;
    state.users = data || [];
  } catch (err) {
    console.error('Failed to load assignable users:', err);
    state.users = [];
    toast('Could not load user list', 'error');
  }
}

// Assign a user to a vendor via the admin-only Supabase RPC. The client NEVER
// updates profiles.vendor_id (or profiles.role) directly — the server-side RPC
// assign_user_to_vendor() (admin-gated via is_admin()) performs the UPDATE.
async function assignUserToVendor(userId, vendorId) {
  const state = currentAdminState();
  if (!userId) return false;
  if (!supabaseAvailable()) {
    toast('Assignment unavailable: Supabase is not configured.', 'error');
    return false;
  }
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('assign_user_to_vendor', {
      target_user_id: userId,
      target_vendor_id: vendorId
    });
    if (error) throw error;
    toast(vendorId ? 'User assigned to vendor' : 'Vendor assignment cleared');
    await loadAssignableUsers();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Vendor assignment failed:', err);
    toast('Assignment failed: ' + adminMfaMessage(err.message || 'Unknown error'), 'error');
    return false;
  }
}

// ============================================
// Withdrawal Requests (admin review) — ACTION 10
// ============================================
// The `withdrawal_requests` table holds PENDING / admin-reviewed RECORDS only.
// Reviewing here records an approval/rejection/paid decision (with an optional
// admin note) — no money is transferred in-app. RLS only permits admins to
// UPDATE these rows (withdrawal_requests_update_admin), so a rider can never
// approve/reject/pay their own request. The rider-supplied amount is kept
// verbatim; it is never recomputed or trusted as an earnings figure here.
async function loadWithdrawalsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) return null;
  try {
    state.withdrawalsLoading = true;
    state.withdrawalsError = null;
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) throw error;
        state.withdrawals = (data || []).map(w => ({
      id: w.id,
      rider_id: w.rider_id,
      amount: Number(w.amount || 0),
      status: w.status || 'pending',
      requested_at: w.requested_at || null,
      reviewed_at: w.reviewed_at || null,
      reviewed_by: w.reviewed_by || null,
      admin_note: w.admin_note || '',
      account_name: w.account_name || null,
      account_number: w.account_number || null,
      bank_name: w.bank_name || null,
      bank_code: w.bank_code || null
    }));
    state.withdrawalsLoading = false;
    return state.withdrawals;
  } catch (err) {
    console.error('Supabase withdrawal requests load failed:', err);
    state.withdrawalsLoading = false;
    state.withdrawalsError = err.message || 'Load failed';
    return null;
  }
}

async function loadWithdrawals() {
  const state = currentAdminState();
  await loadWithdrawalsFromSupabase();
}

// Admin decides a withdrawal request (pending → approved/rejected/paid). The
// request's amount is never changed — only its review outcome. reviewed_by is
// the authenticated admin's own auth.uid(), set on the client but gated by the
// admin-only UPDATE policy server-side.
async function reviewWithdrawal(requestId, newStatus, note) {
  const state = currentAdminState();
  if (!requestId) return false;
  if (!['pending', 'approved', 'rejected', 'paid'].includes(newStatus)) {
    toast('Invalid review status', 'error');
    return false;
  }
  if (!supabaseAvailable()) {
    toast('Review unavailable: Supabase is not configured.', 'error');
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to review', 'error'); return false; }
    if (newStatus === 'approved') {
      const res = await fetch(window.SUPABASE_EDGE_URL + '/functions/v1/paystack-transfer', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawal_id: Number(requestId) })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Payout initiation failed');
      toast('Withdrawal approved and payout initiated');
      await loadWithdrawalsFromSupabase(); loadSettlementsFromSupabase(); renderAdminWorkspace();
      return true;
    }
    if (newStatus !== 'rejected') {
      throw new Error('Pending and paid withdrawal states are server-managed');
    }
    const { error: rejectError } = await supabase.rpc('admin_reject_withdrawal', {
      p_withdrawal_id: Number(requestId), p_note: (note || '').trim() || null
    });
    if (rejectError) throw rejectError;
    toast('Withdrawal request rejected');
    await loadWithdrawalsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Withdrawal review failed:', err);
    toast('Review failed: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

// Status badge for a withdrawal request row.
function withdrawalStatusBadge(status) {
  const map = { pending: 'warn', approved: 'success', rejected: 'danger', paid: 'info' };
  return `<span class="badge badge--${map[status] || 'warn'}">${status || 'pending'}</span>`;
}

// Render the Withdrawal Requests table body. Loading / empty / error states
// are all represented explicitly.
function renderWithdrawalRows() {
  if (state.withdrawalsLoading && !state.withdrawals.length) {
    return '<tr>        <td colspan="7" class="muted center">Loading withdrawal requests…</td></tr>';
  }
if (!state.withdrawalsLoading && state.withdrawalsError) {
    return `    <tr><td colspan="7" class="muted center">Could not load withdrawal requests: ${escHtml(state.withdrawalsError)}. Please refresh.</td></tr>`;
  }
  if (!state.withdrawals.length) {
    return '    <tr><td colspan="7" class="muted center">No withdrawal requests yet.</td></tr>';
  }
  const riderFor = id => state.riders.find(r => r.id === id);
  return state.withdrawals.map(w => {
    const rider = riderFor(w.rider_id);
    const transfer = (state.transfers || []).find(t => Number(t.withdrawal_request_id) === Number(w.id));
    const ident = rider
      ? `${escHtml(rider.matric_number) || '—'}<div class="muted small">${escHtml(rider.phone) || ''}</div>`
      : '<span class="muted">Unknown rider</span>';
    return `
            <tr data-withdrawal-row="${w.id}">
        <td>${ident}</td>
        <td><b>${money(w.amount)}</b></td>
        <td class="muted small" style="max-width:220px">${w.bank_name ? escHtml(w.bank_name) + '<div class="muted small">' + escHtml(w.account_number ? '•••• ' + w.account_number.slice(-4) : '') + '</div>' : '<span class="muted">—</span>'}</td>
        <td>${withdrawalStatusBadge(w.status)}${transfer ? `<div class="muted small">Transfer: ${escHtml(transfer.status)}<br>${escHtml(transfer.paystack_reference || '')}</div>` : '<div class="muted small">No payout initiated</div>'}</td>
        <td>${w.requested_at ? new Date(w.requested_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>${w.reviewed_at ? new Date(w.reviewed_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>
          <div class="row row--wrap" style="gap:6px">
            <select class="select" data-withdrawal-status="${w.id}" style="max-width:130px">
              <option value="pending" ${w.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${w.status === 'approved' ? 'selected' : ''}>Approve &amp; pay</option>
              <option value="rejected" ${w.status === 'rejected' ? 'selected' : ''}>Rejected</option>
              ${w.status === 'paid' ? '<option value="paid" selected disabled>Paid (Paystack confirmed)</option>' : ''}
            </select>
            <input class="input" style="max-width:170px;min-width:120px" placeholder="Admin note" data-withdrawal-note="${w.id}" value="${escHtml(w.admin_note || '')}">
            <button class="link-btn" data-review-withdrawal="${w.id}" ${w.status === 'paid' ? 'disabled' : ''}>Save</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ============================================
// Refund Management (admin)
// ============================================
// Load refunds from Supabase. Admins read all refunds via RLS.
async function loadRefundsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    state.refundsLoading = false;
    state.refundsError = 'Supabase unavailable';
    return null;
  }
  state.refundsLoading = true;
  state.refundsError = null;
  try {
    const { data, error } = await supabase
      .from('refunds')
      .select('id, order_id, payment_id, amount, status, reason, gateway_refund_id, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.refunds = data || [];
    state.refundsLoading = false;
    return data;
  } catch (err) {
    console.error('Failed to load refunds:', err);
    state.refundsLoading = false;
    state.refundsError = err.message || 'Unknown error';
    state.refunds = [];
    return null;
  }
}

// Approve a refund request (admin only).
async function approveRefund(refundId) {
  const state = currentAdminState();
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  try {
    const { error } = await supabase.rpc('approve_refund', { p_refund_id: refundId });
    if (error) throw error;
    toast('Refund approved');
    await loadRefundsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Approve refund failed:', err);
    toast('Approve failed: ' + (err.message || 'Unknown error'), 'error');
    return false;
  }
}

// Reject a refund request with reason (admin only).
async function rejectRefund(refundId, reason) {
  const state = currentAdminState();
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  try {
    const { error } = await supabase.rpc('reject_refund', { p_refund_id: refundId, p_reason: (reason || '').trim() || null });
    if (error) throw error;
    toast('Refund rejected');
    await loadRefundsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Reject refund failed:', err);
    toast('Reject failed: ' + (err.message || 'Unknown error'), 'error');
    return false;
  }
}

// Execute an approved refund via the Paystack Edge Function.
async function executeRefund(refundId) {
  const state = currentAdminState();
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required', 'error'); return false; }
    const token = session.access_token;
    const edgeUrl = window.SUPABASE_EDGE_URL + '/functions/v1/paystack-refund';
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refund_id: refundId })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404 || res.status === 500) {
        toast('Refund Edge Function not deployed. Deploy with: supabase functions deploy paystack-refund', 'error');
      } else {
      toast(adminMfaMessage(result.error || ('Refund execution failed (' + res.status + ')')), 'error');
      }
      await loadRefundsFromSupabase();
      renderAdminWorkspace();
      return false;
    }
    toast(result.message || 'Refund processed successfully');
    await loadRefundsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Refund execution error:', err);
    toast('Refund execution failed — please try again', 'error');
    return false;
  }
}

// Refund status badge for admin table.
function refundStatusBadge(status) {
  const map = { requested: 'warn', approved: 'info', processed: 'success', failed: 'danger', rejected: 'danger', pending: 'warn', processing: 'info' };
  const labels = { requested: 'Requested', approved: 'Approved', processed: 'Processed', failed: 'Failed', rejected: 'Rejected', pending: 'Pending', processing: 'Processing' };
  return `<span class="badge badge--${map[status] || 'warn'}">${labels[status] || status}</span>`;
}

// Render the refunds table body.
function renderRefundRows() {
  if (state.refundsLoading && !state.refunds.length) {
    return '<tr><td colspan="8" class="muted center">Loading refund requests…</td></tr>';
  }
if (!state.refundsLoading && state.refundsError) {
    return `<tr><td colspan="8" class="muted center">Could not load refunds: ${escHtml(state.refundsError)}. Please refresh.</td></tr>`;
  }
  if (!state.refunds.length) {
    return '<tr><td colspan="8" class="muted center">No refund requests yet.</td></tr>';
  }
  return state.refunds.map(r => {
    const canApprove = r.status === 'requested' || r.status === 'failed';
    const canReject = r.status === 'requested';
    const canExecute = r.status === 'approved';
    return `
      <tr data-refund-row="${r.id}">
        <td><b>${r.id.slice(0, 8)}...</b><div class="muted small">${r.order_id ? r.order_id.slice(0, 8) + '...' : '—'}</div></td>
        <td><b>${money(r.amount)}</b></td>
        <td>${refundStatusBadge(r.status)}</td>
        <td class="muted small">${r.reason ? escHtml(r.reason).slice(0, 60) + (r.reason.length > 60 ? '…' : '') : '—'}</td>
        <td class="muted small">${r.created_at ? new Date(r.created_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>${canApprove ? `<button class="link-btn" data-approve-refund="${escHtml(r.id)}">${r.status === 'failed' ? 'Re-approve (retry)' : 'Approve'}</button>` : '<span class="muted small">—</span>'}</td>
        <td>${canReject ? `<button class="link-btn btn--danger" data-reject-refund="${escHtml(r.id)}">Reject</button>` : '<span class="muted small">—</span>'}</td>
        <td>${canExecute ? `<button class="link-btn" data-execute-refund="${escHtml(r.id)}">Execute</button>` : '<span class="muted small">—</span>'}</td>
      </tr>`;
  }).join('');
}
// ============================================
// Issue Reports (admin review) — homepage "Report an Issue" + vendor interest
// ============================================
// The `issue_reports` table stores customer reports / vendor applications.
// RLS only lets users insert/view their OWN rows (issue_reports_insert_own /
// issue_reports_select_own) and admins update them (issue_reports_update_admin),
// so status changes and admin responses are admin-only, server-enforced.
const REPORT_STATUS_OPTIONS = ['Open', 'In Review', 'Resolved', 'Closed'];

async function loadReportsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    state.reportsLoading = false;
    state.reportsError = 'Supabase unavailable';
    return null;
  }
  state.reportsLoading = true;
  state.reportsError = null;
  try {
    const { data, error } = await supabase
      .from('issue_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const reports = data || [];
    // Join reporter profile info (admins read all profiles via
    // profiles_select_admin) so the admin sees who reported.
    const reporterIds = [...new Set(reports.map(r => r.user_id).filter(Boolean))];
    let profileById = {};
    if (reporterIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', reporterIds);
      if (!profilesError && profiles) {
        profiles.forEach(p => { profileById[p.id] = p; });
      }
    }
    // Join order numbers so admins see the human-readable order reference
    // instead of the raw uuid.
    const orderIds = [...new Set(reports.map(r => r.order_id).filter(Boolean))];
    let orderNumberById = {};
    if (orderIds.length) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number')
        .in('id', orderIds);
      if (!ordersError && orders) {
        orders.forEach(o => { orderNumberById[o.id] = o.order_number; });
      }
    }
    state.reports = reports.map(r => ({
      id: r.id,
      user_id: r.user_id,
      reporter_name: profileById[r.user_id] ? (profileById[r.user_id].full_name || null) : null,
      reporter_email: profileById[r.user_id] ? profileById[r.user_id].email : null,
      subject: r.subject || '',
      description: r.description || '',
      order_id: r.order_id,
      order_number: r.order_id ? (orderNumberById[r.order_id] || null) : null,
      status: r.status || 'Open',
      admin_response: r.admin_response || '',
      created_at: r.created_at || null,
      updated_at: r.updated_at || null
    }));
    state.reportsLoading = false;
    return state.reports;
  } catch (err) {
    console.error('Supabase issue reports load failed:', err);
    state.reportsLoading = false;
    state.reportsError = err.message || 'Load failed';
    return null;
  }
}

// Save a status change + optional admin response (admin only — RLS enforced).
async function updateReportReview(reportId, newStatus, adminResponse) {
  const state = currentAdminState();
  if (!reportId) return false;
  if (!REPORT_STATUS_OPTIONS.includes(newStatus)) {
    toast('Invalid report status', 'error');
    return false;
  }
  if (!supabaseAvailable()) {
    toast('Supabase unavailable', 'error');
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to review', 'error'); return false; }
    const { error } = await supabase.rpc('admin_review_issue_report', {
      p_report_id: reportId,
      p_status: newStatus,
      p_admin_response: (adminResponse || '').trim() || null
    });
    if (error) throw error;
    toast(`Report marked ${newStatus}`);
    await loadReportsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Report review failed:', err);
    toast('Review failed: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}
// Render the Issue Reports table body. Loading / empty / error states are all
// represented explicitly; open reports are visually highlighted.
function renderReportRows() {
  if (state.reportsLoading && !state.reports.length) {
    return '<tr><td colspan="7" class="muted center">Loading issue reports…</td></tr>';
  }
if (!state.reportsLoading && state.reportsError) {
    return `<tr><td colspan="7" class="muted center">Could not load issue reports: ${escHtml(state.reportsError)}. Please refresh.</td></tr>`;
  }
  if (!state.reports.length) {
    return '<tr><td colspan="7" class="muted center">No issue reports yet — they appear here as soon as customers submit them.</td></tr>';
  }
  return state.reports.map(r => {
    const isOpen = r.status === 'Open';
    const statusCls = r.status === 'Open' ? 'open' : r.status === 'In Review' ? 'review' : r.status === 'Resolved' ? 'resolved' : 'closed';
    const ident = (r.reporter_name || r.reporter_email)
      ? `${escHtml(r.reporter_name || '—')}<div class="muted small">${escHtml(r.reporter_email || '')}</div>`
      : '<span class="muted">Unknown user</span>';
    return `
      <tr class="${isOpen ? 'report-row--open' : ''}" data-report-row="${r.id}">
        <td>${ident}</td>
        <td>${escHtml(r.subject)}</td>
        <td class="report-desc">${escHtml(r.description)}</td>
        <td>${r.order_number ? `<b>#${escHtml(r.order_number)}</b>` : '—'}</td>
        <td class="muted small">${r.created_at ? formatDate(r.created_at) : '—'}</td>
        <td><span class="status-badge report-status--${statusCls}">${escHtml(r.status)}</span></td>
        <td>
          <div class="row row--wrap" style="gap:6px">
            <select class="select select--sm" data-report-status="${r.id}" style="max-width:130px">
              ${REPORT_STATUS_OPTIONS.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <input class="input" style="max-width:240px;min-width:150px" placeholder="Admin response" data-report-response="${r.id}" value="${escHtml(r.admin_response || '')}">
            <button class="link-btn" data-review-report="${r.id}">Save</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// Load automatic cutoff claims from Supabase
async function loadAutomaticCutoffClaimsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    state.automaticCutoffClaimsLoading = false;
    state.automaticCutoffClaimsError = 'Supabase unavailable';
    return null;
  }
  state.automaticCutoffClaimsLoading = true;
  state.automaticCutoffClaimsError = null;
  try {
    const { data, error } = await supabase
      .from('automatic_cutoff_claims')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.automaticCutoffClaims = data || [];
    state.automaticCutoffClaimsLoading = false;
    return state.automaticCutoffClaims;
  } catch (err) {
    console.error('Supabase automatic cutoff claims load failed:', err);
    state.automaticCutoffClaimsLoading = false;
    state.automaticCutoffClaimsError = err.message || 'Load failed';
    state.automaticCutoffClaims = [];
    return null;
  }
}

// ============================================
// Vendor Applications (admin review) — #/vendor/apply intake
// ============================================
// The `vendor_applications` table holds structured "Become a Vendor"
// applications. RLS lets applicants insert/view only their OWN rows and only
// admins view/update all of them, so status changes, approvals and admin
// responses are admin-only, server-enforced. Approving an application creates
// the applicant's storefront (vendors row) and activates the vendor
// relationship through the existing assign_user_to_vendor RPC — it never
// touches profiles directly from the client.
const VENDOR_APP_STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'];

async function loadVendorApplicationsFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) {
    state.vendorApplicationsLoading = false;
    state.vendorApplicationsError = 'Supabase unavailable';
    return null;
  }
  state.vendorApplicationsLoading = true;
  state.vendorApplicationsError = null;
  try {
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.vendorApplications = (data || []).map(a => ({
      id: a.id,
      user_id: a.user_id,
      full_name: a.full_name || '',
      matric_number: a.matric_number || '',
      college: a.college || '',
      department: a.department || '',
      email: a.email || '',
      phone: a.phone || '',
      what_they_want_to_sell: a.what_they_want_to_sell || '',
      expected_price_range: a.expected_price_range || '',
      additional_info: a.additional_info || '',
      status: a.status || 'Pending',
      vendor_id: a.vendor_id || null,
      admin_response: a.admin_response || '',
      created_at: a.created_at || null,
      updated_at: a.updated_at || null
    }));
    state.vendorApplicationsLoading = false;
    return state.vendorApplications;
  } catch (err) {
    console.error('Supabase vendor applications load failed:', err);
    state.vendorApplicationsLoading = false;
    state.vendorApplicationsError = err.message || 'Load failed';
    return null;
  }
}

// Approve an application: (1) creates the applicant's storefront (vendors
// row), (2) activates the vendor relationship via the existing
// assign_user_to_vendor RPC (validates admin + writes profiles.role /
// profiles.vendor_id server-side), then (3) marks the application Approved.
// Rejected applications are PRESERVED (the Rejected status path never deletes
// the row, mirroring the rider approval workflow).
async function approveVendorApplication(appId) {
  const state = currentAdminState();
  const app = state.vendorApplications.find(a => a.id === appId);
  if (!app) return false;
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  if (!(await DropzyyModal.confirm({ title:'Approve vendor application', message:`Approve ${app.full_name || 'this applicant'}'s vendor application? This creates their storefront and grants them vendor access.`, confirmText:'Approve application' }))) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to approve', 'error'); return false; }
    const { error: reviewError } = await supabase.rpc('admin_review_vendor_application', { p_application_id: appId, p_status: 'Approved', p_response: (app.admin_response || '').trim() || 'Approved — your storefront is live.' });
    if (reviewError) throw reviewError;
    toast('Vendor approved — storefront created & vendor access granted');
    await loadVendorApplicationsFromSupabase();
    await loadCatalog();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Vendor application approval failed:', err);
    toast('Approval failed: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

// Reject an application: records the decision (status Rejected + optional
// admin reason) and PRESERVES the row — nothing is deleted, mirroring the
// rider reject workflow.
async function rejectVendorApplication(appId) {
  const state = currentAdminState();
  const app = state.vendorApplications.find(a => a.id === appId);
  if (!app) return false;
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  const reason = (await DropzyyModal.prompt({ title:'Reject vendor application', message:'A reason is optional — it will be shown to the applicant.', label:'Reason for rejection (optional)', placeholder:'e.g. Incomplete information', confirmText:'Next' })) || '';
  if (!(await DropzyyModal.confirm({ title:'Reject vendor application', message:`Reject ${app.full_name || 'this applicant'}'s vendor application${reason ? ' with reason: ' + reason : ''}?`, confirmText:'Reject application', danger:true }))) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to reject', 'error'); return false; }
    const { error } = await supabase.rpc('admin_review_vendor_application', { p_application_id: appId, p_status: 'Rejected', p_response: reason.trim() || 'Rejected — please reach out via Report an Issue if you have questions.' });
    if (error) throw error;
    toast('Vendor application rejected');
    await loadVendorApplicationsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Vendor application rejection failed:', err);
    toast('Rejection failed: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

// Save a status change + optional admin response (admin only — RLS-enforced
// by vendor_applications_update_admin). Also used to re-open / re-approve.
async function updateVendorApplicationReview(appId, newStatus, adminResponse) {
  const state = currentAdminState();
  if (!appId) return false;
  if (!VENDOR_APP_STATUS_OPTIONS.includes(newStatus)) {
    toast('Invalid application status', 'error');
    return false;
  }
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to review', 'error'); return false; }
    const app = state.vendorApplications.find(a => a.id === appId);
    if (newStatus === 'Approved' && (!app || !app.vendor_id)) {
      // Approving from the review row reuses the full approval path (storefront
      // creation + vendor activation) so the backend state stays consistent.
      return await approveVendorApplication(appId);
    }
    const { error } = await supabase.rpc('admin_review_vendor_application', { p_application_id: appId, p_status: newStatus, p_response: (adminResponse || '').trim() || null });
    if (error) throw error;
    toast(`Application marked ${newStatus}`);
    await loadVendorApplicationsFromSupabase();
    renderAdminWorkspace();
    return true;
  } catch (err) {
    console.error('Vendor application review failed:', err);
    toast('Review failed: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

// Render the Vendor Applications table body. Pending applications are
// highlighted and carry approve/reject actions; every row has a status select
// + admin-response field so admins can update progress and respond.
function renderVendorApplicationRows() {
  if (state.vendorApplicationsLoading && !state.vendorApplications.length) {
    return '<tr><td colspan="8" class="muted center">Loading vendor applications…</td></tr>';
  }
if (!state.vendorApplicationsLoading && state.vendorApplicationsError) {
    return `<tr><td colspan="8" class="muted center">Could not load vendor applications: ${escHtml(state.vendorApplicationsError)}. Please refresh.</td></tr>`;
  }
  if (!state.vendorApplications.length) {
    return '<tr><td colspan="8" class="muted center">No vendor applications yet — they appear here as soon as students submit the Become a Vendor form.</td></tr>';
  }
  return state.vendorApplications.map(a => {
    const isPending = a.status === 'Pending';
    const statusCls = a.status === 'Approved' ? 'approved' : a.status === 'Rejected' ? 'cancelled' : 'pending';
    const offer = a.what_they_want_to_sell || '';
    return `
      <tr class="${isPending ? 'report-row--open' : ''}" data-vendor-app-row="${a.id}">
        <td><b>${escHtml(a.full_name || '—')}</b><div class="muted small">${escHtml(a.email || '')}${a.phone ? '<br>' + escHtml(a.phone) : ''}</div></td>
        <td>${escHtml(a.matric_number || '—')}</td>
        <td class="muted small">${escHtml(a.college || '—')}${a.department ? '<br>' + escHtml(a.department) : ''}</td>
        <td class="report-desc">${escHtml(offer)}</td>
        <td>${escHtml(a.expected_price_range || '—')}</td>
        <td><span class="status-badge report-status--${statusCls}">${escHtml(a.status)}</span>${a.vendor_id ? `<div class="muted xs">${escHtml(a.vendor_id)}</div>` : ''}</td>
        <td class="muted small">${a.created_at ? formatDate(a.created_at) : '—'}</td>
        <td>
          <div class="row row--wrap" style="gap:6px">
            ${isPending
              ? `<button class="link-btn" data-approve-vendor-app="${a.id}">Approve</button>
                 <button class="link-btn btn--danger" data-reject-vendor-app="${a.id}">Reject</button>`
              : ''}
            <select class="select select--sm" data-vendor-app-status="${a.id}" style="max-width:120px">
              ${VENDOR_APP_STATUS_OPTIONS.map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <input class="input" style="max-width:220px;min-width:130px" placeholder="Admin response" data-vendor-app-response="${a.id}" value="${escHtml(a.admin_response || '')}">
            <button class="link-btn" data-review-vendor-app="${a.id}">Save</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ============================================
// Exposed API for the unified admin flow
// ============================================
// The admin panel is embedded inside the main app (index.html) rather than a
// separate admin.html page. These functions are exposed on window.AdminHub so
// that app.js can delegate #/admin routing to them. Auto-init is NOT performed
// here — app.js calls window.AdminHub.init() when the user navigates to an
// admin route.

window.AdminHub = {
  clearAuthState,
  init,
  checkAuth,
  login,
  logout,
  renderLogin,
  renderAdminWorkspace,
  renderCatalog,
  addVendor,
  deleteVendor,
  toggleVendor,
  editVendor,
  addProduct,
  deleteProduct,
  editProduct,
  updateOrderStatus,
  loadCatalog,
  loadOrders,
  loadRiders,
  loadWithdrawals,
  loadWithdrawalsFromSupabase,
  loadRefundsFromSupabase,
  reviewWithdrawal,
  loadReportsFromSupabase,
  updateReportReview,
  loadVendorApplicationsFromSupabase,
  approveVendorApplication,
  rejectVendorApplication,
  updateVendorApplicationReview,
  approveRider,
  rejectRider,
  suspendRider,
  unsuspendRider,
  assignUserToVendor,
  loadAssignableUsers,
  setOrderFilter,
  resetOrderFilter
};

// Admin logout button (uses a unique ID to avoid conflict with the customer
// logout button in app.js — both are called "logoutBtn" in their respective
// contexts, so we use "adminLogoutBtn" here).
document.addEventListener('click', async (e) => {
  if (e.target.id === 'adminLogoutBtn' || e.target.closest('#adminLogoutBtn')) {
    if (await DropzyyModal.confirm({ title:'Sign out', message:'Sign out of admin panel?', confirmText:'Sign out' })) {
      logout();
    }
  }
});

// Section navigation: any element carrying data-admin-nav switches the active
// admin section and re-renders the workspace. Used by the sidebar links,
// dashboard "needs attention" rows and quick-action buttons.
document.addEventListener('click', (e) => {
  const navTrigger = e.target.closest('[data-admin-nav]');
  if (!navTrigger) return;
  const key = navTrigger.getAttribute('data-admin-nav');
  if (key && key !== adminSection) {
    adminSection = key;
    document.getElementById('adminNav')?.classList.remove('is-open');
    renderAdminWorkspace();
    window.scrollTo({ top: 0 });
  }
});

// Auto-initialize when the admin shell is loaded directly (backward
// compatible). Matched on EITHER the pretty Netlify route (/admin — served
// from assets/html/admin.html by rewrite) OR the literal file path, because
// `includes('admin.html')` alone never fires on /admin and the standalone
// panel would render an empty page.
// When loaded inside index.html, app.js controls initialization via
// window.AdminHub.init() when the user navigates to an admin route.
if (window.location.pathname.includes('admin.html') || /(^|\/)admin\/?$/.test(window.location.pathname)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// ============================================
// Admin Order Statistics & Filtering
// ============================================
// These helpers derive aggregate statistics and apply client-side filtering
// over the Supabase-sourced order set. The order DATA itself always comes
// from Supabase (see loadOrdersFromSupabase) — no localStorage fallback is
// ever mixed in, so stats and lists never include phantom/stale orders.

// Returns true for orders that are still in flight (not completed / cancelled).
function isOrderActive(order) {
  const s = order.status || 'Order confirmed';
  return !COMPLETED_STATUSES.includes(s) && s !== CANCELLED_STATUS;
}

// Returns true for terminal completed orders (Delivered or Rated).
function isOrderCompleted(order) {
  return COMPLETED_STATUSES.includes(order.status || 'Order confirmed');
}

// Returns true for cancelled orders.
function isOrderCancelled(order) {
  return (order.status || 'Order confirmed') === CANCELLED_STATUS;
}

// Map an order status string to a CSS badge class.
function orderStatusClass(status) {
  const s = status || 'Order confirmed';
  if (s === CANCELLED_STATUS) return 'status--cancelled';
  if (COMPLETED_STATUSES.includes(s)) return 'status--completed';
  if ([ 'On the Way', 'Rider assigned', 'Picked up' ].includes(s)) return 'status--active';
  return 'status--pending';
}

// Apply the active client-side filter to a list of orders.
// Returns a new array; the original order objects are never mutated.
function applyOrderFilter(orders) {
  if (!orders || !Array.isArray(orders)) return [];
  return orders.filter(order => {
    const status = order.status || 'Order confirmed';

    // --- Status group filter ---
    if (orderFilter.status === 'active' && !isOrderActive(order)) return false;
    if (orderFilter.status === 'completed' && !isOrderCompleted(order)) return false;
    if (orderFilter.status === 'cancelled' && !isOrderCancelled(order)) return false;

    // --- Exact status filter ---
    // Any value that isn't one of the group keywords above is a real order
    // status (e.g. 'Order confirmed', 'Preparing', 'On the Way'), so match it
    // exactly — never create or rename statuses here.
    if (orderFilter.status !== 'all' && status !== orderFilter.status) return false;

    // --- Date filter ---
    // Compare YYYY-MM-DD date parts (order.created is a full ISO timestamp, so
    // a plain string compare of the raw strings would make the "To" boundary
    // exclusive). Slice both sides to the date so From and To are inclusive.
    const createdDate = order.created ? String(order.created).slice(0, 10) : '';
    if (orderFilter.dateFrom && createdDate && createdDate < orderFilter.dateFrom) return false;
    if (orderFilter.dateTo && createdDate && createdDate > orderFilter.dateTo) return false;

    return true;
  });
}

// Update a single filter key and re-render the workspace.
function setOrderFilter(key, value) {
  if (key in orderFilter) {
    orderFilter[key] = value;
    renderAdminWorkspace();
  }
}

// Reset all order filters back to their defaults.
function resetOrderFilter() {
  orderFilter = { status: 'all', dateFrom: '', dateTo: '' };
  renderAdminWorkspace();
}

// Format an ISO date string into a short locale date for the table.
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Load all orders and their items for the admin workspace. The public order
// number is kept for display, while the database id is retained for updates.
async function loadOrdersFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) return null;
  try {
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    let orderItemsData = [];
    if (ordersData.length) {
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', ordersData.map(order => order.id));
      if (error) throw error;
      orderItemsData = data || [];
    }

    const itemsByOrder = {};
    orderItemsData.forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.product_id,
        vendor: item.vendor_id,
        name: item.name,
        price: item.price,
        icon: item.icon,
        qty: item.qty
      });
    });

    return ordersData.map(order => ({
      id: order.order_number,
      dbId: order.id,
      items: itemsByOrder[order.id] || [],
      total: order.total,
      // Fallback only — the authoritative fee is orders.fee. `!= null` (not
      // truthiness) so a legitimate vendor_self fee of 0 is not replaced, and
      // the fallback matches the current flat ₦1,500 campus delivery fee.
      fee: order.fee != null ? order.fee : 1500,
      status: order.status || 'Order confirmed',
      payment_status: order.payment_status || null,
      delivery_method: order.delivery_method || 'rider',
      rider_id: order.rider_id || null,
      user_id: order.user_id || null,
      spot: order.spot || '',
      created: order.created_at
    }));
  } catch (err) {
    console.error('Supabase orders load failed:', err);
    return null;
  }
}

// Load all orders from Supabase. Supabase is the sole source of truth for
// admin orders — we deliberately do NOT merge with localStorage here, because
// doing so would surface phantom/stale orders that no longer exist (or never
// existed) in the database. If Supabase is unavailable or the query fails, we
// surface an empty list with an error flag so the admin is never shown stale
// data. Admin access itself requires Supabase auth, so the unavailable case
// only occurs transiently.
async function loadOrders() {
  const state = currentAdminState();
  state.ordersLoading = true;
  state.ordersError = null;

  const supabaseOrders = await loadOrdersFromSupabase();

  if (!supabaseOrders) {
    // Supabase returned null → unavailable or query failed. Do NOT fall back
    // to localStorage; that is exactly what produces phantom/stale orders.
    state.orders = [];
    state.ordersError = 'Could not load orders from Supabase. Please try again.';
    state.ordersLoading = false;
    return;
  }

  state.orders = supabaseOrders;
  state.ordersLoading = false;
}

async function updateOrderStatus(orderId, status) {
  const state = currentAdminState();
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;

  // Duplicate-submission guard: ignore re-triggers (rapid select changes,
  // double Save clicks) while this order's save is still in flight.
  if (orderStatusSaving.has(orderId)) return;
  // No-op: the select already reflects this status — nothing to persist.
  if (status === order.status) { renderAdminWorkspace(); return; }

  orderStatusSaving.add(orderId);

  // Optimistically update the in-memory order so the UI responds immediately.
  const prevStatus = order.status;
  order.status = status;

  try {
    // Supabase is the source of truth — we never write orders to localStorage.
    if (!order.dbId || !supabaseAvailable()) {
      toast('Order status saved locally (offline mode)', 'error');
      return;
    }

    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_update_order_status', { p_order_id: order.dbId, p_status: status });
    if (error) throw error;
    // Success toast fires ONLY after the server confirms (no error above).
    toast('Order status updated');
  } catch (err) {
    console.error('Supabase order status update failed:', err);
    // Roll back to the previous status so the UI never shows a value that
    // was never persisted to the database.
    order.status = prevStatus;
    toast('Could not update order status: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    orderStatusSaving.delete(orderId);
    renderAdminWorkspace();
  }
}

// Load all rider applications from Supabase.
async function loadRidersFromSupabase() {
  const state = currentAdminState();
  if (!supabaseAvailable()) return null;
  try {
    const { data: ridersData, error: ridersError } = await supabase
      .from('riders')
      .select('*')
      .order('created_at', { ascending: false });
    if (ridersError) throw ridersError;

    return ridersData.map(rider => ({
      id: rider.id,
      dbId: rider.id,
      matric_number: rider.matric_number || '',
      phone: rider.phone || '',
      status: rider.status || 'pending',
      created_at: rider.created_at
    }));
  } catch (err) {
    console.error('Supabase riders load failed:', err);
    return null;
  }
}

async function loadRiders() {
  const state = currentAdminState();
  const localRiders = load('riders', []);
  const supabaseRiders = await loadRidersFromSupabase();
  if (!supabaseRiders) {
    state.riders = localRiders;
    return;
  }

  const remoteRiderIds = new Set(supabaseRiders.map(rider => rider.id));
  state.riders = [...supabaseRiders, ...localRiders.filter(rider => !remoteRiderIds.has(rider.id))];
  store('riders', state.riders);
}

async function loadRiderMetrics() {
  const metrics = {};
  await Promise.all((state.riders || []).filter(r => r.dbId).map(async rider => {
    try {
      const [{ data: earnings }, { data: ratings }] = await Promise.all([
        supabase.rpc('get_rider_earnings', { p_rider_id: rider.dbId }),
        supabase.from('rider_ratings').select('id,order_id,rating,review,created_at').eq('rider_id', rider.dbId).order('created_at', { ascending: false }).limit(10)
      ]);
      const active = state.orders.filter(o => o.rider_id === rider.id && ['Rider assigned','Picked up','On the Way'].includes(o.status)).length;
      const completed = state.orders.filter(o => o.rider_id === rider.id && ['Delivered','Rated'].includes(o.status)).length;
      metrics[rider.id] = { earnings: earnings || null, ratings: ratings || [], active, completed };
    } catch (err) { metrics[rider.id] = { error: err.message || 'Could not load rider metrics' }; }
  }));
  state.riderMetrics = metrics;
}

async function approveRider(riderId) {
  const state = currentAdminState();
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;
  const previousStatus = rider.status; const previousAvailable = rider.available;

  rider.status = 'approved';
  rider.available = true;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider approval failed: Supabase unavailable', 'error');
    renderAdminWorkspace();
    return;
  }

  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_set_rider_status', { p_rider_id: rider.dbId, p_status: 'approved' });
    if (error) throw error;
    toast('Rider approved');
  } catch (err) {
    console.error('Supabase rider approval failed:', err);
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider approval failed: ' + (err.message || 'Supabase mutation failed'), 'error');
  }

  renderAdminWorkspace();
}

async function rejectRider(riderId) {
  const state = currentAdminState();
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;
  const previousStatus = rider.status; const previousAvailable = rider.available;

  rider.status = 'rejected';
  rider.available = false;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider rejection failed: Supabase unavailable', 'error');
    renderAdminWorkspace();
    return;
  }

  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_set_rider_status', { p_rider_id: rider.dbId, p_status: 'rejected' });
    if (error) throw error;
    toast('Rider rejected');
  } catch (err) {
    console.error('Supabase rider rejection failed:', err);
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider rejection failed: ' + (err.message || 'Supabase mutation failed'), 'error');
  }

  renderAdminWorkspace();
}

// Suspend an approved rider. Sets status to 'suspended' and available to false
// so the rider is no longer treated as an approved/active rider. Mirrors the
// existing approve/reject flow (local state + Supabase + re-render + toast).
async function suspendRider(riderId) {
  const state = currentAdminState();
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;
  const previousStatus = rider.status; const previousAvailable = rider.available;

  rider.status = 'suspended';
  rider.available = false;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider suspension failed: Supabase unavailable', 'error');
    renderAdminWorkspace();
    return;
  }

  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_set_rider_status', { p_rider_id: rider.dbId, p_status: 'suspended' });
    if (error) throw error;
    toast('Rider suspended');
  } catch (err) {
    console.error('Supabase rider suspension failed:', err);
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider suspension failed: ' + (err.message || 'Supabase mutation failed'), 'error');
  }

  renderAdminWorkspace();
}

// Unsuspend a rider whose status is 'suspended'. Sets status to 'approved' and
// available to true so the rider regains access to the Rider Hub. Mirrors the
// existing approve/suspend flow (local state + Supabase + re-render + toast).
// Does NOT touch profiles.role. The direct Supabase UPDATE reuses the same
// server-side mechanism as approve/suspend (riders_update_admin RLS +
// prevent_rider_status_escalation trigger allow admins to set rider status).
async function unsuspendRider(riderId) {
  const state = currentAdminState();
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;
  const previousStatus = rider.status; const previousAvailable = rider.available;
 
  rider.status = 'approved';
  rider.available = true;
  store('riders', state.riders);
 
  if (!rider.dbId || !supabaseAvailable()) {
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider unsuspension failed: Supabase unavailable', 'error');
    renderAdminWorkspace();
    return;
  }
 
  try {
    if (!await ensureAdminAal2()) throw new Error('AAL2/MFA is required for this admin operation');
    const { error } = await supabase.rpc('admin_set_rider_status', { p_rider_id: rider.dbId, p_status: 'approved' });
    if (error) throw error;
    toast('Rider unsuspended');
  } catch (err) {
    console.error('Supabase rider unsuspend failed:', err);
    rider.status = previousStatus; rider.available = previousAvailable; store('riders', state.riders);
    toast('Rider unsuspension failed: ' + (err.message || 'Supabase mutation failed'), 'error');
  }
 
  renderAdminWorkspace();
}

})(); // End of admin module IIFE
