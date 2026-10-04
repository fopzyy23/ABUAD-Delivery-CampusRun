(function (root) {
  'use strict';
  const recent = new Map();
  let reporting = false;
  let globalCaptureInstalled = false;
  const secretKeys = /password|token|authorization|cookie|secret|api[_-]?key|card|cvv|jwt|session/i;
  const redact = value => String(value == null ? '' : value)
    .replace(/(Bearer\s+|eyJ)[A-Za-z0-9._~+\/-]+/gi, '[REDACTED]')
    .replace(/sk_(?:live|test)_[A-Za-z0-9]+/gi, '[REDACTED]')
    .slice(0, 4000);
  function safeObject(input, depth = 0) {
    if (!input || typeof input !== 'object' || depth > 2) return {};
    const output = {};
    Object.entries(input).slice(0, 30).forEach(([key, value]) => {
      if (secretKeys.test(key)) return;
      if (value && typeof value === 'object') output[key] = safeObject(value, depth + 1);
      else output[key] = redact(value).slice(0, 500);
    });
    return output;
  }
  function reference() {
    const bytes = new Uint8Array(5); crypto.getRandomValues(bytes);
    return 'ERR-' + Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 8);
  }
  function route() {
    return (location.pathname + location.search + location.hash)
      .replace(/([?&#](?:access_token|refresh_token|token|code|authorization)=[^&#]*)/gi, '').slice(0, 300);
  }
  function expected(error, options) {
    if (options.expected === true) return true;
    const text = String(error?.message || error || '');
    return /invalid login credentials|email not confirmed|already (?:claimed|assigned)|not available|unavailable|vendor (?:is )?closed|empty cart|maximum .*deliver|exceeds available|still pending/i.test(text);
  }
  function friendly(options, ref) {
    if (options.financial) return options.userMessage || `We couldn't confirm the final status of this transaction. Please do not make another payment yet. Check the order again or contact support if the issue continues.\n\nReference: ${ref}`;
    return `${options.userMessage || 'Something went wrong. Please try again.'}\n\nError reference: ${ref}`;
  }
  async function handleAppError(error, options = {}) {
    if (expected(error, options)) {
      const message = options.userMessage || 'Please check the information and try again.';
      if (options.notify !== false && typeof root.toast === 'function') root.toast(message, options.kind || 'error');
      return { expected: true, message, reference: null };
    }
    const ref = reference();
    const rawMessage = redact(error?.message || error || 'Unexpected application error');
    const action = String(options.action || 'unknown').slice(0, 120);
    const source = options.source || (options.financial ? 'payment' : 'frontend');
    const severity = options.severity || (options.financial ? 'critical' : 'high');
    const fingerprint = [source, action, rawMessage.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]'), route()].join('|').slice(0, 1000);
    const now = Date.now(), previous = recent.get(fingerprint);
    recent.set(fingerprint, now);
    const message = friendly(options, ref);
    console.error(`[${ref}] ${action}`, { message: rawMessage, source, context: safeObject(options.context) });
    if (options.notify !== false && typeof root.toast === 'function') root.toast(message, 'error');
    if (!reporting && (!previous || now - previous > 30000) && root.supabase?.auth) {
      reporting = true;
      try {
        const session = await root.supabase.auth.getSession();
        if (session.data?.session) await root.supabase.rpc('report_app_error', {
          p_reference: ref, p_route: route(), p_action: action, p_category: options.category || (options.financial ? 'financial' : 'unexpected'),
          p_source: source, p_severity: severity, p_message: rawMessage, p_details: redact(error?.details || error?.stack || ''),
          p_hint: redact(error?.hint || ''), p_status_code: Number.isInteger(error?.status) ? error.status : null,
          p_order_id: options.orderId || null, p_vendor_id: options.vendorId || null, p_rider_id: options.riderId || null,
          p_browser_metadata: { userAgent: navigator.userAgent.slice(0, 500), language: navigator.language, viewport: `${innerWidth}x${innerHeight}` },
          p_context: safeObject(options.context), p_fingerprint: null
        });
      } catch (reportError) { console.warn('Error report could not be stored.', redact(reportError?.message)); }
      finally { reporting = false; }
    }
    return { expected: false, message, reference: ref };
  }
  function installGlobalErrorCapture() {
    if (globalCaptureInstalled) return;
    globalCaptureInstalled = true;
    addEventListener('error', event => {
      if (!event.error && !event.message) return;
      void handleAppError(event.error || new Error(event.message), { action: 'global_javascript_error', source: 'frontend', notify: false, context: { file: event.filename, line: event.lineno, column: event.colno } });
    });
    addEventListener('unhandledrejection', event => void handleAppError(event.reason || new Error('Unhandled promise rejection'), { action: 'unhandled_promise_rejection', source: 'frontend', notify: false }));
  }
  root.DropzyyErrors = { handleAppError, installGlobalErrorCapture, sanitize: safeObject, redact };
})(window);
