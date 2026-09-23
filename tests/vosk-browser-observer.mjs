// Transparent observation of native browser resources. No injected recognition,
// encoder, audio source, app state, permission result, timing or engine messages.
export function observeNativeResources() {
  // Playwright also installs init scripts in the initial insecure about:blank.
  // Observe only the actual document; do not mask missing APIs in the app.
  if (location.href === 'about:blank') return;
  const state = { events: [], tracks: [], contexts: [], workers: [], ports: [], statuses: [], previews: [], violations: 0 };
  window.__vqa = state;
  const record = (kind, extra = {}) => state.events.push({ kind, ...extra });
  window.addEventListener('securitypolicyviolation', () => state.violations++);
  const gum = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async function (...args) {
    const stream = await Reflect.apply(gum, this, args);
    state.tracks.push(...stream.getTracks());
    return stream;
  };
  window.AudioContext = new Proxy(window.AudioContext, { construct(target, args) {
    const context = Reflect.construct(target, args);
    state.contexts.push(context);
    return context;
  } });
  window.Worker = new Proxy(window.Worker, { construct(target, args) {
    const native = Reflect.construct(target, args);
    const entry = { url: String(args[0]), terminated: 0, frames: 0, partials: [], finals: [] };
    state.workers.push(entry);
    native.addEventListener('message', ({ data }) => {
      if (data?.event === 'partialresult' && data.result?.partial) entry.partials.push(data.result.partial);
      if (data?.event === 'result') {
        entry.finals.push({ text: data.result?.text, flush: data.flushId === 1 });
        record(data.flushId === 1 ? 'flush-final' : 'utterance-final');
      }
    });
    const post = native.postMessage;
    native.postMessage = function (...args) {
      if (args[0]?.action === 'audioChunk') entry.frames += args[0].data.length;
      if (args[0]?.action === 'retrieveFinalResult') record('flush-sent');
      return Reflect.apply(post, this, args);
    };
    const terminate = native.terminate;
    native.terminate = function (...args) { entry.terminated++; record('worker-terminated'); return Reflect.apply(terminate, this, args); };
    return native;
  } });
  window.AudioWorkletNode = new Proxy(window.AudioWorkletNode, { construct(target, args) {
    const native = Reflect.construct(target, args);
    const entry = { closed: false, disconnected: false, frames: 0 };
    state.ports.push(entry);
    native.port.addEventListener('message', ({ data }) => {
      if (data?.type === 'audio') entry.frames += data.samples.length;
      if (data?.type === 'stopped') record('capture-drained');
    });
    const post = native.port.postMessage;
    native.port.postMessage = function (...args) {
      if (args[0]?.type === 'stop') record('capture-stop');
      return Reflect.apply(post, this, args);
    };
    const close = native.port.close;
    native.port.close = function (...args) { entry.closed = true; return Reflect.apply(close, this, args); };
    const disconnect = native.disconnect;
    native.disconnect = function (...args) { entry.disconnected = true; return Reflect.apply(disconnect, this, args); };
    return native;
  } });
  new MutationObserver(() => {
    const status = document.querySelector('[aria-label="Dictation status"]')?.textContent;
    if (status && state.statuses.at(-1)?.text !== status) {
      const save = [...document.querySelectorAll('button')].find(button => button.textContent === 'Save Note');
      const value = { text: status, saveDisabled: save?.disabled };
      state.statuses.push(value); record('status', value);
    }
    const preview = document.querySelector('[aria-label="Dictation preview"] p')?.textContent;
    if (preview && state.previews.at(-1) !== preview) state.previews.push(preview);
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
}

export function resourceSnapshot() {
  const s = window.__vqa;
  return { events: s.events, statuses: s.statuses, previews: s.previews, workers: s.workers, ports: s.ports,
    tracks: s.tracks.map(track => track.readyState), contexts: s.contexts.map(context => context.state), violations: s.violations };
}
