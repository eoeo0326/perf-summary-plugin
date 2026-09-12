#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApp, version } from './app.js';
import { publicError } from '../errors.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(version + '\n');
} else if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('perf-summary-mcp ' + version + '\nLocal stdio MCP server. Register this command in your MCP client.\nRequires Node.js 22+ and authenticated GitHub CLI (gh auth login).\n');
} else if (args.length) {
  process.stderr.write('지원하지 않는 인자입니다. --help를 참고하세요.\n');
  process.exitCode = 1;
} else if (Number(process.versions.node.split('.')[0]) < 22) {
  process.stderr.write('Node.js 22 이상이 필요합니다.\n');
  process.exitCode = 1;
} else {
  let app: ReturnType<typeof createApp> | undefined;
  const handle = serveStdio(() => {
    app = createApp();
    return app.server;
  }, { onerror: error => {
    process.stderr.write(JSON.stringify(publicError(error)) + '\n');
  } });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app?.collections.close();
    await handle.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void shutdown(); });
  process.stdin.once('end', () => { void shutdown(); });
}
