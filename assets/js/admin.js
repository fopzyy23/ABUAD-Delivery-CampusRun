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
  users: [],
  withdrawals: [],
  withdrawalsLoading: false,
  withdrawalsError: null,
  refunds: [],
  refundsLoading: false,
  refundsError: null,
  reports: [],
  reportsLoading: false,
  reportsError: null,
  vendorApplications: [],
  vendorApplicationsLoading: false,
  vendorApplicationsError: null
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

// Statuses that represent a terminal, completed order (no longer active).
const COMPLETED_STATUSES = ['Delivered', 'Rated'];
// Status that represents a cancelled order.
const CANCELLED_STATUS = 'Cancelled';

// Supabase authentication tracking
let supabaseAdminUser = null;

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
  if (!supabaseAvailable()) return false;
  try {
    const { error } = await supabase
      .from('vendors')
      .upsert(vendorToRow(vendor), { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase vendor sync failed:', err);
    return false;
  }
}

// Upsert a product into Supabase. Returns true on success, false on failure.
async function syncProductToSupabase(product) {
  if (!supabaseAvailable()) return false;
  try {
    const { error } = await supabase
      .from('products')
      .upsert(productToRow(product), { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase product sync failed:', err);
    return false;
  }
}

// Delete a vendor and all its products from Supabase.
async function deleteVendorFromSupabase(vendorId) {
  if (!supabaseAvailable()) return false;
  try {
    // Delete products belonging to this vendor first (FK constraint)
    const { error: productError } = await supabase
      .from('products')
      .delete()
      .eq('vendor_id', vendorId);
    if (productError) throw productError;

    const { error: vendorError } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendorId);
    if (vendorError) throw vendorError;
    return true;
  } catch (err) {
    console.error('Supabase vendor delete failed:', err);
    return false;
  }
}

// Deactivate a product in Supabase (set active = false) instead of hard-deleting.
async function deactivateProductInSupabase(productId) {
  if (!supabaseAvailable()) return false;
  try {
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', productId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase product deactivate failed:', err);
    return false;
  }
}

// Load the catalog from Supabase. Returns the catalog object or null on failure.
async function loadCatalogFromSupabase() {
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
    return { vendors, products };
  } catch (err) {
    console.error('Supabase catalog load failed:', err);
    return null;
  }
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
    { id: 'bookshop', name: 'Campus Bookshop', icon: '📚', type: 'Bookshop', rating: '4.7', time: '5–10 min', cover: '#d8e0ff', open: true, delivery_method: 'rider', description: 'Textbooks, stationery and study essentials.', opening_hours: 'Mon–Fri 08:00–17:00, Sat 09:00–13:00' },
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
    { id: 74, vendor: 'smoothie-shack', name: 'Macaroni', desc: 'Price is subject to confirmation.', price: 500, icon: '🍝', category: 'Meals' },
    { id: 75, vendor: 'bookshop', name: 'Engineering Mathematics Textbook', desc: 'Advanced Engineering Mathematics by Kreyszig.', price: 15000, icon: '📘', category: 'Bookshop' },
    { id: 76, vendor: 'bookshop', name: 'University Physics Textbook', desc: 'Physics for Scientists and Engineers.', price: 12000, icon: '📕', category: 'Bookshop' },
    { id: 77, vendor: 'bookshop', name: 'Organic Chemistry Textbook', desc: 'Organic Chemistry by Morrison and Boyd.', price: 10000, icon: '📗', category: 'Bookshop' },
    { id: 78, vendor: 'bookshop', name: 'Biology Textbook', desc: 'Campbell Biology for students.', price: 18000, icon: '📙', category: 'Bookshop' },
    { id: 79, vendor: 'bookshop', name: 'Calculus Textbook', desc: 'Calculus by Thomas.', price: 14000, icon: '📐', category: 'Bookshop' },
    { id: 80, vendor: 'bookshop', name: 'Law Textbook', desc: 'Nigerian Legal Methods.', price: 20000, icon: '⚖️', category: 'Bookshop' },
    { id: 81, vendor: 'bookshop', name: 'Anatomy Textbook', desc: 'Gray Anatomy for Students.', price: 25000, icon: '🩺', category: 'Bookshop' },
    { id: 82, vendor: 'bookshop', name: 'A4 Notebook (80 pages)', desc: 'Hardcover lecture notebook.', price: 1500, icon: '📓', category: 'Bookshop' },
    { id: 83, vendor: 'bookshop', name: 'Pen (Biro)', desc: 'Blue or black ink pen.', price: 200, icon: '🖊️', category: 'Bookshop' },
    { id: 84, vendor: 'bookshop', name: 'Pencil Set', desc: 'HB pencil with eraser.', price: 150, icon: '✏️', category: 'Bookshop' },
    { id: 85, vendor: 'bookshop', name: 'Scientific Calculator', desc: 'Casio fx-991S.', price: 12000, icon: '🧮', category: 'Bookshop' },
    { id: 86, vendor: 'bookshop', name: 'Geometry Set', desc: 'Ruler, set square and protractor.', price: 1000, icon: '📏', category: 'Bookshop' },
    { id: 87, vendor: 'bookshop', name: 'Highlighters (Pack of 4)', desc: 'Assorted colours.', price: 1200, icon: '🖍️', category: 'Bookshop' },
    { id: 88, vendor: 'bookshop', name: 'A4 Drawing Book', desc: 'For technical drawing and art.', price: 2000, icon: '🎨', category: 'Bookshop' },
    { id: 89, vendor: 'bookshop', name: 'File Folder', desc: 'Document folder for assignments.', price: 800, icon: '📁', category: 'Bookshop' },
    { id: 90, vendor: 'bookshop', name: 'Stapler and Staples', desc: 'Office stapler with pins.', price: 2500, icon: '📎', category: 'Bookshop' },
    { id: 91, vendor: 'campus-drinks', name: 'Coca-Cola', desc: 'Classic refreshing cola drink.', price: 300, icon: '🥤', category: 'Drinks' },
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
  el.textContent = message;
  $('#toastRoot').append(el);
  setTimeout(() => el.remove(), 3400);
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
  if (!supabaseAvailable() || !supabaseAdminUser) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseAdminUser.id)
      .maybeSingle();
    if (error) throw error;
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
  // Admin access requires Supabase. If it is unavailable, deny access.
  if (!supabaseAvailable()) {
    console.error('Admin auth denied: Supabase is not available.');
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      console.error('Admin auth denied: no valid Supabase session.');
      return false;
    }
    supabaseAdminUser = session.user;
    const profile = await fetchAdminProfile();
    if (!profile || profile.role !== 'admin') {
      console.error('Admin auth denied: profile role is not exactly "admin".');
      state.isAuthenticated = false;
      supabaseAdminUser = null;
      return false;
    }
    state.isAuthenticated = true;
    return true;
  } catch (err) {
    console.error('Supabase session check failed:', err);
    state.isAuthenticated = false;
    supabaseAdminUser = null;
    return false;
  }
}

// Sign in via Supabase Auth only. If Supabase is unavailable or signInWithPassword
// fails, admin login is denied — there is no fallback.
async function login(email, password) {
  // Admin login requires Supabase. If it is unavailable, deny login.
  if (!supabaseAvailable()) {
    toast('Admin login unavailable: Supabase authentication is not configured.', 'error');
    return false;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('No user returned from Supabase authentication.');

    supabaseAdminUser = data.user;
    const profile = await fetchAdminProfile();
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
  state.isAuthenticated = false;
  supabaseAdminUser = null;
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
// stale localStorage data that predates new catalog entries (e.g. the drinks and
// bookshop vendors) so those sections are always present.
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
  // Try to load from Supabase first (source of truth)
  const supabaseCatalog = await loadCatalogFromSupabase();
  if (supabaseCatalog) {
    state.catalog = supabaseCatalog;
    store('catalog_v3', state.catalog);
    return;
  }
  // Fall back to localStorage if Supabase is unavailable
  state.catalog = mergeSeedIntoStored(load('catalog_v3', clone(SEED_DATA)));
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

  const existingIndex = state.catalog.vendors.findIndex(v => v.id === vendor.id);
  if (existingIndex >= 0) {
    state.catalog.vendors[existingIndex] = vendor;
  } else {
    state.catalog.vendors.push(vendor);
  }

  // Save to localStorage (fallback)
  saveCatalog();

  // Sync to Supabase
  const synced = await syncVendorToSupabase(vendor);
  if (!synced) {
    toast('Vendor saved locally (Supabase sync failed)', 'error');
  } else {
    toast('Vendor saved successfully');
  }

  renderAdminWorkspace();
}

async function deleteVendor(vendorId) {
  if (confirm('Delete this vendor and all its products?')) {
    const vendorProductIds = state.catalog.products.filter(p => p.vendor === vendorId).map(p => p.id);
    state.catalog.vendors = state.catalog.vendors.filter(v => v.id !== vendorId);
    state.catalog.products = state.catalog.products.filter(p => p.vendor !== vendorId);
    // Remove any cart entries that referenced the deleted vendor's products
    const cart = load('cart', []);
    store('cart', cart.filter(x => !vendorProductIds.includes(x.id)));

    // Save to localStorage (fallback)
    saveCatalog();

    // Sync to Supabase
    const synced = await deleteVendorFromSupabase(vendorId);
    if (!synced) {
      toast('Vendor deleted locally (Supabase sync failed)', 'error');
    } else {
      toast('Vendor deleted');
    }

    renderAdminWorkspace();
  }
}

async function toggleVendor(vendorId) {
  const vendor = state.catalog.vendors.find(v => v.id === vendorId);
  if (vendor) {
    vendor.open = !vendor.open;

    // Save to localStorage (fallback)
    saveCatalog();

    // Sync to Supabase
    const synced = await syncVendorToSupabase(vendor);
    if (!synced) {
      toast(`Vendor ${vendor.open ? 'opened' : 'closed'} locally (Supabase sync failed)`, 'error');
    } else {
      toast(`Vendor ${vendor.open ? 'opened' : 'closed'}`);
    }

    renderAdminWorkspace();
  }
}

// ============================================
// Product Management
// ============================================
async function addProduct(formData) {
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

  const existingIndex = state.catalog.products.findIndex(p => p.id === product.id);
  if (existingIndex >= 0) {
    state.catalog.products[existingIndex] = product;
  } else {
    state.catalog.products.push(product);
  }

  // Save to localStorage (fallback)
  saveCatalog();

  // Sync to Supabase
  const synced = await syncProductToSupabase(product);
  if (!synced) {
    toast('Product saved locally (Supabase sync failed)', 'error');
  } else {
    toast('Product saved successfully');
  }

  renderAdminWorkspace();
}

async function deleteProduct(productId) {
  if (confirm('Delete this product?')) {
    state.catalog.products = state.catalog.products.filter(p => p.id !== Number(productId));
    // Remove any cart entries that referenced the deleted product
    const cart = load('cart', []);
    store('cart', cart.filter(x => x.id !== Number(productId)));

    // Save to localStorage (fallback)
    saveCatalog();

    // Deactivate in Supabase (soft delete — keeps FK integrity)
    const synced = await deactivateProductInSupabase(Number(productId));
    if (!synced) {
      toast('Product deleted locally (Supabase sync failed)', 'error');
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
  const authed = await checkAuth();
  if (!authed) {
    // Not authenticated — render the login screen so the user can sign in.
    renderLogin();
    return false;
  }
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
    await loadOrders();
    await loadRiders();
    await loadAssignableUsers();
  }
  // Withdrawal requests are always refreshed on admin entry so newly
  // submitted rider requests appear even after the first lazy load.
  await loadWithdrawalsFromSupabase();
  // Refund requests are always refreshed on admin entry.
  await loadRefundsFromSupabase();
  // Issue reports are always refreshed on admin entry so new reports from
  // customers (homepage "Report an Issue") appear.
  await loadReportsFromSupabase();
  // Vendor applications are refreshed on entry so new "Become a Vendor"
  // submissions appear for review.
  await loadVendorApplicationsFromSupabase();
  // If orders failed to load, the error banner renders here.
  renderAdminWorkspace();
  return true;
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
              <label>Admin email</label>
              <input required class="input" type="email" name="email" placeholder="admin@dropzyy.app" autocomplete="email">
            </div>
            <div class="field">
              <label>Admin password</label>
              <input required class="input" type="password" name="password" placeholder="Enter admin password" autocomplete="current-password">
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

function renderAdminWorkspace() {
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

  const app = $('#app');
  app.innerHTML = `
    ${adminNav()}
    <section class="section container">
      <div class="page-head">
        <div>
          <span class="badge badge--brand">Platform Control</span>
          <h1 class="mt-1">Content Manager</h1>
          <p class="muted">Changes are saved instantly and appear across the customer pages.</p>
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

      <!-- Add Vendor Form -->
      <div class="split mt-3">
        <form class="card stack" id="vendorForm">
          <div class="card__head">
            <h3 id="vendorFormTitle">Add Vendor</h3>
            <button class="link-btn" type="button" id="clearVendorForm">Clear</button>
          </div>
          <input type="hidden" name="id">
          <div class="form-grid">
            <div class="field">
              <label>Vendor Name</label>
              <input class="input" name="name" required placeholder="e.g. Campus Pharmacy">
            </div>
            <div class="field">
              <label>Type</label>
              <input class="input" name="type" required placeholder="e.g. Essentials">
            </div>
            <div class="field">
              <label>Icon</label>
              <input class="input" name="icon" value="🏪" maxlength="8">
            </div>
            <div class="field">
              <label>Delivery Time</label>
              <input class="input" name="time" value="15–25 min">
            </div>
            <div class="field">
              <label>Rating</label>
              <input class="input" name="rating" type="number" min="0" max="5" step="0.1" value="4.5">
            </div>
            <div class="field">
              <label>Cover Colour</label>
              <input class="input" name="cover" value="#d9f5e9" pattern="#[0-9a-fA-F]{6}">
            </div>
            <div class="field">
              <label>Image URL (optional)</label>
              <input class="input" name="image" placeholder="https://… shown on vendor cards when set">
            </div>
            <div class="field">
              <label>Opening Hours (optional)</label>
              <input class="input" name="opening_hours" placeholder="e.g. Mon–Fri 08:00–18:00, Sat 09:00–14:00">
            </div>
            <div class="field col-2">
              <label>Description (optional)</label>
              <textarea class="textarea" name="description" placeholder="A short blurb shown on the vendor card."></textarea>
            </div>
            <div class="field">
              <label>Delivery Method</label>
              <select class="select" name="delivery_method">
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

        <!-- Add Product Form -->
        <form class="card stack" id="productForm">
          <div class="card__head">
            <h3 id="productFormTitle">Add Product</h3>
            <button class="link-btn" type="button" id="clearProductForm">Clear</button>
          </div>
          <input type="hidden" name="id">
          <div class="form-grid">
            <div class="field">
              <label>Product Name</label>
              <input class="input" name="name" required placeholder="e.g. Meat pie">
            </div>
            <div class="field">
              <label>Vendor</label>
              <select class="select" name="vendor" required>
                ${vendors.map(v => `<option value="${escHtml(v.id)}">${escHtml(v.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Price (₦)</label>
              <input class="input" name="price" required min="0" type="number" placeholder="1000">
            </div>
            <div class="field">
              <label>Category</label>
              <input class="input" name="category" required placeholder="Food">
            </div>
            <div class="field">
              <label>Icon</label>
              <input class="input" name="icon" value="🍽️" maxlength="8">
            </div>
            <div class="field col-2">
              <label>Image URL (optional)</label>
              <input class="input" name="image" placeholder="https://… shown on product cards when set">
            </div>
            <div class="field col-2">
              <label>Description</label>
              <textarea class="textarea" name="desc" required placeholder="A short description for customers."></textarea>
            </div>
          </div>
          <button class="btn btn--block" type="submit">Save Product</button>
        </form>
      </div>

      <!-- Vendors Table -->
      <div class="card mt-3">
        <div class="card__head">
          <h3>Vendors</h3>
          <span class="muted small">Edit availability or details</span>
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
                  <td>${v.icon} <b>${escHtml(v.name)}</b></td>
                  <td>${escHtml(v.type)}</td>
                  <td>${v.time}</td>
                  <td>${v.delivery_method || 'rider'}</td>
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

      <!-- Products Table -->
      <div class="card mt-3">
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
                    <td>${p.icon} <b>${escHtml(p.name)}</b></td>
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

      <!-- Orders Table -->
      <div class="card mt-3">
        <div class="card__head">
          <h3>Orders</h3>
          <span class="muted small">${filteredOrders.length} of ${orders.length} order${orders.length !== 1 ? 's' : ''}</span>
        </div>

        ${state.ordersError
          ? `<div class="orders-error">⚠ ${state.ordersError}</div>`
          : ''}

        <!-- Order Status Filters / Tabs -->
        <div class="admin-filters">
          <div class="filter-tabs">
            <button type="button" class="filter-tab ${orderFilter.status === 'all' ? 'is-active' : ''}" data-order-filter="all">All Orders</button>
            <button type="button" class="filter-tab ${orderFilter.status === 'active' ? 'is-active' : ''}" data-order-filter="active">Active</button>
            <button type="button" class="filter-tab ${orderFilter.status === 'completed' ? 'is-active' : ''}" data-order-filter="completed">Completed</button>
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
                      </td>
                    </tr>
                  `).join('')
                  : '<tr><td colspan="7" class="muted center">No orders match the current filters.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Rider Applications Section -->
      <div class="card mt-3">
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

      <!-- Vendor Assignment Section (admin only) -->
      <div class="card mt-3">
        <div class="card__head">
          <h3>Vendor Assignment</h3>
          <span class="muted small">Assign users (role = user) to a vendor. Admin only.</span>
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

      <!-- Refund Management Section -->
      <div class="card mt-3">
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

      <!-- Issue Reports Section (customer "Report an Issue") -->
      <div class="card mt-3">
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
    </section>
  `;

  // Attach event listeners
  attachAdminEventListeners();
}

function attachAdminEventListeners() {

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

  // Order status filter tabs (All / Active / Completed / Cancelled)
  document.querySelectorAll('[data-order-filter]').forEach(tab => {
    tab.addEventListener('click', () => setOrderFilter('status', tab.dataset.orderFilter));
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
    btn.addEventListener('click', () => {
      if (confirm('Approve this refund request? This will mark it as approved and ready for execution.')) {
        approveRefund(btn.dataset.approveRefund);
      }
    });
  });

  // Reject a refund request (with reason prompt)
  document.querySelectorAll('[data-reject-refund]').forEach(btn => {
    btn.addEventListener('click', () => {
      const reason = prompt('Reason for rejection (optional):') || '';
      if (confirm(`Reject this refund request${reason ? ' with reason: ' + reason : ''}?`)) {
        rejectRefund(btn.dataset.rejectRefund, reason);
      }
    });
  });

  // Execute an approved refund via Paystack Edge Function
  document.querySelectorAll('[data-execute-refund]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Execute this refund through Paystack? This will initiate an actual refund transaction. This action cannot be undone.')) {
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
  if (!userId) return false;
  if (!supabaseAvailable()) {
    toast('Assignment unavailable: Supabase is not configured.', 'error');
    return false;
  }
  try {
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
    toast('Assignment failed: ' + (err.message || 'Unknown error'), 'error');
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
      admin_note: w.admin_note || ''
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
  await loadWithdrawalsFromSupabase();
}

// Admin decides a withdrawal request (pending → approved/rejected/paid). The
// request's amount is never changed — only its review outcome. reviewed_by is
// the authenticated admin's own auth.uid(), set on the client but gated by the
// admin-only UPDATE policy server-side.
async function reviewWithdrawal(requestId, newStatus, note) {
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
    const { error } = await supabase
      .from('withdrawal_requests')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.user.id,
        admin_note: (note || '').trim() || null
      })
      .eq('id', requestId);
    if (error) throw error;
    toast(`Withdrawal request marked ${newStatus}`);
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
    return '<tr><td colspan="6" class="muted center">Loading withdrawal requests…</td></tr>';
  }
  if (!state.withdrawalsLoading && state.withdrawalsError) {
    return `<tr><td colspan="6" class="muted center">Could not load withdrawal requests (${String(state.withdrawalsError).replace(/"/g, '&quot;')}). Please refresh.</td></tr>`;
  }
  if (!state.withdrawals.length) {
    return '<tr><td colspan="6" class="muted center">No withdrawal requests yet.</td></tr>';
  }
  const riderFor = id => state.riders.find(r => r.id === id);
  return state.withdrawals.map(w => {
    const rider = riderFor(w.rider_id);
    const ident = rider
      ? `${escHtml(rider.matric_number) || '—'}<div class="muted small">${escHtml(rider.phone) || ''}</div>`
      : '<span class="muted">Unknown rider</span>';
    return `
      <tr data-withdrawal-row="${w.id}">
        <td>${ident}</td>
        <td><b>${money(w.amount)}</b></td>
        <td>${withdrawalStatusBadge(w.status)}</td>
        <td>${w.requested_at ? new Date(w.requested_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>${w.reviewed_at ? new Date(w.reviewed_at).toLocaleDateString('en-NG') : '—'}</td>
        <td>
          <div class="row row--wrap" style="gap:6px">
            <select class="select" data-withdrawal-status="${w.id}" style="max-width:130px">
              <option value="pending" ${w.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${w.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${w.status === 'rejected' ? 'selected' : ''}>Rejected</option>
              <option value="paid" ${w.status === 'paid' ? 'selected' : ''}>Paid</option>
            </select>
            <input class="input" style="max-width:170px;min-width:120px" placeholder="Admin note" data-withdrawal-note="${w.id}" value="${String(w.admin_note || '').replace(/"/g, '&quot;')}">
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
        toast(result.error || ('Refund execution failed (' + res.status + ')'), 'error');
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
    return `<tr><td colspan="8" class="muted center">Could not load refunds (${String(state.refundsError).replace(/"/g, '&quot;')}). Please refresh.</td></tr>`;
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
    const { error } = await supabase
      .from('issue_reports')
      .update({
        status: newStatus,
        admin_response: (adminResponse || '').trim() || null,
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: session.user.id
      })
      .eq('id', reportId);
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
    return `<tr><td colspan="7" class="muted center">Could not load issue reports (${String(state.reportsError).replace(/"/g, '&quot;')}). Please refresh.</td></tr>`;
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
  const app = state.vendorApplications.find(a => a.id === appId);
  if (!app) return false;
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  if (!confirm(`Approve ${app.full_name || 'this applicant'}'s vendor application? This creates their storefront and grants them vendor access.`)) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to approve', 'error'); return false; }
    const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const vendorId = `${slugify(app.full_name) || 'vendor'}-${slugify(app.matric_number) || app.user_id.slice(0, 6)}`;
    // 1. Storefront — must exist before assign_user_to_vendor links profiles.vendor_id to it.
    const { error: vErr } = await supabase
      .from('vendors')
      .upsert({
        id: vendorId,
        name: app.full_name || vendorId,
        icon: '🛍️',
        type: 'Vendor',
        rating: '4.5',
        time: '15–25 min',
        cover: '#d9f5e9',
        open: true,
        delivery_method: 'rider',
        description: (app.what_they_want_to_sell || '').slice(0, 200)
      }, { onConflict: 'id' });
    if (vErr) throw vErr;
    // 2. Activate the existing vendor relationship (admin-gated RPC).
    const assigned = await assignUserToVendor(app.user_id, vendorId);
    if (!assigned) throw new Error('vendor assignment failed');
    // 3. Record the decision on the application.
    const { error } = await supabase
      .from('vendor_applications')
      .update({
        status: 'Approved',
        vendor_id: vendorId,
        admin_response: (app.admin_response || '').trim() || `Approved — your storefront (${vendorId}) is live. Manage it from the Vendor dashboard.`,
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: session.user.id
      })
      .eq('id', appId);
    if (error) throw error;
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
  const app = state.vendorApplications.find(a => a.id === appId);
  if (!app) return false;
  if (!supabaseAvailable()) { toast('Supabase unavailable', 'error'); return false; }
  const reason = prompt('Reason for rejection (optional — shown to the applicant):') || '';
  if (!confirm(`Reject ${app.full_name || 'this applicant'}'s vendor application${reason ? ' with reason: ' + reason : ''}?`)) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Sign in required to reject', 'error'); return false; }
    const { error } = await supabase
      .from('vendor_applications')
      .update({
        status: 'Rejected',
        admin_response: reason.trim() || 'Rejected — please reach out via Report an Issue if you have questions.',
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: session.user.id
      })
      .eq('id', appId);
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
    const { error } = await supabase
      .from('vendor_applications')
      .update({
        status: newStatus,
        admin_response: (adminResponse || '').trim() || null,
        admin_reviewed_at: new Date().toISOString(),
        admin_reviewed_by: session.user.id
      })
      .eq('id', appId);
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
    return `<tr><td colspan="8" class="muted center">Could not load vendor applications (${String(state.vendorApplicationsError).replace(/"/g, '&quot;')}). Please refresh.</td></tr>`;
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
document.addEventListener('click', (e) => {
  if (e.target.id === 'adminLogoutBtn' || e.target.closest('#adminLogoutBtn')) {
    if (confirm('Sign out of admin panel?')) {
      logout();
    }
  }
});

// Auto-initialize when loaded directly via admin.html (backward compatible).
// When loaded inside index.html, app.js controls initialization via
// window.AdminHub.init() when the user navigates to an admin route.
if (window.location.pathname.includes('admin.html')) {
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
      fee: order.fee || 1000,
      status: order.status || 'Order confirmed',
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
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;

  // Optimistically update the in-memory order so the UI responds immediately.
  const prevStatus = order.status;
  order.status = status;

  // Supabase is the source of truth — we never write orders to localStorage.
  if (!order.dbId || !supabaseAvailable()) {
    toast('Order status saved locally (offline mode)', 'error');
    renderAdminWorkspace();
    return;
  }

  try {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', order.dbId);
    if (error) throw error;
    toast('Order status updated');
  } catch (err) {
    console.error('Supabase order status update failed:', err);
    // Roll back to the previous status so the UI never shows a value that
    // was never persisted to the database.
    order.status = prevStatus;
    toast('Could not update order status: ' + (err.message || 'Unknown error'), 'error');
  }

  renderAdminWorkspace();
}

// Load all rider applications from Supabase.
async function loadRidersFromSupabase() {
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

async function approveRider(riderId) {
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;

  rider.status = 'approved';
  rider.available = true;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    toast('Rider approved (status updated locally)');
    renderAdminWorkspace();
    return;
  }

  try {
    const { error } = await supabase
      .from('riders')
      .update({ status: 'approved', available: true })
      .eq('id', rider.dbId);
    if (error) throw error;
    toast('Rider approved');
  } catch (err) {
    console.error('Supabase rider approval failed:', err);
    toast('Rider approved locally (Supabase sync failed)', 'error');
  }

  renderAdminWorkspace();
}

async function rejectRider(riderId) {
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;

  rider.status = 'rejected';
  rider.available = false;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    toast('Rider rejected (status updated locally)');
    renderAdminWorkspace();
    return;
  }

  try {
    const { error } = await supabase
      .from('riders')
      .update({ status: 'rejected', available: false })
      .eq('id', rider.dbId);
    if (error) throw error;
    toast('Rider rejected');
  } catch (err) {
    console.error('Supabase rider rejection failed:', err);
    toast('Rider rejected locally (Supabase sync failed)', 'error');
  }

  renderAdminWorkspace();
}

// Suspend an approved rider. Sets status to 'suspended' and available to false
// so the rider is no longer treated as an approved/active rider. Mirrors the
// existing approve/reject flow (local state + Supabase + re-render + toast).
async function suspendRider(riderId) {
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;

  rider.status = 'suspended';
  rider.available = false;
  store('riders', state.riders);

  if (!rider.dbId || !supabaseAvailable()) {
    toast('Rider suspended (status updated locally)');
    renderAdminWorkspace();
    return;
  }

  try {
    const { error } = await supabase
      .from('riders')
      .update({ status: 'suspended', available: false })
      .eq('id', rider.dbId);
    if (error) throw error;
    toast('Rider suspended');
  } catch (err) {
    console.error('Supabase rider suspension failed:', err);
    toast('Rider suspended locally (Supabase sync failed)', 'error');
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
  const rider = state.riders.find(item => item.id === riderId);
  if (!rider) return;
 
  rider.status = 'approved';
  rider.available = true;
  store('riders', state.riders);
 
  if (!rider.dbId || !supabaseAvailable()) {
    toast('Rider unsuspended (status updated locally)');
    renderAdminWorkspace();
    return;
  }
 
  try {
    const { error } = await supabase
      .from('riders')
      .update({ status: 'approved', available: true })
      .eq('id', rider.dbId);
    if (error) throw error;
    toast('Rider unsuspended');
  } catch (err) {
    console.error('Supabase rider unsuspend failed:', err);
    toast('Rider unsuspended locally (Supabase sync failed)', 'error');
  }
 
  renderAdminWorkspace();
}

})(); // End of admin module IIFE
