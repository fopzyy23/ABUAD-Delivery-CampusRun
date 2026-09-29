const PRODUCTION_HOSTS = new Set(["dropzyy.com", "www.dropzyy.com"]);

function invalidConfiguration() {
  return new Error("Payment callback configuration is invalid for this origin");
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseOrigin(value) {
  if (typeof value !== "string" || !value.trim()) throw invalidConfiguration();
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalidConfiguration();
  }
  const local = isLocalhost(url.hostname.toLowerCase());
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw invalidConfiguration();
  }
  return url;
}

/**
 * Resolve a fixed application return route from explicit deployment config.
 * The request Origin is only accepted after matching the explicit allowlist.
 * @param {{configuredCallback: string, requestOrigin: string, allowedOrigins: string[], requiredPath: string}} options
 */
export function resolveTrustedCallbackUrl({
  configuredCallback,
  requestOrigin,
  allowedOrigins,
  requiredPath,
  environment,
}) {
  if (typeof requiredPath !== "string" || !/^\/(?:orders|vendor)$/.test(requiredPath) ||
      !["production", "staging", "development"].includes(environment) ||
      !Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    throw invalidConfiguration();
  }

  const allowedUrls = allowedOrigins.map(parseOrigin);
  const allowed = allowedUrls.map((url) => url.origin);
  const environmentAllows = (url) => {
    if (environment === "production") {
      return PRODUCTION_HOSTS.has(url.hostname.toLowerCase()) && !url.port;
    }
    if (environment === "staging") {
      return url.protocol === "https:" &&
        !PRODUCTION_HOSTS.has(url.hostname.toLowerCase()) &&
        !isLocalhost(url.hostname.toLowerCase());
    }
    return isLocalhost(url.hostname.toLowerCase());
  };
  if (!allowedUrls.every(environmentAllows)) throw invalidConfiguration();

  const request = parseOrigin(requestOrigin);
  if (!allowed.includes(request.origin) || !environmentAllows(request)) {
    throw invalidConfiguration();
  }

  if (typeof configuredCallback !== "string" || !configuredCallback.trim()) {
    throw invalidConfiguration();
  }
  let callback;
  try {
    callback = new URL(configuredCallback.trim());
  } catch {
    throw invalidConfiguration();
  }

  const localCallback = isLocalhost(callback.hostname.toLowerCase());
  if ((callback.protocol !== "https:" && !(localCallback && callback.protocol === "http:")) ||
      callback.username || callback.password || callback.pathname !== requiredPath ||
      callback.search || callback.hash || !allowed.includes(callback.origin) ||
      !environmentAllows(callback)) {
    throw invalidConfiguration();
  }

  // For staging/development, require the callback to return to the exact
  // trusted requesting origin. Production may use either explicitly trusted
  // Dropzyy hostname (e.g. canonical/www) within the same production class.
  if (environment !== "production" && callback.origin !== request.origin) {
    throw invalidConfiguration();
  }

  return callback.toString();
}
