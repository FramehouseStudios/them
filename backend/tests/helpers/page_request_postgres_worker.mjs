// Dedicated test child: owns one PostgreSQL pool, no production credentials.
import { createPersistence } from '../../lib/persistence_adapter.js';
import { createPageRequestLedger } from '../../lib/clementine/page_request_ledger.js';

const persistence = createPersistence({ databaseUrl: process.env.PAGE_REQUEST_TEST_DATABASE_URL });
const ledger = createPageRequestLedger({ persistence });
process.on('message', async ({ id, operation, target, admissionId }) => {
  try {
    if (operation === 'close') {
      await persistence.close();
      process.disconnect();
      return;
    }
    const value = operation === 'claimCompletion'
      ? await ledger.claimCompletion(target, admissionId)
      : operation === 'stop' ? await ledger.stop(target) : await ledger.admit(target);
    process.send({ id, value });
  } catch (error) { process.send({ id, error: error.message }); }
});
process.send({ ready: true });
