(function () {
  const NAMESPACE = 'urn:x-cast:com.sevenup.scoreboard';
  let ready = false;
  let apiAvailable = false;
  let devicesAvailable = false;
  let initialized = false;
  let castContext = null;
  let button = null;
  let requestInFlight = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function bindButton() {
    if (button) return;
    button = document.querySelector('#castButton');
    if (!button) return;
    button.classList.toggle('cast-unavailable', !devicesAvailable);
    button.setAttribute('aria-disabled', String(!devicesAvailable));
    button.addEventListener('click', requestCast);
  }
  function setAvailable(value) {
    devicesAvailable = value;
    document.documentElement.classList.toggle('cast-available', value);
    bindButton();
    button?.classList.toggle('cast-unavailable', !value);
    button?.setAttribute('aria-disabled', String(!value));
  }
  function notify(detail) { window.dispatchEvent(new CustomEvent('sevenup-cast-notice', {detail})); }
  function setBusy(value) {
    requestInFlight = value;
    button?.classList.toggle('cast-connecting', value);
    button?.setAttribute('aria-busy', String(value));
  }
  function currentSessionState() {
    try { return castContext?.getCurrentSession?.()?.getSessionState?.() || ''; }
    catch { return ''; }
  }
  function connectedState(state) {
    return state === cast.framework.SessionState.SESSION_STARTED || state === cast.framework.SessionState.SESSION_RESUMED;
  }
  function recordError(code) {
    try {
      const key = 'flipcast-cast-errors-v1';
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({at:new Date().toISOString(),code,castState:castContext?.getCastState?.()||'',sessionState:currentSessionState()});
      localStorage.setItem(key, JSON.stringify(history.slice(-10)));
      localStorage.setItem('cast7-last-cast-error', JSON.stringify(history.at(-1)));
    } catch {}
  }
  async function waitForSessionClear() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!castContext?.getCurrentSession?.()) return true;
      await delay(100);
    }
    return !castContext?.getCurrentSession?.();
  }
  async function clearStaleSession() {
    try {
      const state = currentSessionState();
      if (state && !connectedState(state)) {
        castContext.endCurrentSession(true);
        await waitForSessionClear();
      }
    } catch {}
  }
  async function recoverSender(code) {
    try { castContext?.endCurrentSession?.(true); } catch {}
    await waitForSessionClear();
    initializeCast(true, true);
    notify(`Cast connection was reset after ${code}. Retrying once…`);
  }
  async function requestCast() {
    if (!ready || !devicesAvailable || !castContext) return notify('No Cast devices are available on this network');
    if (requestInFlight) return;
    if (connectedState(currentSessionState())) {
      document.documentElement.classList.add('cast-connected');
      window.dispatchEvent(new Event('sevenup-cast-connected'));
      return;
    }
    setBusy(true);
    try {
      await clearStaleSession();
      await castContext.requestSession();
    }
    catch (error) {
      if (error !== 'cancel' && error?.code !== 'cancel') {
        const code = String(error?.code || error || 'unknown');
        recordError(code);
        await recoverSender(code);
        await delay(250);
        try { await clearStaleSession(); await castContext.requestSession(); }
        catch (retryError) {
          if (retryError !== 'cancel' && retryError?.code !== 'cancel') {
            const retryCode = String(retryError?.code || retryError || 'unknown');
            recordError(retryCode);
            notify(`Could not start casting (${retryCode}). Tap Cast to try again.`);
          }
        }
      }
    }
    finally { setBusy(false); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButton, {once:true});
  else bindButton();
  function send(scoreboard) {
    if (!ready || !scoreboard || !window.cast?.framework) return Promise.resolve(false);
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session) return Promise.resolve(false);
    return session.sendMessage(NAMESPACE, scoreboard).then(() => true).catch(() => false);
  }
  window.sevenUpCast = {send, isReady: () => ready, hasDevices: () => devicesAvailable};
  function initializeCast(available = false, force = false) {
    if (available === true) apiAvailable = true;
    const appId = window.SEVEN_UP_CAST_APP_ID;
    if (!apiAvailable || window.chrome?.cast?.isAvailable !== true || !appId || !window.cast?.framework) {
      ready = false;
      return setAvailable(false);
    }
    try {
      const context = cast.framework.CastContext.getInstance();
      castContext = context;
      if (initialized && !force) {
        ready = true;
        return setAvailable(context.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
      }
      context.setOptions({receiverApplicationId: appId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.PAGE_SCOPED, resumeSavedSession:false});
      if (!initialized) {
        context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, event => {
          setAvailable(event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
        });
        context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
          const connected = event.sessionState === cast.framework.SessionState.SESSION_STARTED || event.sessionState === cast.framework.SessionState.SESSION_RESUMED;
          document.documentElement.classList.toggle('cast-connected', connected);
          if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED || event.sessionState === cast.framework.SessionState.SESSION_ENDED) setBusy(false);
          if (connected) window.dispatchEvent(new Event('sevenup-cast-connected'));
        });
      }
      initialized = true; ready = true;
      setAvailable(context.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
    } catch { setAvailable(false); }
  }
  window.__onGCastApiAvailable = (available) => initializeCast(available === true);
  let attempts = 0;
  const retry = setInterval(() => {
    attempts += 1;
    if (window.chrome?.cast?.isAvailable === true) initializeCast(true);
    if (ready || attempts >= 40) clearInterval(retry);
  }, 500);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&window.chrome?.cast?.isAvailable===true)initializeCast(true)});
})();
