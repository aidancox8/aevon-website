// EMR connection health. Every adapter call goes through trackHealth(), which counts consecutive failures and
// remembers the last good call. An expired sign-in and an outage both show up as failures here, which is why the
// banner says the sign-in may have expired. The state change (ok to degraded and back) is written to the audit log once each.
//
// What counts as a failure: UNAVAILABLE, FORBIDDEN, and anything that is not an EmrError (a network error).
// NOT_FOUND, CONFLICT and BAD_REQUEST mean the EMR answered, so they count as a good call.
import { EmrError, ADAPTER_METHODS } from '../emr/adapter.js';

export const DEGRADED_AFTER = 3;
const ANSWERED = new Set(['NOT_FOUND', 'CONFLICT', 'BAD_REQUEST']);

export function createHealth({ clock, audit = null, degradedAfter = DEGRADED_AFTER }) {
  const state = { consecutiveFailures: 0, lastSuccessAt: null, firstFailureAt: null, lastFailureAt: null, lastErrorCode: null, degraded: false, degradedSince: null };

  function success() {
    state.lastSuccessAt = clock.now();
    state.consecutiveFailures = 0;
    state.firstFailureAt = null;
    if (state.degraded) {
      state.degraded = false;
      const since = state.degradedSince;
      state.degradedSince = null;
      audit?.record({ action: 'emr_health', before: { state: 'degraded', since }, after: { state: 'ok' }, detail: 'The EMR is reachable again. Messages and bookings continue' });
    }
  }

  function failure(err) {
    const at = clock.now();
    state.consecutiveFailures += 1;
    state.lastFailureAt = at;
    state.lastErrorCode = err?.code ?? err?.name ?? 'ERROR';
    if (state.firstFailureAt === null) state.firstFailureAt = at;
    if (!state.degraded && state.consecutiveFailures >= degradedAfter) {
      state.degraded = true;
      state.degradedSince = state.firstFailureAt;
      audit?.record({
        action: 'emr_health', before: { state: 'ok', lastSuccessAt: state.lastSuccessAt }, after: { state: 'degraded', since: state.firstFailureAt, errorCode: state.lastErrorCode },
        detail: 'Cannot reach the EMR. Messages and bookings are paused. If this lasts, the EMR sign-in may have expired',
      });
    }
  }

  return {
    success,
    failure,
    isDegraded: () => state.degraded,
    snapshot: () => ({ ...state }),
  };
}

/** A copy of the adapter whose interface methods update the health tracker. describe() is local and is not tracked. */
export function trackHealth(emr, health) {
  const out = { describe: () => emr.describe() };
  for (const name of [...ADAPTER_METHODS, 'cancelAppointment']) {
    if (name === 'describe' || typeof emr[name] !== 'function') continue;
    out[name] = async (...args) => {
      try {
        const result = await emr[name](...args);
        health.success();
        return result;
      } catch (err) {
        if (err instanceof EmrError && ANSWERED.has(err.code)) health.success();
        else health.failure(err);
        throw err;
      }
    };
  }
  return out;
}
