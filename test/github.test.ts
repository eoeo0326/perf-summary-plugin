import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient } from '../src/github/client.js';
import { ghEnvironment } from '../src/github/process.js';
import { trimBody } from '../src/github/evidence.js';
import { fixtureRunner, item, json, pr } from './fixtures.js';
import { AppError, publicError } from '../src/errors.js';

test('인증 JSON 상태를 검사하고 토큰·다른 호스트를 반환하지 않는다', async () => {
  const { runner } = fixtureRunner(async args => args[1] === 'status' ? json({ hosts: {
    'github.com': [{ login: 'alice', active: true, state: 'error', token: 'secret' }],
  } }) : undefined);
  const env = await new GithubClient(runner).inspect();
  assert.equal(env.ready, false);
  assert.equal(env.errors[0]?.code, 'AUTH_INVALID');
  assert.equal(JSON.stringify(env).includes('secret'), false);
});

test('각 계정에 저장된 토큰을 적용하며 전역 환경과 활성 계정을 바꾸지 않는다', async () => {
  const { runner, calls } = fixtureRunner();
  const parent = { GH_TOKEN: 'wrong', GITHUB_TOKEN: 'wrong', GH_HOST: 'enterprise.example', GH_DEBUG: 'api', PATH: '/bin' };
  const gh = new GithubClient(runner, parent);
  const signal = new AbortController().signal;
  const credentials = await gh.credentials(undefined, signal);
  assert.deepEqual(credentials.map(c => c.login), ['alice', 'bob']);
  for (const credential of credentials) await gh.search('is:pr', 1, credential, signal);
  assert.equal(calls.some(c => c.args.includes('switch')), false);
  assert.equal(parent.GH_TOKEN, 'wrong');
  for (const call of calls.filter(c => c.args[0] === 'auth')) {
    assert.equal(call.options.env.GH_TOKEN, undefined);
    assert.equal(call.options.env.GITHUB_TOKEN, undefined);
    assert.equal(call.options.env.GH_DEBUG, undefined);
  }
  assert.deepEqual(calls.filter(c => c.args[0] === 'api').map(c => c.options.env.GH_TOKEN), ['secret-for-alice', 'secret-for-bob']);
  assert.equal(ghEnvironment(parent).PATH, '/bin');
});

test('명시 계정은 다른 계정의 인증 실패에 영향받지 않는다', async () => {
  const { runner } = fixtureRunner(async args => args[1] === 'status' ? json({ hosts: {
    'github.com': [
      { login: 'alice', active: true, state: 'success' },
      { login: 'bob', active: false, state: 'error' },
    ],
  } }) : undefined);
  const client = new GithubClient(runner);
  assert.equal((await client.credentials(['ALICE'], new AbortController().signal))[0]?.login, 'alice');
  await assert.rejects(client.credentials(undefined, new AbortController().signal), /bob/);
  await assert.rejects(client.credentials(['unknown'], new AbortController().signal), /unknown/);
});

test('PR의 전체 커밋 수와 파일 수를 보존하고 근거 축약을 표시한다', async () => {
  const { runner } = fixtureRunner();
  const value = await new GithubClient(runner).detail(item(), { login: 'alice', token: 'secret' }, new AbortController().signal);
  assert.equal(value.commits, 37);
  assert.equal(value.commitHeadlines.length, 1);
  assert.equal(value.changedFiles, 12);
  assert.equal(value.body, '인증 구현');
  assert.ok(value.evidenceNotes.length >= 3);
});

test('release 브랜치는 제목과 관계없이 근거 본문 조회를 생략한다', async () => {
  const { runner, calls } = fixtureRunner(async (args, options) => {
    if (!args.includes('graphql')) return;
    return json({ data: { repository: { pullRequest: {
      ...pr(), author: { login: 'alice' }, state: 'MERGED', isDraft: false,
      headRefName: 'release/1.2.0', commits: { totalCount: 900 },
    } } } });
  });
  const value = await new GithubClient(runner).detail(item(), { login: 'alice', token: 'secret' }, new AbortController().signal);
  assert.equal(value.isRelease, true);
  assert.equal(value.commits, 900);
  assert.equal(value.body, '');
  assert.equal(calls.filter(c => c.args.includes('graphql')).length, 1);
});

test('누락된 정량 필드를 0으로 바꾸지 않고 실패한다', async () => {
  const { runner } = fixtureRunner(args => args.includes('graphql') ? json({ data: { repository: null } }) : undefined);
  await assert.rejects(new GithubClient(runner).detail(item(), { login: 'alice', token: 'secret' }, new AbortController().signal),
    (error: AppError) => error.code === 'INVALID_RESPONSE');
});

test('rate limit 재시도 간격을 지키고 원문 오류의 토큰을 노출하지 않는다', async () => {
  const waits: number[] = [];
  let attempts = 0;
  const { runner } = fixtureRunner(args => {
    if (args.includes('search/issues') && attempts++ === 0) {
      return { stdout: 'HTTP/2.0 429 Too Many Requests\r\nRetry-After: 2\r\n\r\n{}', stderr: 'secret-token', exitCode: 1 };
    }
    return;
  });
  const client = new GithubClient(runner, {}, async ms => { waits.push(ms); });
  await client.search('is:pr', 1, { login: 'alice', token: 'secret' }, new AbortController().signal);
  assert.deepEqual(waits, [2000]);
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(publicError(new Error('token=secret'))).includes('secret'), false);
});

test('접근 거부는 재시도 없이 설명 가능한 오류로 반환한다', async () => {
  const { runner, calls } = fixtureRunner(() => ({
    stdout: 'HTTP/2.0 403 Forbidden\n\n{"message":"private secret"}', stderr: '', exitCode: 1,
  }));
  await assert.rejects(new GithubClient(runner).search('is:pr', 1, { login: 'alice', token: 'secret' }, new AbortController().signal),
    (error: AppError) => error.code === 'ACCESS_DENIED' && !error.message.includes('secret'));
  assert.equal(calls.length, 1);
});

test('본문 길이 제한과 callout·체크리스트 제거를 적용한다', () => {
  const trimmed = trimBody('x'.repeat(1800) + '\n\n### 테스트 항목\nsecret checklist');
  assert.equal(trimmed.body.length, 1500);
  assert.equal(trimmed.notes.length, 2);
});
