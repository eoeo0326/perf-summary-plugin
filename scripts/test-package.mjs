import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this script through npm run test:package');
const temp = await mkdtemp(path.join(tmpdir(), 'perf-package-'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const npm = (args, cwd = root) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  return result.stdout;
};
try {
  npm(['run', 'build']);
  const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp]))[0];
  for (const file of packed.files) {
    assert.ok(/^(package\.json|README\.md|LICENSE|dist\/.+|resources\/.+)$/.test(file.path),
      'Unexpected published file: ' + file.path);
  }
  const install = path.join(temp, '설치 폴더');
  const working = path.join(temp, 'different-working-directory');
  await mkdir(install);
  await mkdir(working);
  await writeFile(path.join(install, 'package.json'), '{"private":true}');
  npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, packed.filename)], install);
  const entry = path.join(install, 'node_modules', pkg.name, pkg.bin['perf-summary-mcp']);
  const cli = spawnSync(process.execPath, [entry, '--version'], { cwd: working, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), pkg.version);
  for (const mode of ['legacy', 'auto']) {
    const client = new Client({ name: 'package-smoke', version: '1.0.0' }, { versionNegotiation: { mode } });
    const transport = new StdioClientTransport({
      command: process.execPath, args: [entry], cwd: working, stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    try {
      await client.connect(transport);
      assert.equal((await client.listTools()).tools.length, 6);
      const context = await client.callTool({ name: 'get_report_context', arguments: { mode: 'year' } });
      assert.equal(context.isError, undefined);
      assert.ok(context.structuredContent.guidelines.includes('## 📖 연간 종합'));
      const resource = await client.readResource({ uri: 'perf-summary://report-guidelines' });
      assert.equal(resource.contents[0].text, context.structuredContent.guidelines);
      assert.equal((await client.getPrompt({ name: 'performance-summary' })).messages.length, 1);
      const started = await client.callTool({ name: 'collect_activity', arguments: { year: '9998' } });
      let complete = false;
      for (let i = 0; i < 50; i++) {
        const activity = await client.callTool({
          name: 'get_activity', arguments: { collectionId: started.structuredContent.collectionId },
        });
        if (activity.structuredContent.complete) {
          assert.deepEqual(activity.structuredContent.period.reports, []);
          complete = true;
          break;
        }
        await delay(20);
      }
      assert.ok(complete, 'Future-year collection did not complete');
      const target = path.join(working, 'PerformanceSummary', mode + '.md');
      const saved = await client.callTool({
        name: 'write_report', arguments: { absolutePath: target, markdown: '# 패키지 검증\n' },
      });
      assert.equal(saved.structuredContent.written, true);
      assert.equal(await readFile(target, 'utf8'), '# 패키지 검증\n');
      const conflict = await client.callTool({
        name: 'write_report', arguments: { absolutePath: target, markdown: '# Changed\n' },
      });
      assert.equal(conflict.structuredContent.written, false);
      assert.equal(stderr, '', 'Unexpected MCP stderr output: ' + stderr);
    } finally { await client.close(); }
  }
  console.log('Packed installation, stdio MCP, resources, prompts and report writes verified (' +
    packed.files.length + ' files, ' + packed.size + ' bytes).');
} finally {
  await rm(temp, { recursive: true, force: true });
}
