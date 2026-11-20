import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { musePackageSchema } from '../src/types/muse-package.ts';

process.env.COSMICLABS_DB_PATH = ':memory:';
const { createDatabaseConnection } = await import('../server/db.ts');

test('HTTP serves legacy records and authenticated Muse exports without changing history', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'makefun-qa-'));
  const dbPath = path.join(directory, 'legacy.db');
  const { sqlite } = createDatabaseConnection(dbPath);
  const slug = 'legacy-bounty';
  const timestamp = new Date().toISOString();
  const endpoint = 'https://make.fun/api/competitions/' + slug;
  const prompt = '  Official fixture for @username\r\n\n';
  const fixtureToken = 'fixture-operator-token';
  function insert(table: string, overrides: Record<string, string | number>) {
    const fields = sqlite.prepare('PRAGMA table_info(' + table + ')').all() as
      Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>;
    const required = fields.filter(field => field.name in overrides ||
      ((field.notnull || field.pk) && field.dflt_value === null && !(field.pk && field.type === 'INTEGER')));
    sqlite.prepare('INSERT INTO ' + table + ' (' + required.map(field => field.name).join(', ') + ') VALUES (' +
      required.map(() => '?').join(', ') + ')').run(...required.map(field => overrides[field.name] ??
        (field.type === 'TEXT' ? 'ARCHIVED_LEGACY_VALUE' : 0)));
  }
  insert('bounties', { slug, id: slug, title: 'Legacy fixture', url: 'https://make.fun/bounty/' + slug,
    category: 'Software', last_synced_at: timestamp, founder_notes: 'PRIVATE_FOUNDER_NOTES' });
  insert('bounty_snapshots', {
    bounty_slug: slug, source_endpoint: endpoint, fetched_at: timestamp, content_hash: 'legacy-hash',
    raw_competition_json: JSON.stringify({ slug, title: 'Legacy fixture', description: prompt, status: 'open', submissionCount: 1 }),
    raw_requirements_json: JSON.stringify({ competition: { slug }, deliverables: [{ name: 'repo_url', required: true }] }),
    manual_prompt_override: 'PRIVATE_MANUAL_OVERRIDE', official_prompt_text: 'ARCHIVED_COMPOSITE',
  });
  insert('ai_analyses', { id: 'old-analysis', bounty_slug: slug });
  insert('prompt_drafts', { id: 'old-draft', bounty_slug: slug });
  insert('prompt_versions', { id: 'old-version', draft_id: 'old-draft', analysis_id: 'old-analysis', bounty_slug: slug, version_number: 1 });
  insert('submissions', { id: 'old-submission', bounty_slug: slug, source: 'manual', status: 'submitted' });
  insert('rewards', { id: 'old-reward', bounty_slug: slug, verified_award_usd: 12, received_usd: 5 });
  insert('hermes_evidence', { id: 'old-evidence', bounty_slug: slug, source_type: 'session_export', raw_content: 'PRIVATE_EVIDENCE' });
  insert('app_settings', { key: 'geminiApiKey', value: 'PRIVATE_STORED_CREDENTIAL' });
  const archived = ['ai_analyses', 'prompt_drafts', 'prompt_versions', 'bounty_snapshots', 'hermes_evidence', 'submissions', 'rewards'];
  const evidenceBefore = archived.map(table => sqlite.prepare('SELECT * FROM ' + table).all());
  sqlite.close();

  const mockGemini = `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const target = new URL(String(url));
      if (target.origin === 'https://make.fun' && target.pathname === '/api/recordings') {
        if (options.method !== 'GET' || new Headers(options.headers).get('x-api-key') !== 'af_fixture-monitor-key' ||
            target.searchParams.get('competition') !== 'legacy-bounty') return new Response(null, { status: 400 });
        return Response.json({ recordings: [{ recording_id: 'fixture-recording', competition: 'legacy-bounty',
          started_at: '2026-11-20T01:00:00Z', sealed_at: null, chunks: 4, documents: 1,
          internal_transcript: 'PRIVATE_RECORDING_CONTENT' }] });
      }
      if (target.origin === 'https://make.fun' && target.pathname.startsWith('/api/competitions/legacy-bounty')) {
        if (options.method !== 'GET' || new Headers(options.headers).has('x-api-key')) return new Response(null, { status: 400 });
        if (target.pathname.endsWith('/leaderboard')) return Response.json({ entries: [{ handle: 'fixture-hunter', rank: 2 }] });
        if (target.pathname.endsWith('/requirements')) return Response.json({ competition: { slug: 'legacy-bounty' } });
        if (target.pathname.endsWith('/kit')) return Response.json({ files: [] });
        return Response.json({ slug: 'legacy-bounty', title: 'Legacy fixture', description: 'Current official rules',
          status: 'open', deadline: '2026-12-01T00:00:00Z', acceptingSubmissions: true });
      }
      if (target.origin === 'https://make.fun' && ['/api/agents/me', '/api/claims'].includes(target.pathname)) {
        if (options.method !== 'GET' || new Headers(options.headers).get('x-api-key') !== 'af_fixture-monitor-key') {
          return Response.json({ error: 'invalid key' }, { status: 401 });
        }
        if (target.pathname === '/api/claims') return Response.json({ items: [], next_cursor: null });
        return Response.json({ agent: { handle: 'fixture-hunter' }, entry_count: 1, entries: [{
          submission_id: 'official-entry', competition: 'legacy-bounty', stage: 'scored', outcome: 'won', view: 'owner',
          checks: [{ check: 'run_completes', status: 'pass', reason: 'completed' }],
          claim_code: 'PRIVATE_CLAIM_CODE', payout: { id: 'official-payout', amount_usd: '12', status: 'ready', place: 1 },
        }] });
      }
      if (String(url) !== 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent') {
        return originalFetch(url, options);
      }
      if (new Headers(options.headers).get('x-goog-api-key') !== 'fixture-enhance-key') {
        return new Response(null, { status: 401 });
      }
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
        category: 'Software', basis: 'The official deliverable is a repository.',
        skills: [{ id: 'bounty-build', reason: 'Create the repository deliverable.' }],
      }) }] } }] });
    };
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', 'data:text/javascript,' + encodeURIComponent(mockGemini), 'server.ts'], {
    env: { ...process.env, COSMICLABS_DB_PATH: dbPath, COMMAND_CENTER_TOKEN: fixtureToken,
      NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let output = '';
      const onOutput = (buffer: Buffer) => {
        output += buffer.toString();
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      const timer = setTimeout(() => reject(new Error('Server failed to start: ' + output)), 10000);
      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);
      void exited.then(() => {
        clearTimeout(timer);
        reject(new Error('Server exited: ' + output));
      });
    });
    const headers = { 'X-Operator-Token': fixtureToken };
    const request = (route: string, init?: RequestInit) => fetch(base + '/api' + route, init);
    const get = async (route: string) => {
      const response = await request(route);
      assert.equal(response.status, 200);
      return response.json();
    };
    const details = await get('/bounties/' + slug);
    assert.equal(details.intelligence.officialPrompt, prompt);
    assert.equal(details.snapshot.rawCompetition.description, prompt);
    assert.equal('versions' in details, false);
    assert.equal('analyses' in details, false);
    assert.equal((await get('/bounties?status=all')).items[0].slug, slug);

    const exportUrl = '/bounties/' + slug + '/muse-export';
    assert.equal((await request(exportUrl + '?format=json')).status, 401);
    assert.equal((await request(exportUrl + '?format=file', { headers })).status, 400);
    assert.equal((await request(exportUrl + '?format=json&path=evidence', { headers })).status, 400);
    assert.equal((await request('/bounties/bad.bounty/muse-export?format=json', { headers })).status, 400);
    assert.equal((await request('/bounties/does-not-exist/muse-export?format=json', { headers })).status, 404);
    assert.equal((await request(exportUrl + '?format=json&checksum=sha256:' + '0'.repeat(64), { headers })).status, 409);
    const json = await request(exportUrl + '?format=json&checksum=' + details.intelligence.sourceProvenance.contentChecksum, { headers });
    assert.equal(json.status, 200);
    assert.equal(json.headers.get('content-disposition'), `attachment; filename="${slug}.json"`);
    assert.equal(json.headers.get('cache-control'), 'no-store');
    const jsonBody = await json.text();
    const pkg = musePackageSchema.parse(JSON.parse(jsonBody));
    assert.equal(pkg.officialPrompt, prompt);
    assert.doesNotMatch(jsonBody, /PRIVATE_|ARCHIVED_|fixture-operator-token/);
    const markdown = await request(exportUrl + '?format=markdown', { headers });
    assert.equal(markdown.status, 200);
    assert.equal(markdown.headers.get('content-disposition'), `attachment; filename="${slug}.md"`);
    assert.match(await markdown.text(), /## Muse Execution Bootstrap/);

    const patchHeaders = { ...headers, 'Content-Type': 'application/json' };
    const watchlist = '/bounties/' + slug + '/watchlist';
    assert.equal((await request(watchlist, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: '{"watchlisted":true}' })).status, 401);
    assert.equal((await request(watchlist, { method: 'PATCH', headers: { ...patchHeaders, Origin: 'https://example.invalid' },
      body: '{"watchlisted":true}' })).status, 403);
    assert.equal((await request(watchlist, { method: 'PATCH', headers: { ...patchHeaders, Origin: base },
      body: '{"watchlisted":true}' })).status, 200);
    assert.equal((await get('/bounties?watchlisted=1')).items.length, 1);
    assert.equal((await request('/evidence')).status, 404);
    assert.equal((await get('/submissions')).submissions[0].id, 'old-submission');
    assert.equal((await get('/rewards')).records[0].receivedUsd, 5);
    assert.equal((await request('/evidence/old-evidence/precheck', {
      method: 'POST', headers: patchHeaders, body: JSON.stringify({ bountySlug: slug }),
    })).status, 404);
    for (const route of ['/evidence/import', '/evidence/scan-local']) {
      assert.equal((await request(route, { method: 'POST', headers })).status, 404);
    }
    assert.equal((await request('/enhancer/run', { method: 'POST', headers })).status, 404);
    assert.equal((await request('/settings/test-llm', { method: 'POST', headers })).status, 404);
    assert.equal((await request('/prompts')).status, 404);
    const accountUrl = '/makefun/account';
    assert.equal((await request(accountUrl)).status, 401);
    const connected = await request(accountUrl, {
      method: 'PUT', headers: patchHeaders, body: JSON.stringify({ apiKey: 'af_fixture-monitor-key' }),
    });
    assert.equal(connected.status, 200);
    const account = await connected.json();
    assert.equal(account.snapshot.handle, 'fixture-hunter');
    assert.equal((await get('/settings')).accountHandle, '@fixture-hunter');
    const connectedPackage = (await get('/bounties/' + slug)).intelligence;
    assert.equal(connectedPackage.officialPrompt, prompt);
    assert.equal(connectedPackage.sourceProvenance.contentChecksum, pkg.sourceProvenance.contentChecksum);
    assert.equal(account.snapshot.entries[0].stage, 'scored');
    assert.equal(account.snapshot.rewards[0].amountUsd, '12');
    assert.doesNotMatch(JSON.stringify(account), /PRIVATE_CLAIM_CODE|af_fixture-monitor-key/);
    const recordingsUrl = accountUrl + '/recordings?competition=' + slug;
    assert.equal((await request(recordingsUrl)).status, 401);
    assert.equal((await request(accountUrl + '/recordings', { headers })).status, 400);
    const recordings = await request(recordingsUrl, { headers });
    assert.equal(recordings.status, 200);
    const recordingData = await recordings.json();
    assert.deepEqual(recordingData.recordings, [{
      id: 'fixture-recording', startedAt: '2026-11-20T01:00:00Z', sealedAt: null, chunks: 4, documents: 1,
    }]);
    assert.doesNotMatch(JSON.stringify(recordingData), /PRIVATE_RECORDING_CONTENT/);
    assert.equal((await request(accountUrl + '/sync', { method: 'POST', headers })).status, 200);
    const savedKey = 'fixture-enhance-key';
    const patchSettings = (body: object, authorized = true) => request('/settings', {
      method: 'PATCH', headers: authorized ? patchHeaders : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const enhanceDefaults = { provider: 'Google Gemini API', model: 'gemini-3.1-flash-lite', configured: false };
    assert.deepEqual((await get('/settings')).enhanceAi, enhanceDefaults);
    const enhance = (checksum: string, authorized = true) => request(`/bounties/${slug}/enhance-skill`, {
      method: 'POST', headers: authorized ? patchHeaders : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checksum }),
    });
    const checksum = pkg.sourceProvenance.contentChecksum;
    assert.equal((await enhance(checksum, false)).status, 401);
    assert.equal((await enhance('sha256:' + '0'.repeat(64))).status, 409);
    const missingKey = await enhance(checksum);
    assert.equal(missingKey.status, 400);
    assert.match((await missingKey.json()).error, /Settings/);
    assert.equal((await patchSettings({ enhanceGeminiApiKey: savedKey }, false)).status, 401);
    assert.equal((await patchSettings({ enhanceGeminiApiKey: '  ' })).status, 400);
    const saveKey = await patchSettings({ enhanceGeminiApiKey: ` ${savedKey} ` });
    assert.equal(saveKey.status, 200);
    assert.deepEqual((await saveKey.json()).enhanceAi, { ...enhanceDefaults, configured: true });
    const keyPath = path.join(directory, '.env.legacy.db.enhance');
    assert.equal(readFileSync(keyPath, 'utf8'), savedKey);
    const skillReview = await enhance(checksum);
    assert.equal(skillReview.status, 200);
    assert.deepEqual(await skillReview.json(), {
      category: 'Software', basis: 'The official deliverable is a repository.',
      skills: [{ id: 'bounty-build', path: '.agents/skills/bounty-build/SKILL.md', reason: 'Create the repository deliverable.' }],
    });
    const unrelatedUpdate = await patchSettings({ syncIntervalMinutes: 20 });
    assert.equal((await unrelatedUpdate.json()).enhanceAi.configured, true);
    for (const route of ['/settings', '/overview']) {
      const body = JSON.stringify(await get(route));
      assert.doesNotMatch(body, /PRIVATE_STORED_CREDENTIAL|fixture-enhance-key|enhanceGeminiApiKey/);
    }
    assert.equal((await patchSettings({ enhanceGeminiApiKey: 'fixture-replacement' })).status, 200);
    assert.equal(readFileSync(keyPath, 'utf8'), 'fixture-replacement');
    const removeKey = await patchSettings({ enhanceGeminiApiKey: null });
    assert.equal(removeKey.status, 200);
    assert.deepEqual((await removeKey.json()).enhanceAi, enhanceDefaults);
    assert.equal(existsSync(keyPath), false);
    assert.equal((await request('/makefun/watchlist')).status, 401);
    const watchSync = await request('/makefun/watchlist/sync', { method: 'POST', headers });
    assert.equal(watchSync.status, 200);
    const monitored = await watchSync.json();
    assert.ok(monitored.lastSyncAt);
    assert.equal(monitored.handle, 'fixture-hunter');
    assert.equal(monitored.items[0].acceptingSubmissions, true);
    assert.equal(monitored.items[0].rank, 2);
    const syncedSubmission = (await get('/submissions')).submissions.find((entry: { id: string }) =>
      entry.id === 'legacy-bounty-lb-fixture-hunter');
    assert.equal(syncedSubmission?.hunterHandle, '@fixture-hunter');
    assert.equal((await request(accountUrl, { method: 'DELETE', headers })).status, 200);
    assert.equal((await (await request(accountUrl, { headers })).json()).connection, 'disconnected');
    assert.equal(existsSync(path.join(directory, '.env.legacy.db.makefun')), false);
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
    const { sqlite: reopened } = createDatabaseConnection(dbPath);
    try {
      const filters: Record<string, string> = {
        bounty_snapshots: " WHERE content_hash = 'legacy-hash'",
        submissions: " WHERE id = 'old-submission'",
      };
      assert.deepEqual(archived.map(table => reopened.prepare('SELECT * FROM ' + table + (filters[table] ?? '')).all()), evidenceBefore);
      assert.equal(reopened.prepare("SELECT value FROM app_settings WHERE key = 'geminiApiKey'").pluck().get(), 'PRIVATE_STORED_CREDENTIAL');
      assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
