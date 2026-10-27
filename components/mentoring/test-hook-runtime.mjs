/** Minimal deterministic hook scheduler for testing asynchronous hooks without a
 * DOM. It models hook slots, dependency comparisons, commit-time effects and
 * cleanup; application state and persistence remain in the real hook. */
export function createHookRuntime() {
  const slots = [];
  let cursor = 0;
  let pendingRender = true;
  let mounted = true;
  let rendering = false;
  let renderHook;
  let output;
  const effects = [];
  const changed = (before, after) => before === undefined || after === undefined || before.length !== after.length || before.some((value, index) => !Object.is(value, after[index]));

  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = (next) => {
          if (!mounted) return;
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(slot.value, value)) { slot.value = value; pendingRender = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { value: factory(), dependencies };
      return slots[index].value;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || changed(previous.dependencies, dependencies)) {
        const next = { callback, dependencies, cleanup: previous?.cleanup };
        slots[index] = next;
        effects.push(() => {
          next.cleanup?.();
          next.cleanup = next.callback();
        });
      }
    },
    useEffectEvent(callback) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { callback };
        slot.event = (...arguments_) => {
          if (rendering) throw new Error("Effect Events must not run during render.");
          return slot.callback(...arguments_);
        };
        slots[index] = slot;
      }
      slots[index].callback = callback;
      return slots[index].event;
    },
  };

  function commit() {
    if (!mounted || !pendingRender) return;
    pendingRender = false;
    cursor = 0;
    rendering = true;
    try { output = renderHook(); } finally { rendering = false; }
    while (effects.length) effects.shift()();
  }

  return {
    react,
    mount(callback) { renderHook = callback; commit(); },
    rerender() { pendingRender = true; commit(); },
    get result() { return output; },
    async flush(rounds = 40) {
      for (let turn = 0; turn < rounds; turn += 1) { commit(); await Promise.resolve(); }
      commit();
    },
    unmount() {
      mounted = false;
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}
