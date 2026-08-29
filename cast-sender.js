(function () {
  const NAMESPACE = 'urn:x-cast:com.sevenup.scoreboard';
  const SENDER_BUILD = 88;
  const ACK_TIMEOUT_MS = 700;
  const MAX_SEND_ATTEMPTS = 5;
  const HEARTBEAT_INTERVAL_MS = 10000;
  const HEARTBEAT_TIMEOUT_MS = 16000;
  const FLIGHT_LOG_KEY = 'flipcast-cast-flight-recorder-v1';
  const MAX_FLIGHT_EVENTS = 250;
  let ready = false;
  let apiAvailable = false;
  let devicesAvailable = false;
  let initialized = false;
  let castContext = null;
  let activeSession = null;
  let receiverReady = false;
  let receiverBuild = null;
  let decoderState = null;
  let decoderFrames = 0;
  let decoderGame = null;
  let decoderAttempt = 0;
  let pendingScoreboard = null;
  let sendTimer = null;
  let helloTimer = null;
  let heartbeatTimer = null;
  let heartbeatTimeout = null;
  let heartbeatSequence = 0;
  let lastPongAt = null;
  let heartbeatMisses = 0;
  let nextSequence = 1;
  let lastAckSequence = 0;
  let lastSessionEvent = null;
  const errors = [];
  let flightLog = [];

  try {
    const saved = JSON.parse(localStorage.getItem(FLIGHT_LOG_KEY) || '[]');
    if (Array.isArray(saved)) flightLog = saved.slice(-MAX_FLIGHT_EVENTS);
  } catch {}

  const connectedState = state => state === cast.framework.SessionState.SESSION_STARTED || state === cast.framework.SessionState.SESSION_RESUMED;
  const currentSession = () => {
    try { return castContext?.getCurrentSession?.() || null; }
    catch { return null; }
  };
  const currentSessionState = () => {
    try { return currentSession()?.getSessionState?.() || ''; }
    catch { return ''; }
  };
  const notify = detail => window.dispatchEvent(new CustomEvent('sevenup-cast-notice', {detail}));
  const publishStatus = () => window.dispatchEvent(new CustomEvent('sevenup-cast-status', {detail:getDiagnostics()}));

  function recordFlight(type, detail = {}) {
    const row = {at:new Date().toISOString(), type:String(type), build:SENDER_BUILD, visibility:document.visibilityState, online:navigator.onLine, ...detail};
    flightLog.push(row);
    if (flightLog.length > MAX_FLIGHT_EVENTS) flightLog.splice(0, flightLog.length - MAX_FLIGHT_EVENTS);
    try { localStorage.setItem(FLIGHT_LOG_KEY, JSON.stringify(flightLog)); } catch {}
    return row;
  }

  function recordError(code) {
    const row = {at:new Date().toISOString(), code:String(code), castState:castContext?.getCastState?.() || '', sessionState:currentSessionState()};
    errors.push(row);
    if (errors.length > 10) errors.shift();
    try {
      localStorage.setItem('flipcast-cast-errors-v2', JSON.stringify(errors));
      localStorage.setItem('cast7-last-cast-error', JSON.stringify(row));
    } catch {}
    recordFlight('error', {code:row.code, castState:row.castState, sessionState:row.sessionState});
    publishStatus();
  }

  function setAvailable(value) {
    devicesAvailable = Boolean(value);
    document.documentElement.classList.toggle('cast-available', devicesAvailable);
    publishStatus();
  }

  function clearTimers() {
    clearTimeout(sendTimer); sendTimer = null;
    clearTimeout(helloTimer); helloTimer = null;
    clearInterval(heartbeatTimer); heartbeatTimer = null;
    clearTimeout(heartbeatTimeout); heartbeatTimeout = null;
  }

  function scheduleHeartbeat() {
    clearInterval(heartbeatTimer);
    clearTimeout(heartbeatTimeout);
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  function sendHeartbeat() {
    const session = activeSession;
    if (!session || !receiverReady || !connectedState(session.getSessionState?.())) return;
    if (heartbeatTimeout) return;
    const seq = ++heartbeatSequence;
    recordFlight('heartbeat_sent', {seq, sessionState:currentSessionState()});
    session.sendMessage(NAMESPACE, {type:'PING', seq, sentAt:new Date().toISOString(), senderBuild:SENDER_BUILD})
      .catch(error => recordError(error?.code || error || 'heartbeat_send_failed'));
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = setTimeout(() => {
      heartbeatMisses += 1;
      recordFlight('heartbeat_timeout', {seq, heartbeatMisses, sessionState:currentSessionState()});
      publishStatus();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  function detachSession() {
    if (activeSession) recordFlight('session_detached', {sessionState:currentSessionState(), receiverReady});
    clearTimers();
    if (activeSession?._flipcastMessageListener) {
      try { activeSession.removeMessageListener(NAMESPACE, activeSession._flipcastMessageListener); } catch {}
    }
    activeSession = null;
    receiverReady = false;
    receiverBuild = null;
    decoderState = null;
    decoderFrames = 0;
    decoderGame = null;
    decoderAttempt = 0;
    document.documentElement.classList.remove('cast-connected');
    publishStatus();
  }

  function handleReceiverMessage(message) {
    if (typeof message === 'string') {
      try { message = JSON.parse(message); }
      catch { return recordError('receiver_message_invalid_json'); }
    }
    if (!message || typeof message !== 'object') return;
    if (message.decoderState) decoderState = String(message.decoderState);
    if (message.decoderFrames != null) decoderFrames = Number(message.decoderFrames) || 0;
    if (message.decoderGame != null) decoderGame = String(message.decoderGame);
    if (message.decoderAttempt != null) decoderAttempt = Number(message.decoderAttempt) || 0;
    if (message.type === 'READY') {
      receiverReady = true;
      receiverBuild = Number(message.receiverBuild) || null;
      clearTimeout(helloTimer); helloTimer = null;
      document.documentElement.classList.add('cast-connected');
      window.dispatchEvent(new Event('sevenup-cast-connected'));
      recordFlight('receiver_ready', {receiverBuild, receiverStartedAt:message.receiverStartedAt || null, receiverEvent:message.lastReceiverEvent || null});
      scheduleHeartbeat();
      sendHeartbeat();
      publishStatus();
    } else if (message.type === 'PONG') {
      clearTimeout(heartbeatTimeout); heartbeatTimeout = null;
      lastPongAt = new Date().toISOString();
      recordFlight('heartbeat_pong', {seq:Number(message.seq) || 0, receiverBuild:Number(message.receiverBuild) || null, receiverEvent:message.lastReceiverEvent || null});
      publishStatus();
    } else if (message.type === 'RECEIVER_EVENT') {
      recordFlight('receiver_event', {event:message.event || '', senderId:message.senderId || '', reason:message.reason || ''});
      publishStatus();
    } else if (message.type === 'DECODER') {
      publishStatus();
      flushMessages();
    } else if (message.type === 'ACK') {
      const sequence = Number(message.seq) || 0;
      lastAckSequence = Math.max(lastAckSequence, sequence);
      recordFlight('state_acknowledged', {seq:sequence, receiverBuild:Number(message.receiverBuild) || receiverBuild || null});
      if (pendingScoreboard?.seq === sequence) {
        pendingScoreboard = null;
        clearTimeout(sendTimer); sendTimer = null;
      }
      publishStatus();
    }
  }

  function sendHello(attempt = 1) {
    const session = activeSession;
    if (!session || !connectedState(session.getSessionState?.()) || receiverReady) return;
    clearTimeout(helloTimer); helloTimer = null;
    session.sendMessage(NAMESPACE, {type:'HELLO', senderBuild:SENDER_BUILD}).catch(error => recordError(error?.code || error || 'hello_failed'));
    if (attempt < MAX_SEND_ATTEMPTS) helloTimer = setTimeout(() => sendHello(attempt + 1), ACK_TIMEOUT_MS);
    else notify('The TV connected, but FlipCast did not receive a ready response. Open Cast help to retry.');
  }

  function attachSession(session) {
    if (!session || !connectedState(session.getSessionState?.())) return detachSession();
    if (activeSession === session) return;
    detachSession();
    activeSession = session;
    recordFlight('session_attached', {sessionState:session.getSessionState?.() || '', sessionId:session.getSessionId?.() || ''});
    const listener = (_namespace, message) => handleReceiverMessage(message);
    activeSession._flipcastMessageListener = listener;
    try { activeSession.addMessageListener(NAMESPACE, listener); }
    catch (error) { recordError(error?.code || error || 'listener_failed'); }
    document.documentElement.classList.add('cast-connected');
    sendHello();
    publishStatus();
  }

  function scheduleRetry(envelope) {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      if (pendingScoreboard !== envelope) return;
      envelope.attempts += 1;
      if (envelope.attempts >= MAX_SEND_ATTEMPTS) {
        recordError('scoreboard_ack_timeout');
        notify('The TV did not confirm the latest scoreboard. Open Cast help to retry.');
        return;
      }
      flushMessages();
    }, ACK_TIMEOUT_MS);
  }

  async function flushMessages() {
    const session = activeSession || currentSession();
    const envelope = pendingScoreboard;
    if (!session || !connectedState(session.getSessionState?.()) || !envelope) return;
    if (!receiverReady) return sendHello();
    try {
      await session.sendMessage(NAMESPACE, {type:'STATE', seq:envelope.seq, scoreboard:envelope.scoreboard});
      recordFlight('state_sent', {seq:envelope.seq, attempt:envelope.attempts + 1});
      if (pendingScoreboard === envelope) scheduleRetry(envelope);
    } catch (error) {
      if (pendingScoreboard !== envelope) return;
      envelope.attempts += 1;
      recordError(error?.code || error || 'send_failed');
      if (envelope.attempts < MAX_SEND_ATTEMPTS) sendTimer = setTimeout(flushMessages, ACK_TIMEOUT_MS);
      else notify('The Cast screen missed an update. Open Cast help to retry.');
    }
  }

  function send(scoreboard) {
    if (!scoreboard) return Promise.resolve(false);
    pendingScoreboard = {scoreboard, seq:nextSequence++, attempts:0};
    flushMessages();
    publishStatus();
    return Promise.resolve(true);
  }

  function retry() {
    const session = currentSession();
    if (!session || !connectedState(session.getSessionState?.())) return notify('Choose a TV with the Cast button first.');
    if (pendingScoreboard) pendingScoreboard.attempts = 0;
    receiverReady = false;
    if (activeSession === session) sendHello();
    else attachSession(session);
  }

  function stop() {
    try { castContext?.endCurrentSession?.(true); }
    catch (error) { recordError(error?.code || error || 'stop_failed'); }
  }

  function getDiagnostics() {
    return {
      senderBuild:SENDER_BUILD,
      apiAvailable,
      apiReady:ready,
      devicesAvailable,
      castState:castContext?.getCastState?.() || '',
      sessionState:currentSessionState(),
      receiverReady,
      receiverBuild,
      decoderState,
      decoderFrames,
      decoderGame,
      decoderAttempt,
      pendingSequence:pendingScoreboard?.seq || null,
      lastAckSequence,
      lastPongAt,
      heartbeatMisses,
      flightEventCount:flightLog.length,
      lastSessionEvent,
      errors:errors.at(-1) || null,
      online:navigator.onLine,
      platform:navigator.platform || 'unknown',
      userAgent:navigator.userAgent,
    };
  }

  function exportDiagnostics() {
    recordFlight('diagnostics_exported', {eventCount:flightLog.length});
    return JSON.stringify({schema:'flipcast-cast-diagnostics-v1', exportedAt:new Date().toISOString(), diagnostics:getDiagnostics(), events:flightLog.slice()}, null, 2);
  }

  function clearDiagnostics() {
    flightLog = [];
    errors.length = 0;
    try {
      localStorage.removeItem(FLIGHT_LOG_KEY);
      localStorage.removeItem('flipcast-cast-errors-v2');
      localStorage.removeItem('cast7-last-cast-error');
    } catch {}
    recordFlight('diagnostics_cleared');
    publishStatus();
  }

  window.sevenUpCast = {send, retry, stop, getDiagnostics, exportDiagnostics, clearDiagnostics, isReady:() => ready, hasDevices:() => devicesAvailable};

  function initializeCast(available = false) {
    if (available === true) apiAvailable = true;
    const appId = window.SEVEN_UP_CAST_APP_ID;
    if (!apiAvailable || window.chrome?.cast?.isAvailable !== true || !appId || !window.cast?.framework) {
      ready = false;
      return setAvailable(false);
    }
    try {
      castContext = cast.framework.CastContext.getInstance();
      if (!initialized) {
        castContext.setOptions({
          receiverApplicationId:appId,
          autoJoinPolicy:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          resumeSavedSession:true,
        });
        castContext.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, event => {
          recordFlight('cast_state_changed', {castState:String(event.castState || '')});
          setAvailable(event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
        });
        castContext.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
          const code = String(event.errorCode || event.error || '');
          lastSessionEvent = {at:new Date().toISOString(), state:String(event.sessionState), code};
          recordFlight('session_state_changed', {sessionState:String(event.sessionState || ''), code});
          if (connectedState(event.sessionState)) attachSession(castContext.getCurrentSession());
          else if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED || event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
            if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED) recordError(`session_start_failed${code?`:${code}`:''}`);
            if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) window.dispatchEvent(new Event('sevenup-cast-disconnected'));
            detachSession();
          }
        });
        initialized = true;
      }
      ready = true;
      setAvailable(castContext.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
      const session = castContext.getCurrentSession();
      if (session && connectedState(session.getSessionState?.())) attachSession(session);
    } catch (error) {
      ready = false;
      recordError(error?.code || error || 'initialize_failed');
      setAvailable(false);
    }
  }

  window.__onGCastApiAvailable = available => initializeCast(available === true);
  let attempts = 0;
  const initializationRetry = setInterval(() => {
    attempts += 1;
    if (window.chrome?.cast?.isAvailable === true) initializeCast(true);
    if (ready || attempts >= 40) clearInterval(initializationRetry);
  }, 500);
  document.addEventListener('visibilitychange', () => {
    recordFlight('visibility_changed', {visibility:document.visibilityState});
    if (document.visibilityState === 'visible' && window.chrome?.cast?.isAvailable === true) initializeCast(true);
  });
  window.addEventListener('online', () => recordFlight('network_online'));
  window.addEventListener('offline', () => recordFlight('network_offline'));
  window.addEventListener('pageshow', event => recordFlight('page_show', {persisted:Boolean(event.persisted)}));
  window.addEventListener('pagehide', event => recordFlight('page_hide', {persisted:Boolean(event.persisted)}));
  window.addEventListener('freeze', () => recordFlight('page_freeze'));
  window.addEventListener('resume', () => recordFlight('page_resume'));
  navigator.connection?.addEventListener?.('change', () => recordFlight('connection_changed', {effectiveType:navigator.connection.effectiveType || '', type:navigator.connection.type || '', downlink:Number(navigator.connection.downlink) || null}));
  navigator.getBattery?.().then(battery => {
    const logBattery = type => recordFlight(type, {level:Math.round(battery.level * 100), charging:battery.charging});
    logBattery('battery_status');
    battery.addEventListener('levelchange', () => logBattery('battery_changed'));
    battery.addEventListener('chargingchange', () => logBattery('battery_changed'));
  }).catch(() => {});
  recordFlight('sender_loaded', {userAgent:navigator.userAgent, platform:navigator.platform || 'unknown'});
})();
