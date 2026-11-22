// A controllable clock. Real time plus an offset, or frozen at a fixed instant (tests).
export function createClock({ fixed = null } = {}) {
  let frozen = fixed;
  let offset = 0;
  return {
    now: () => (frozen !== null ? frozen : Date.now() + offset),
    advance(ms) {
      if (frozen !== null) frozen += ms;
      else offset += ms;
    },
    reset() {
      offset = 0;
    },
    isShifted: () => offset !== 0,
  };
}
