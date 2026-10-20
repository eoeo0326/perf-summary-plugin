import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createApp } from '../src/mcp/app.js';
import { GithubClient } from '../src/github/client.js';
import { CollectionManager } from '../src/collections.js';
import { fixtureRunner } from './fixtures.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'perf-cli-'));
const entry = path.join(temp, 'scripts', 'fixture.mjs');
const runtimes: string[] = [];
before(async () => {
  await mkdir(path.dirname(entry));
  await cp(path.join(root, 'skills/perf-summary/references'), path.join(temp, 'references'), { recursive: true });
  await build({
    absWorkingDir: root, entryPoints: ['test/cli-fixture.ts'], outfile: entry,
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    define: { __PERF_SUMMARY_VERSION__: JSON.stringify('test') },
  });
});

async function host(mode = '') {
  const directory = await mkdtemp(path.join(temp, 'runtime-'));
  runtimes.push(directory);
  return (args: string[], input?: unknown, expected = 0) => new Promise<any>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: temp, env: { ...process.env, PERF_SUMMARY_RUNTIME_DIR: directory, PERF_SUMMARY_FIXTURE_MODE: mode },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI timeout')); }, 30_000);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timeout);
      try {
        assert.equal(code, expected, stderr + '\n' + stdout);
        assert.equal(stderr, '');
        assert.ok(!stdout.includes('secret-for') && !stdout.includes('never-return-this'));
        resolve(JSON.parse(stdout));
      } catch (error) { reject(error); }
    });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
type Host = Awaited<ReturnType<typeof host>>;
async function tool(run: Host, name: string, input: unknown = {}, expected = 0) {
  return run([name, '--input', '-'], input, expected);
}
async function completed(run: Host, collectionId: string) {
  for (let i = 0; i < 100; i++) {
    const result = await tool(run, 'get_activity', { collectionId });
    if (result.status !== 'running') return result;
    await delay(25);
  }
  throw new Error('Collection did not finish');
}
after(async () => {
  for (const directory of runtimes) {
    const child = spawn(process.execPath, [entry, '--stop-worker'], {
      env: { ...process.env, PERF_SUMMARY_RUNTIME_DIR: directory }, stdio: 'ignore',
    });
    await new Promise<void>(resolve => child.once('close', () => resolve()));
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('별도 CLI 호출에서도 year/month/since-until 수집은 MCP와 동일한 통계·근거·출력을 제공한다', async () => {
  const run = await host();
  const github = new GithubClient(fixtureRunner().runner);
  const manager = new CollectionManager(github, () => Date.parse('2026-05-20T00:00:00Z'), () => 'Asia/Seoul');
  const app = createApp(github, manager);
  const client = new Client({ name: 'parity', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await app.server.connect(b);
    await client.connect(a);
    for (const input of [{ year: '2025' }, { month: '2025-01' },
      { since: '2025-01', until: '2025-02', accounts: ['alice', 'bob'], orgs: ['acme'] }]) {
      const cliStart = await tool(run, 'collect_activity', input);
      const cli = await completed(run, cliStart.collectionId);
      const mcpStart = await client.callTool({ name: 'collect_activity', arguments: input });
      const id = (mcpStart.structuredContent as any).collectionId;
      await manager.finished(id);
      const mcp = (await client.callTool({ name: 'get_activity', arguments: { collectionId: id } })).structuredContent as any;
      for (const key of ['period', 'accounts', 'summary', 'prs', 'status', 'complete', 'progress', 'issues']) {
        assert.deepEqual(cli[key], mcp[key], key);
      }
      assert.equal(cli.complete, true);
      const first = await tool(run, 'get_activity', { collectionId: cliStart.collectionId, pageSize: 1 });
      assert.ok(first.nextCursor);
      const second = await tool(run, 'get_activity', { collectionId: cliStart.collectionId, cursor: first.nextCursor, pageSize: 1 });
      assert.equal(second.nextCursor, null);
      assert.notEqual(first.prs[0].url, second.prs[0].url);
      assert.equal((await tool(run, 'get_activity', {
        collectionId: cliStart.collectionId, cursor: first.nextCursor, month: '2025-02',
      }, 1)).code, 'INVALID_CURSOR');
    }
    const context = await tool(run, 'get_report_context', { mode: 'year' });
    const mcpContext = (await client.callTool({ name: 'get_report_context', arguments: { mode: 'year' } })).structuredContent as any;
    assert.deepEqual(context, mcpContext);
    assert.equal((await tool(run, 'check_environment')).ready, true);
  } finally { await client.close(); await app.close(); }
});

test('CLI는 부분 실패를 숨기지 않고 지정 계정만 조회할 수 있다', async () => {
  const run = await host('partial');
  const start = await tool(run, 'collect_activity', { year: '2025' });
  const result = await completed(run, start.collectionId);
  assert.equal(result.status, 'partial');
  assert.equal(result.complete, false);
  assert.equal(result.summary.total.prs, 1);
  assert.equal(result.progress.failed, 1);
  assert.equal(result.issues[0].code, 'ACCESS_DENIED');
  const selected = await tool(run, 'collect_activity', { year: '2025', accounts: ['alice'] });
  assert.equal((await completed(run, selected.collectionId)).complete, true);
});

test('동시 기동·수집 2개 제한·취소·종료·재기동을 별도 프로세스에서 처리한다', async () => {
  const run = await host('slow');
  const [a, b] = await Promise.all([
    tool(run, 'collect_activity', { year: '2025' }), tool(run, 'collect_activity', { year: '2025' }),
  ]);
  assert.notEqual(a.collectionId, b.collectionId);
  assert.equal((await tool(run, 'collect_activity', { year: '2025' }, 1)).code, 'BUSY');
  for (const start of [a, b]) {
    assert.equal((await tool(run, 'cancel_collection', { collectionId: start.collectionId })).cancellationRequested, true);
    const result = await completed(run, start.collectionId);
    assert.equal(result.status, 'cancelled');
    assert.equal(result.complete, false);
  }
  await run(['--stop-worker']);
  assert.equal((await tool(run, 'get_activity', { collectionId: a.collectionId }, 1)).code, 'COLLECTION_NOT_FOUND');
  const next = await tool(run, 'collect_activity', { year: '9998' });
  assert.deepEqual((await completed(run, next.collectionId)).period.reports, []);
});

test('CLI는 stdin 한국어 보고서·충돌·승인된 덮어쓰기와 입력 오류를 처리한다', async () => {
  const run = await host();
  const absolutePath = path.join(temp, '보고서 폴더', 'report.md');
  assert.equal((await tool(run, 'write_report', { absolutePath, markdown: '# 성과 보고서\n인증 개선\n' })).written, true);
  assert.equal((await tool(run, 'write_report', { absolutePath, markdown: '# 변경\n' })).reason, 'exists');
  assert.equal(await readFile(absolutePath, 'utf8'), '# 성과 보고서\n인증 개선\n');
  assert.equal((await tool(run, 'write_report', { absolutePath, markdown: '# 변경\n', overwrite: true })).written, true);
  assert.equal(await readFile(absolutePath, 'utf8'), '# 변경\n');
  assert.equal((await tool(run, 'get_activity', { collectionId: '../../other' }, 1)).code, 'INVALID_INPUT');
  assert.equal((await run(['collect_activity', '--input', '{'], undefined, 1)).code, 'INVALID_INPUT');
  const filesBefore = await readdir(temp);
  for (const flags of [['--dry-run'], ['--output', 'none']]) {
    const plan = await run(['plan', '--year', '2025', ...flags]);
    assert.equal(plan.preview, true);
    assert.equal(plan.reports.length, 13);
  }
  assert.deepEqual(await readdir(temp), filesBefore);
});

test('유휴 작업 프로세스는 종료하며 오래된 수집은 재수집 안내로 처리한다', async () => {
  const run = await host('idle');
  const start = await tool(run, 'collect_activity', { year: '9998' });
  assert.equal((await completed(run, start.collectionId)).complete, true);
  await delay(2200);
  assert.equal((await tool(run, 'get_activity', { collectionId: start.collectionId }, 1)).code, 'COLLECTION_NOT_FOUND');
  const next = await tool(run, 'collect_activity', { year: '9998' });
  assert.notEqual(start.collectionId, next.collectionId);
  assert.equal((await completed(run, next.collectionId)).complete, true);
});
