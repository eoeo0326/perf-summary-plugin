import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async name => JSON.parse(await readFile(new URL('../' + name, import.meta.url), 'utf8'));
const pkg = await readJson('package.json');
for (const name of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const plugin = await readJson(name);
  assert.equal(plugin.name, 'perf-summary');
  assert.equal(plugin.version, pkg.version, name + ': version mismatch');
}
const codex = await readJson('.codex-plugin/plugin.json');
assert.equal(codex.mcpServers, './.mcp.json');
const mcp = await readJson('.mcp.json');
assert.deepEqual(mcp.mcpServers['perf-summary'].args, ['-y', pkg.name + '@' + pkg.version]);
assert.equal(mcp.mcpServers['perf-summary'].type, 'stdio');
const entry = await readFile(new URL('../' + pkg.bin['perf-summary-mcp'], import.meta.url), 'utf8');
assert.ok(entry.startsWith('#!/usr/bin/env node\n'));
assert.ok((await readFile(new URL('../resources/report-guidelines.md', import.meta.url), 'utf8')).length > 0);
assert.equal(pkg.scripts.postinstall, undefined);
assert.equal(pkg.scripts.install, undefined);
console.log('Release metadata, MCP configuration and executable verified.');
