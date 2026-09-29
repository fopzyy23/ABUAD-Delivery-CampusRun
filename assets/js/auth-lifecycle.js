/* Auth SDK callbacks hand off work outside its lock. Browser intent is never
 * authentication: recovery additionally requires a live, server-checked session. */
(function (root) {
  'use strict';
  function createAuthLifecycle({ auth, storage, fetchProfile, clearPrivate, publish, now = Date.now }) {
    const key = 'dropzyy_recovery_intent_v1';
    const ttl = 15 * 60 * 1000;
    let session = null, profile = null, generation = 0, ready = false;
    let pending = null, recovery = null, recoveryVerified = false, updating = false;
    function identity(value) {
      try {
        const payload = JSON.parse(atob(value.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.session_id ? value.user.id + ':' + payload.session_id : null;
      } catch (_) { return null; }
    }
    function clearRecovery() {
      recovery = null; recoveryVerified = false;
      try { storage.removeItem(key); } catch (_) { /* private browsing */ }
    }
    function canAccessPasswordRecovery() {
      return Boolean(recoveryVerified && session && recovery &&
        recovery.identity === identity(session) && recovery.until > now() &&
        recovery.until <= now() + ttl && session.expires_at * 1000 > now());
    }
    async function validateRecovery() {
      const ticket = generation;
      const { data, error } = await auth.getSession();
      const current = data?.session;
      if (ticket !== generation) return false;
      if (error || !current || identity(current) !== identity(session)) { clearRecovery(); return false; }
      session = current;
      if (!recovery || recovery.identity !== identity(current) || recovery.until <= now() || recovery.until > now() + ttl) {
        clearRecovery(); return false;
      }
      const result = await auth.getUser(current.access_token);
      if (ticket !== generation) return false;
      recoveryVerified = !result.error && result.data?.user?.id === current.user.id;
      if (!canAccessPasswordRecovery()) { clearRecovery(); return false; }
      return true;
    }
    function receive(event, next) {
      if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) return Promise.resolve();
      if (['TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED'].includes(event) && session?.user.id === next?.user.id) {
        session = next;
        if (recovery && recovery.identity !== identity(next)) clearRecovery();
        return Promise.resolve();
      }
      // INITIAL_SESSION can follow the recovery/sign-in event from URL exchange.
      if (pending && identity(session) && identity(session) === identity(next) && event !== 'USER_UPDATED' && event !== 'PASSWORD_RECOVERY') return pending;
      if (event === 'INITIAL_SESSION' && ready && identity(session) && identity(session) === identity(next)) return Promise.resolve();
      const ticket = ++generation;
      session = event === 'SIGNED_OUT' ? null : next;
      profile = null; ready = false;
      clearPrivate();
      if (!session) clearRecovery();
      if (!recovery && session) {
        try { recovery = JSON.parse(storage.getItem(key)); } catch (_) { clearRecovery(); }
      }
      if (event === 'PASSWORD_RECOVERY' && identity(session)) {
        // Repeated events for this recovery session do not extend its deadline.
        if (!recovery || recovery.identity !== identity(session)) recovery = { identity: identity(session), until: now() + ttl };
        try { storage.setItem(key, JSON.stringify(recovery)); } catch (_) { /* memory-only fallback */ }
      }
      publish({ ready, session, profile, generation });
      const work = new Promise(resolve => setTimeout(resolve, 0)).then(async () => {
        if (ticket !== generation) return;
        if (session) {
          const expected = session;
          const result = await fetchProfile(expected);
          if (ticket !== generation) return;
          profile = result;
          await validateRecovery();
          if (ticket !== generation) return;
        }
        ready = true;
        publish({ ready, session, profile, generation, recovery: canAccessPasswordRecovery() });
      }).catch(error => {
        if (ticket !== generation) return;
        profile = null; ready = true; clearRecovery(); clearPrivate();
        publish({ ready, session, profile, generation, error });
      }).finally(() => { if (pending === work) pending = null; });
      pending = work;
      return work;
    }
    async function updatePassword(password) {
      if (updating) throw new Error('Password update already in progress.');
      updating = true;
      try {
        const expected = identity(session);
        if (!await validateRecovery()) throw new Error('Open a valid password-reset email link first.');
        if (!expected || expected !== identity(session)) throw new Error('Session changed. Open a new recovery link.');
        const result = await auth.updateUser({ password });
        if (result.error) throw result.error;
        if (expected !== identity(session)) throw new Error('Session changed during password update. Check your account before continuing.');
        clearRecovery();
      } finally { updating = false; }
    }
    return { receive, canAccessPasswordRecovery, validateRecovery, updatePassword, clearRecovery,
      get generation() { return generation; }, get session() { return session; }, get ready() { return ready; } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = createAuthLifecycle;
  else root.createAuthLifecycle = createAuthLifecycle;
})(typeof window !== 'undefined' ? window : globalThis);
