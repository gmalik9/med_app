// Process-local, fixed-cardinality counters only: no route, user, patient,
// request-ID, token or clinic labels. No public HTTP metrics endpoint.
const emptyCounters = () => ({
  requestsStarted: 0,
  requestsCompleted: 0,
  requestsAborted: 0,
  auditWritesAttempted: 0,
  auditWritesSucceeded: 0,
  auditWritesFailed: 0,
  readinessFailures: 0,
});
export type OperationalCounter = keyof ReturnType<typeof emptyCounters>;

export function createOperationalMetrics() {
  const counters = emptyCounters();
  return Object.freeze({
    increment(counter: OperationalCounter) {
      if (Object.prototype.hasOwnProperty.call(counters, counter)) counters[counter] = Math.min(Number.MAX_SAFE_INTEGER, counters[counter] + 1);
    },
    snapshot: () => Object.freeze({ ...counters }),
  });
}
export type OperationalMetrics = ReturnType<typeof createOperationalMetrics>;
