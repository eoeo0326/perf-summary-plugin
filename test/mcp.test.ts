import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createApp } from '../src/mcp/app.js';
import { GithubClient } from '../src/github/client.js';
import { CollectionManager } from '../src/collections.js';
import { fixtureRunner } from './fixtures.js';
import { reportUri } from '../src/reports.js';

test('MCP 연결·6개 도구·입력 검증·수집·resource·prompt를 실제 SDK로 호출한다', async () => {
  const { runner } = fixtureRunner();
  const gh = new GithubClient(runner);
  const manager = new CollectionManager(gh, () => Date.parse('2026-05-20T00:00:00Z'), () => 'Asia/Seoul');
  const app = createApp(gh, manager);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await app.server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name).sort(), [
      'check_environment', 'collect_activity', 'get_activity', 'cancel_collection',
      'get_report_context', 'write_report',
    ].sort());
    const bad = await client.callTool({ name: 'collect_activity', arguments: { year: 'bad' } });
    assert.equal(bad.isError, true);
    const mixed = await client.callTool({ name: 'collect_activity', arguments: { year: '2025', month: '2025-01' } });
    assert.equal(mixed.isError, true);
    const started = await client.callTool({ name: 'collect_activity', arguments: { year: '2025' } });
    const id = (started.structuredContent as Record<string, unknown>).collectionId as string;
    await manager.finished(id);
    const activity = await client.callTool({ name: 'get_activity', arguments: { collectionId: id } });
    assert.equal((activity.structuredContent as Record<string, unknown>).complete, true);
    const content = activity.content as { type: string; text?: string }[];
    assert.deepEqual(JSON.parse(content[0]!.text!), activity.structuredContent);
    assert.equal(JSON.stringify(activity).includes('secret-for'), false);
    const context = await client.callTool({ name: 'get_report_context', arguments: { mode: 'year' } });
    const resource = await client.readResource({ uri: reportUri });
    assert.ok('text' in resource.contents[0]!);
    assert.equal(resource.contents[0]!.text, (context.structuredContent as Record<string, unknown>).guidelines);
    const prompt = await client.getPrompt({ name: 'performance-summary', arguments: { mode: 'year' } });
    assert.equal(prompt.messages.length, 1);
    assert.equal((await client.getPrompt({ name: 'performance-summary' })).messages.length, 1);
    const unknown = await client.callTool({
      name: 'get_activity', arguments: { collectionId: '00000000-0000-4000-8000-000000000000' },
    });
    assert.equal(unknown.isError, true);
  } finally {
    await client.close();
    await app.close();
  }
});
