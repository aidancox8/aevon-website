// The EMR adapter interface. Every adapter implements exactly these methods.
// Adapters do no business logic: they translate to and from the EMR and nothing else.
//
// All times are ISO 8601 strings carrying the clinic's zone offset, for example
// "2027-01-12T09:15:00-05:00". Ids are strings.
//
// @typedef {Object} Task
// @property {string} id
// @property {string} patientId
// @property {string} creatorProviderId
// @property {string} assigneeId
// @property {string} message
// @property {string|null} serviceDate
// @property {string|null} priority
// @property {'active'|'completed'|'deleted'} status
// @property {{text: string, at: string, by: string}[]} comments
// @property {string|null} updatedAt
//
// @typedef {Object} Patient
// @property {string} id
// @property {string} firstName
// @property {string} lastName
// @property {string|null} mobile
// @property {string|null} email
//
// @typedef {Object} EmrAdapter
// @property {() => {name: string, version: string, capabilities: {push: boolean, cancelAppointment?: boolean}, timeZone?: string}} describe
// @property {(q: {assigneeId: string}) => Promise<Task[]>} listAssignedTasks  active tasks for the agent user
// @property {(taskId: string) => Promise<Task>} getTask
// @property {(patientId: string) => Promise<Patient>} getPatient
// @property {(providerId: string) => Promise<{id: string, displayName: string}>} getProvider
// @property {(q: {providerId: string, date: string}) => Promise<{start: string, end: string}[]>} getDayTemplate  working blocks that day, [] if none
// @property {(q: {providerId: string, from: string, to: string}) => Promise<{id: string, start: string, end: string, patientId: string, status: string}[]>} getAppointments  cancelled ones excluded
// @property {(a: {providerId: string, patientId: string, start: string, minutes: number, reason: string, notes: string}) => Promise<{id: string}>} createAppointment
// @property {(taskId: string, text: string) => Promise<void>} addTaskComment
// @property {(taskId: string, note: string) => Promise<void>} completeTask
// @property {(taskId: string, o: {toUserId: string, note: string}) => Promise<void>} reassignTask
//
// Optional capability (not in ADAPTER_METHODS): `cancelAppointment(id) => Promise<void>`, reported as
// `describe().capabilities.cancelAppointment === true`. The engine uses it only to remove its own appointment when a
// double booking appears in the gap around a booking. Without it the engine hands the task back to staff.

export const EMR_ERROR_CODES = ['NOT_FOUND', 'FORBIDDEN', 'CONFLICT', 'UNAVAILABLE', 'BAD_REQUEST'];

const DEFAULT_STATUS = { NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, UNAVAILABLE: 503, BAD_REQUEST: 400 };

/** Thrown by adapters. `code` is one of EMR_ERROR_CODES, `status` the HTTP status. */
export class EmrError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'EmrError';
    if (!EMR_ERROR_CODES.includes(code)) throw new TypeError(`Unknown EmrError code: ${code}`);
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
  }
}

export const OPTIONAL_METHODS = ['cancelAppointment'];

export const ADAPTER_METHODS = [
  'describe', 'listAssignedTasks', 'getTask', 'getPatient', 'getProvider', 'getDayTemplate',
  'getAppointments', 'createAppointment', 'addTaskComment', 'completeTask', 'reassignTask',
];

/** Throws if the object is missing any interface method. Returns the adapter for chaining. */
export function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('EMR adapter must be an object');
  const missing = ADAPTER_METHODS.filter((m) => typeof adapter[m] !== 'function');
  if (missing.length) throw new TypeError(`EMR adapter is missing: ${missing.join(', ')}`);
  if (adapter.describe().capabilities?.cancelAppointment && typeof adapter.cancelAppointment !== 'function') {
    throw new TypeError('EMR adapter reports cancelAppointment but does not implement it');
  }
  return adapter;
}
