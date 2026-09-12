// Manual host integration fixture: never contacts GitHub and is excluded from the npm package.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApp } from '../src/mcp/app.js';
import { GithubClient } from '../src/github/client.js';
import { CollectionManager } from '../src/collections.js';
import { fixtureRunner } from './fixtures.js';

const apps: ReturnType<typeof createApp>[] = [];
const handle = serveStdio(() => {
  const github = new GithubClient(fixtureRunner().runner);
  const app = createApp(github, new CollectionManager(
    github, () => Date.parse('2026-05-20T00:00:00Z'), () => 'Asia/Seoul',
  ));
  apps.push(app);
  return app.server;
});
const close = async () => {
  await Promise.all(apps.map(app => app.collections.close()));
  await handle.close();
};
process.stdin.once('end', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
