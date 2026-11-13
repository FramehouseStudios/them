import test from 'node:test';
import assert from 'node:assert/strict';
import { runTalkGenerate } from '../lib/talk_generate.js';
import { createChatSupplier } from '../lib/talk_supplier_glue.js';
import { generateOfflineShortFilmDraft } from '../lib/clementine/short_film_prompt.js';
import { buildShortFilmProject, createShortFilmVersion } from '../lib/clementine/short_film_store.js';

test('short-film quality rejection must not return an empty billed draft', async () => {
  const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
  const commits = [];
  let providerCalls = 0;
  let result;
  try {
    result = await runTalkGenerate({
      req: { body: { screenplay_target: 'page' }, clementine: {
        lane: 'page', commitWallet: n => commits.push(n),
      } },
      rid: 'short-film-empty-regression', logger: { log() {}, warn() {} },
      chatModelPlan: { model: 'test' },
      talkGenerationTranscript: 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.',
      chatSupplier: { chat: async () => {
        providerCalls++;
        return { text: 'Here are some ideas for your scene.', usage: { outputTokens: 123 } };
      } },
    });
  } finally {
    if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
  }
  assert.equal(providerCalls, 2, 'Exercise initial generation and real quality-gate repair');
  assert.ok(result.rawReply.trim(), 'The gate must not replace the draft with an empty reply');
  assert.equal(result.rawReply, 'Here are some ideas for your scene.');
  assert.deepEqual(commits, [123], 'Retained non-empty output is charged only once');
});

// Exercise the production generation stage with deterministic provider responses.
for (const [label, status, rawText] of [
  ['empty reply', 200, JSON.stringify({ choices: [{ message: { content: '' } }] })],
  ['whitespace reply', 200, JSON.stringify({ choices: [{ message: { content: '   ' } }] })],
  ['invalid JSON', 200, 'not-json'],
  ['provider rejection', 503, JSON.stringify({ error: { message: 'Unavailable' } })],
]) {
  test(`generation must not commit wallet for ${label}`, async () => {
    const commits = [];
    await assert.rejects(runTalkGenerate({
      req: { clementine: { lane: 'companion', commitWallet: n => commits.push(n) } },
      rid: 'empty-output-regression', logger: { log() {}, warn() {} },
      chatModelPlan: { model: 'test', apiMode: 'chat_completions', reasoningEffort: 'low' },
      chatSupplier: { chat: async () => ({
        response: { ok: status === 200, status }, rawText, usage: { outputTokens: 123 },
      }) },
      talkGenerationTranscript: 'hello',
    }));
    assert.deepEqual(commits, [], 'Failed output must not consume the writer wallet');
  });
}

for (const [label, provider] of [
  ['empty output', async () => ({ text: '', usage: { outputTokens: 123 } })],
  ['provider failure', async () => { throw new Error('provider unavailable'); }],
  ['cancellation', async () => { throw Object.assign(new Error('cancelled'), { cancelled: true }); }],
]) {
  test(`short-film ${label} neither charges nor mutates project state`, async () => {
    const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
    process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
    const commits = [];
    const owner = { ownerKey: 'billing-test-owner', projects: [] };
    const before = structuredClone(owner);
    let mutations = 0;
    try {
      await assert.rejects(runTalkGenerate({
        req: { body: { screenplay_target: 'page' }, clementine: {
          lane: 'page', commitWallet: n => commits.push(n),
          screenplayOwnerRecord: owner,
          commitScreenplayOwnerMutation: async () => { mutations++; },
        } },
        rid: 'short-film-failure', logger: { log() {}, warn() {} },
        chatModelPlan: { model: 'test' },
        talkGenerationTranscript: 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.',
        chatSupplier: { chat: provider },
      }));
      assert.deepEqual(commits, []);
      assert.equal(mutations, 0);
      assert.deepEqual(owner, before);
    } finally {
      if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
      else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
    }
  });
}

for (const [label, status, payload] of [
  ['empty content', 200, { choices: [{ message: { content: '' } }] }],
  ['whitespace content', 200, { choices: [{ message: { content: '   ' } }] }],
  ['HTTP error', 503, { error: { message: 'Unavailable' } }],
]) {
  test(`production supplier short-film ${label} cannot become a billed JSON draft`, async () => {
    const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
    process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
    const commits = [];
    let requests = 0;
    const supplier = createChatSupplier({
      OPENAI_API_KEY: 'test-only-key', isAbortError: () => false,
      streamChatReplyWithFirstSentence: async () => assert.fail('Unexpected stream'),
      fetchWithTimeout: async () => {
        requests++;
        return new Response(JSON.stringify({ ...payload, usage: { completion_tokens: 123 } }), { status });
      },
    });
    try {
      await assert.rejects(runTalkGenerate({
        req: { body: { screenplay_target: 'page' }, clementine: {
          lane: 'page', commitWallet: n => commits.push(n),
        } },
        rid: 'short-film-production-supplier', logger: { log() {}, warn() {} },
        chatModelPlan: { model: 'test', apiMode: 'chat_completions' },
        talkGenerationTranscript: 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.',
        chatSupplier: supplier,
      }));
      assert.ok(requests > 0, 'Exercise the production supplier, not a fake generation stage');
      assert.deepEqual(commits, []);
    } finally {
      if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
      else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
    }
  });
}

test('production supplier returns screenplay content, not its JSON envelope, and charges once', async () => {
  const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
  const commits = [];
  const draft = generateOfflineShortFilmDraft({ totalPages: 15, requestedPages: 5,
    genre: 'horror', setting: 'bedroom', characters: ['John', 'Sally', 'Sam'] });
  const supplier = createChatSupplier({
    OPENAI_API_KEY: 'test-only-key', isAbortError: () => false,
    streamChatReplyWithFirstSentence: async () => assert.fail('Unexpected stream'),
    fetchWithTimeout: async () => new Response(JSON.stringify({
      choices: [{ message: { content: draft } }], usage: { completion_tokens: 123 },
    })),
  });
  try {
    const result = await runTalkGenerate({
      req: { body: { screenplay_target: 'page' }, clementine: {
        lane: 'page', commitWallet: n => commits.push(n),
      } },
      rid: 'short-film-production-success', logger: { log() {}, warn() {} },
      chatModelPlan: { model: 'test', apiMode: 'chat_completions' },
      talkGenerationTranscript: 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.',
      chatSupplier: supplier,
    });
    assert.equal(result.rawReply, draft.trim());
    assert.deepEqual(commits, [123]);
  } finally {
    if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
  }
});

// T-1474: the owner-injected capability must not persist a retained reply
// before that reply has satisfied the existing screenplay quality contract.
function activeShortFilmOwnerFixture() {
  const parsed = { totalPages: 15, requestedPages: 5,
    genre: 'horror', setting: 'bedroom', characters: ['John', 'Sally', 'Sam'] };
  const ownerKey = 'billing-owner-quality-regression';
  const project = buildShortFilmProject({ parsed, ownerKey, now: 100,
    createScreenplayId: () => 'billing-active-project' });
  const saved = createShortFilmVersion({ parsed, now: 100,
    draft: 'INT. CABIN - NIGHT\n\nMARA\nKeep cafe\u0301 exactly as written.  \n',
    createScreenplayId: () => 'billing-original-version' });
  project.versions = [saved];
  project.activeVersionId = saved.id;
  return { parsed, owner: { ownerKey, projects: [project],
    activeProjectId: project.id, updatedAt: 100 } };
}

test('quality-rejected short-film prose cannot mutate a supplied active owner', async () => {
  const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
  const { owner } = activeShortFilmOwnerFixture();
  const before = structuredClone(owner);
  const persisted = structuredClone(owner);
  const commits = [];
  let mutations = 0;
  let providerCalls = 0;
  try {
    const result = await runTalkGenerate({
      req: { body: { screenplay_target: 'page' }, clementine: {
        lane: 'page', screenplayOwnerRecord: owner,
        commitWallet: n => commits.push(n),
        commitScreenplayOwnerMutation: async ({ mutate }) => {
          mutations++;
          await mutate(persisted);
        },
      } },
      rid: 'short-film-rejected-owner', logger: { log() {}, warn() {} },
      chatModelPlan: { model: 'test' },
      talkGenerationTranscript: 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.',
      chatSupplier: { chat: async () => {
        providerCalls++;
        return { text: 'Here are some ideas for your scene.', usage: { outputTokens: 123 } };
      } },
    });
    assert.equal(providerCalls, 2, 'Exercise actual initial generation and rejected quality repair');
    assert.equal(result.rawReply, 'Here are some ideas for your scene.', 'Preserve original625 retained-output behavior');
    assert.deepEqual(commits, [123], 'Usage stays a proposal for the final handler/adapter decision');
    assert.equal(mutations, 0, 'Rejected prose must never reach the owner committer');
    assert.deepEqual(owner, before, 'Preserve all project/version/active-owner state');
    assert.deepEqual(persisted, before, 'Rejected prose cannot create a durable version');
  } finally {
    if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
  }
});

test('accepted short-film screenplay appends and commits once without changing saved version bytes', async () => {
  const previous = process.env.CLEMENTINE_SHORT_FILM_BETA;
  process.env.CLEMENTINE_SHORT_FILM_BETA = '1';
  const { owner } = activeShortFilmOwnerFixture();
  const before = structuredClone(owner);
  const persisted = structuredClone(owner);
  // Exact VALID_PAGE from the canonical quality gate initial-pass control.
  const draft = [
    "INT. ARCHIVE - NIGHT",
    "",
    "Mara drives a brass key into the evidence locker as footsteps close behind her.",
    "",
    "ELI",
    "You said the file was gone.",
    "",
    "Mara snaps the key before the lock can release it.",
    "",
    "MARA",
    "I said they could not use it.",
    "",
    "The broken half drops inside the locker. Eli raises the original subpoena, its red seal reflected in the steel door.",
    "",
    "ELI",
    "Then we use this.",
    "",
    "Mara takes the subpoena and steps toward the approaching guard instead of the exit.",
  ].join("\n");
  const commits = [];
  let mutations = 0;
  let providerCalls = 0;
  try {
    const result = await runTalkGenerate({
      req: { body: { screenplay_target: 'page' }, clementine: {
        lane: 'page', screenplayOwnerRecord: owner,
        commitWallet: n => commits.push(n),
        commitScreenplayOwnerMutation: async ({ ownerKey, mutate }) => {
          mutations++;
          assert.equal(ownerKey, owner.ownerKey);
          await mutate(persisted);
        },
      } },
      rid: 'short-film-accepted-owner', logger: { log() {}, warn() {} },
      chatModelPlan: { model: 'test' },
      talkGenerationTranscript: 'A 15 pages thriller short film, one location archive, two characters Mara Eli. Write first one page.',
      chatSupplier: { chat: async () => {
        providerCalls++;
        return { text: draft, usage: { outputTokens: 123 } };
      } },
    });
    assert.equal(providerCalls, 1, 'Use the existing accepted screenplay fixture without a repair');
    assert.equal(result.rawReply, draft.trim());
    assert.equal(result.screenplayProjectId, before.activeProjectId);
    assert.deepEqual(commits, [123]);
    assert.equal(mutations, 1, 'Accepted output reaches the canonical committer exactly once');
    for (const record of [owner, persisted]) {
      assert.equal(record.activeProjectId, before.activeProjectId);
      assert.equal(record.projects.length, 1, 'Reuse the original active project');
      const project = record.projects[0];
      assert.equal(project.versions.length, 2, 'Append exactly one accepted version');
      assert.deepEqual(project.versions[0], before.projects[0].versions[0]);
      assert.deepEqual(Buffer.from(project.versions[0].draft, 'utf8'),
        Buffer.from(before.projects[0].versions[0].draft, 'utf8'));
      assert.equal(project.versions[1].draft, draft.trim());
      assert.equal(project.activeVersionId, project.versions[1].id);
    }
  } finally {
    if (previous === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = previous;
  }
});
