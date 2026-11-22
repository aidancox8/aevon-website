// Browser stand-in for the prototype's SQLite module. Nothing is stored: the "database" is a
// plain object that lives only while the page is open.
export function openDb() {
  const kv = new Map();
  return {
    // The copied settings store reads and writes one row through prepare(); that is all this supports.
    prepare() {
      return {
        get: (key) => (kv.has(key) ? { value: kv.get(key) } : undefined),
        run: (key, value) => { kv.set(key, value); },
      };
    },
  };
}

/** Run fn as one step. Everything here is synchronous and in memory, so there is nothing to roll back to disk. */
export function transaction(db, fn) {
  return fn();
}
