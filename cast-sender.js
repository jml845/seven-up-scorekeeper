(function () {
  const NAMESPACE = 'urn:x-cast:com.sevenup.scoreboard';
  let ready = false;
  let apiAvailable = false;
  let devicesAvailable = false;
  let initialized = false;
  let castContext = null;
  let button = null;
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
  async function requestCast() {
    if (!ready || !devicesAvailable || !castContext) return notify('No Cast devices are available on this network');
    try { await castContext.requestSession(); }
    catch (error) {
      if (error !== 'cancel' && error?.code !== 'cancel') {
        const code = String(error?.code || error || 'unknown');
        try {
          localStorage.setItem('cast7-last-cast-error', JSON.stringify({
            at: new Date().toISOString(), code,
            castState: castContext?.getCastState?.() || '',
            sessionState: castContext?.getSessionState?.() || ''
          }));
        } catch {}
        notify(`Could not start casting (${code})`);
      }
    }
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
  function initializeCast(available = false) {
    if (available === true) apiAvailable = true;
    const appId = window.SEVEN_UP_CAST_APP_ID;
    if (!apiAvailable || window.chrome?.cast?.isAvailable !== true || !appId || !window.cast?.framework) {
      ready = false;
      return setAvailable(false);
    }
    try {
      const context = cast.framework.CastContext.getInstance();
      castContext = context;
      context.setOptions({receiverApplicationId: appId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED});
      if (!initialized) {
        context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, event => {
          setAvailable(event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
        });
        context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
          const connected = event.sessionState === cast.framework.SessionState.SESSION_STARTED || event.sessionState === cast.framework.SessionState.SESSION_RESUMED;
          document.documentElement.classList.toggle('cast-connected', connected);
          if (connected) window.dispatchEvent(new Event('sevenup-cast-connected'));
        });
      }
      initialized = true; ready = true; setAvailable(true);
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
})();
