import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const prompt = '  Official fixture\r\n\n';
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

  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
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
    assert.match(json.headers.get('content-disposition')!, /attachment; filename="MUSE_BOUNTY_CONTEXT.json"/);
    assert.equal(json.headers.get('cache-control'), 'no-store');
    const jsonBody = await json.text();
    const pkg = musePackageSchema.parse(JSON.parse(jsonBody));
    assert.equal(pkg.officialPrompt, prompt);
    assert.doesNotMatch(jsonBody, /PRIVATE_|ARCHIVED_|fixture-operator-token/);
    const markdown = await request(exportUrl + '?format=markdown', { headers });
    assert.equal(markdown.status, 200);
    assert.match(markdown.headers.get('content-disposition')!, /MUSE_BOUNTY_CONTEXT\.md/);
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
    assert.equal((await get('/evidence')).evidence[0].id, 'old-evidence');
    assert.equal((await get('/submissions')).submissions[0].id, 'old-submission');
    assert.equal((await get('/rewards')).records[0].receivedUsd, 5);
    assert.equal((await request('/evidence/old-evidence/precheck', {
      method: 'POST', headers: patchHeaders, body: '{"bountySlug":"another-bounty"}',
    })).status, 400);
    assert.equal((await request('/evidence/old-evidence/precheck', {
      method: 'POST', headers: patchHeaders, body: JSON.stringify({ bountySlug: slug }),
    })).status, 200);
    assert.equal((await request('/enhancer/run', { method: 'POST', headers })).status, 404);
    assert.equal((await request('/settings/test-llm', { method: 'POST', headers })).status, 404);
    assert.equal((await request('/prompts')).status, 404);
    assert.doesNotMatch(JSON.stringify(await get('/settings')), /PRIVATE_|apiKey|provider/i);
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
    const { sqlite: reopened } = createDatabaseConnection(dbPath);
    try {
      assert.deepEqual(archived.map(table => reopened.prepare('SELECT * FROM ' + table).all()), evidenceBefore);
      assert.equal(reopened.prepare("SELECT value FROM app_settings WHERE key = 'geminiApiKey'").pluck().get(), 'PRIVATE_STORED_CREDENTIAL');
      assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
