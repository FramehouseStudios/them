// Only an explicit isolated loopback test may terminate its own backend at a
// persisted settlement boundary. No shipping hook, real provider or external DB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(process.env.PERSISTENCE_JSON_ROOT || '.');
const mode = process.env.THEM_SETTLEMENT_CRASH_MODE || '';
if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1'
  || process.env.THEM_HOME_VOICE_PROVIDER_FIXTURE !== '1'
  || !root.startsWith(path.resolve(os.tmpdir()) + path.sep)
  || process.env.DATABASE_URL || !['', 'prepared', 'debited', 'completed'].includes(mode)) {
  throw new Error('Settlement crash fixture requires isolated loopback JSON test storage');
}
await import('../../evals/home_voice_provider_fixture.mjs');
const rename = fs.renameSync.bind(fs);
fs.renameSync = (source, destination) => {
  const result = rename(source, destination);
  const target = path.resolve(String(destination));
  const replayFile = path.join(root, 'talk_idempotency.json');
  const balanceFile = path.join(root, 'wallet_balances.json');
  if (!mode || (target !== replayFile && target !== balanceFile)) return result;
  const replays = fs.existsSync(replayFile) ? JSON.parse(fs.readFileSync(replayFile, 'utf8')) : {};
  const accepted = Object.values(replays).find(row => row?.settlement
    && (mode === 'completed' ? row.status === 'completed' : row.status === 'prepared'));
  if (!accepted) return result;
  const balances = fs.existsSync(balanceFile) ? JSON.parse(fs.readFileSync(balanceFile, 'utf8')) : {};
  const debited = balances[accepted.settlement.ownerId]?.pageMilliturns === 99_800;
  if ((mode === 'prepared' && target === replayFile)
    || (mode === 'debited' && target === balanceFile && debited)
    || (mode === 'completed' && target === replayFile && debited)) {
    fs.writeSync(1, `[settlement-proof] own-process SIGKILL after ${mode}\n`);
    process.kill(process.pid, 'SIGKILL');
  }
  return result;
};
