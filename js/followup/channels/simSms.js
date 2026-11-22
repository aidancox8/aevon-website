// Simulated SMS. The message row is already in SQLite; the web UI shows it on a simulated phone.
// Replies come back through POST /sim/sms/reply, which calls the engine's inbound handler.
export function createSimSms() {
  return {
    name: 'sms',
    async send() {
      return { delivery: 'simulated phone' };
    },
  };
}
