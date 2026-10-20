import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'perf-skills-')));
const source = path.join(root, 'skills/perf-summary');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run through npm run test:skills');
const workers = [];
function node(args, cwd, env = {}, input) {
  const result = spawnSync(process.execPath, args, {
    cwd, input, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DISABLE_TELEMETRY: '1', ...env },
  });
  assert.equal(result.status, 0, (result.error?.message ?? '') + result.stderr + result.stdout);
  return result.stdout;
}

try {
  for (const copy of [false, true]) {
    const project = path.join(temp, copy ? '복사 설치' : '링크 설치');
    await mkdir(path.join(project, '.claude'), { recursive: true });
    const install = node([npmCli, 'exec', '--offline', '--prefix', root, '--', 'skills', 'add', root,
      '--skill', 'perf-summary', '-a', 'claude-code', '-a', 'codex', '-y', ...(copy ? ['--copy'] : [])], project);
    assert.ok(!/Failed to install/.test(install), install);
    for (const agent of ['.claude', '.agents']) {
      const installed = path.join(project, agent, 'skills/perf-summary');
      assert.equal(await readFile(path.join(installed, 'SKILL.md'), 'utf8'), await readFile(path.join(source, 'SKILL.md'), 'utf8'));
      for (const resource of ['scripts/perf-summary.mjs', 'references/report-guidelines.md', 'references/cli.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
        assert.ok((await lstat(path.join(installed, resource))).isFile(), resource);
      }
      const script = path.join(installed, 'scripts/perf-summary.mjs');
      const context = JSON.parse(node([script, 'get_report_context', '--input', '{"mode":"year"}'], project));
      assert.equal(context.guidelines, await readFile(path.join(source, 'references/report-guidelines.md'), 'utf8'));
    }

    // Move only the installed skill to an unrelated directory with no package.json,
    // node_modules, repository files or MCP configuration in its ancestry.
    const standalone = path.join(temp, copy ? 'standalone copy' : 'standalone link');
    await cp(path.join(project, '.agents/skills/perf-summary'), standalone, { recursive: true, dereference: true });
    const working = path.join(temp, copy ? '보고서 작업 2' : '보고서 작업 1');
    await mkdir(working);
    const script = path.join(standalone, 'scripts/perf-summary.mjs');
    const runtime = path.join(temp, copy ? 'runtime-copy' : 'runtime-link');
    const env = { PERF_SUMMARY_RUNTIME_DIR: runtime };
    workers.push({ script, working, env });
    const call = (method, input = {}) => JSON.parse(node([script, method, '--input', '-'], working, env, JSON.stringify(input)));
    for (const [flags, expected] of [
      [['--year', '2025', '--org', 'acme'], 13],
      [['--month', '2025-03', '--repo', 'acme/app', '--output', './reports/march.md'], 1],
      [['--since', '2025-03', '--until', '2025-06', '--account', 'alice,bob'], 1],
      [['--since', '2025', '--until', '2025'], 1],
    ]) {
      const plan = JSON.parse(node([script, 'plan', ...flags], working, env));
      assert.equal(plan.reports.length, expected);
      if (flags.includes('--output')) assert.equal(plan.reports[0].absolutePath, path.join(working, 'reports/march.md'));
    }
    for (const flags of [['--dry-run'], ['--output', 'none']]) {
      assert.equal(JSON.parse(node([script, 'plan', '--year', '2025', ...flags], working, env)).preview, true);
      assert.deepEqual(await readdir(working), []);
    }
    const start = call('collect_activity', { year: '9998' });
    let result;
    for (let i = 0; i < 20; i++) {
      result = call('get_activity', { collectionId: start.collectionId });
      if (result.status !== 'running') break;
      await delay(100);
    }
    assert.equal(result.complete, true);
    assert.deepEqual(result.period.reports, []);
    assert.equal(call('cancel_collection', { collectionId: start.collectionId }).cancellationRequested, false);
    const absolutePath = path.join(working, 'PerformanceSummary', '検証 한글', 'report.md');
    assert.equal(call('write_report', { absolutePath, markdown: '# 설치 검증\n' }).written, true);
    assert.equal(await readFile(absolutePath, 'utf8'), '# 설치 검증\n');
    assert.equal(call('write_report', { absolutePath, markdown: '# 충돌\n' }).reason, 'exists');
    const connection = JSON.parse(await readFile(path.join(runtime, 'connection.json'), 'utf8'));
    assert.deepEqual(Object.keys(connection).sort(), ['endpoint', 'token']);
    const files = await readdir(runtime);
    assert.ok(files.every(name => ['ipc', 'connection.json'].includes(name)), files.join(','));
  }
  console.log('Actual skills installation verified for Claude Code and Codex (symlink and copy).');
  console.log('Standalone bundle, three report modes, filters, previews, IPC collection and report writes verified without MCP or repository dependencies.');
} finally {
  for (const { script, working, env } of workers) {
    node([script, '--stop-worker'], working, env);
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
