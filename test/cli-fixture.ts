// Test-only host entry. Never installed or published in the standalone skill.
import { setTimeout as delay } from 'node:timers/promises';
import { runCli } from '../src/cli/main.js';
import { CollectionManager } from '../src/collections.js';
import { GithubClient } from '../src/github/client.js';
import { AppError } from '../src/errors.js';
import { fixtureRunner } from './fixtures.js';

await runCli(undefined, {
  idleMs: process.env.PERF_SUMMARY_FIXTURE_MODE === 'idle' ? 1000 : undefined,
  services: () => {
  const github = new GithubClient(fixtureRunner(async (args, options) => {
    if (args.includes('graphql')) {
      if (process.env.PERF_SUMMARY_FIXTURE_MODE === 'slow') await delay(10_000, undefined, { signal: options.signal });
      if (process.env.PERF_SUMMARY_FIXTURE_MODE === 'partial' && JSON.parse(options.input!).variables.number === 2) {
        throw new AppError('ACCESS_DENIED', '권한 확인 필요');
      }
    }
  }).runner);
  return { github, collections: new CollectionManager(
    github, () => Date.parse('2026-05-20T00:00:00Z'), () => 'Asia/Seoul',
  ) };
} });
