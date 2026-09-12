import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { CollectionManager, type ActivitySource } from '../src/collections.js';
import { GithubClient } from '../src/github/client.js';
import { AppError } from '../src/errors.js';
import { fixtureRunner, item, pr } from './fixtures.js';

const clock = () => Date.parse('2026-05-20T01:00:00Z');
const timezone = () => 'Asia/Seoul';
function source(changes: Partial<ActivitySource> = {}): ActivitySource {
  return {
    credentials: async () => [{ login: 'alice', token: 'secret' }],
    search: async () => ({ total_count: 1, incomplete_results: false, items: [item()] }),
    detail: async item => pr(item.number),
    ...changes,
  };
}

test('즉시 ID 반환 후 다중 계정 수집·집계·필터·페이지를 제공한다', async () => {
  const { runner } = fixtureRunner();
  const manager = new CollectionManager(new GithubClient(runner), clock, timezone);
  const started = manager.start({ year: '2025' });
  assert.equal(started.status, 'running');
  assert.equal(manager.read({ collectionId: started.collectionId }).status, 'running');
  await manager.finished(started.collectionId);
  const first = manager.read({ collectionId: started.collectionId, pageSize: 1 });
  assert.equal(first.status, 'completed');
  assert.deepEqual(first.accounts, ['alice', 'bob']);
  assert.equal(first.summary?.total.commits, 74);
  assert.equal(first.summary?.months[0]?.prs, 2);
  assert.equal(first.summary?.months[1]?.prs, 0);
  assert.ok(first.nextCursor);
  const next = manager.read({ collectionId: started.collectionId, cursor: first.nextCursor!, pageSize: 1 });
  assert.equal(next.nextCursor, null);
  assert.notEqual(first.prs[0]?.url, next.prs[0]?.url);
  assert.equal(manager.read({ collectionId: started.collectionId, month: '2025-02' }).prs.length, 0);
  assert.throws(() => manager.read({ collectionId: started.collectionId, month: '2025-02', cursor: first.nextCursor! }),
    (error: AppError) => error.code === 'INVALID_CURSOR');
  await manager.close();
});

test('검색 1000건 한도를 날짜 분할로 처리하고 같은 PR을 중복 집계하지 않는다', async () => {
  const queries: string[] = [];
  const manager = new CollectionManager(source({
    search: async query => {
      queries.push(query);
      return queries.length === 1 ?
        { total_count: 1001, incomplete_results: false, items: [] } :
        { total_count: 1, incomplete_results: false, items: [item()] };
    },
  }), clock, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  assert.equal(queries.length, 3);
  assert.match(queries[0]!, /created:2024-12-31T15:00:00Z\.\.2025-12-31T14:59:59Z/);
  assert.equal(manager.read({ collectionId }).summary?.total.prs, 1);
  await manager.close();
});

test('검색의 마지막 페이지까지 읽고 정확히 1000건이면 불필요한 분할을 하지 않는다', async () => {
  const pages: number[] = [];
  const manager = new CollectionManager(source({
    search: async (_query, page) => {
      pages.push(page);
      return { total_count: 1000, incomplete_results: false,
        items: Array.from({ length: 100 }, (_, i) => item((page - 1) * 100 + i + 1)) };
    },
  }), clock, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  assert.deepEqual(pages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(manager.read({ collectionId }).summary?.total.prs, 1000);
  await manager.close();
});

test('검색 페이지 누락을 성공으로 보고하지 않는다', async () => {
  const manager = new CollectionManager(source({
    search: async () => ({ total_count: 2, incomplete_results: false, items: [item()] }),
  }), clock, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  const result = manager.read({ collectionId });
  assert.equal(result.status, 'partial');
  assert.equal(result.complete, false);
  assert.equal(result.issues[0]?.code, 'SEARCH_INCOMPLETE');
  assert.ok(result.reportWarning);
  await manager.close();
});

test('상세 조회 실패는 별도로 표시하고 성공한 PR만 합산한다', async () => {
  const manager = new CollectionManager(source({
    search: async () => ({ total_count: 2, incomplete_results: false, items: [item(1), item(2)] }),
    detail: async item => {
      if (item.number === 2) throw new AppError('ACCESS_DENIED', '권한 확인 필요');
      return pr();
    },
  }), clock, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  const result = manager.read({ collectionId });
  assert.equal(result.complete, false);
  assert.equal(result.summary?.total.commits, 37);
  assert.equal(result.progress.failed, 1);
  assert.equal(result.issues[0]?.url, item(2).html_url);
  await manager.close();
});

test('repo가 orgs보다 우선하고 계정·조직 이름과 cursor를 검증한다', async () => {
  const queries: string[] = [];
  const manager = new CollectionManager(source({
    search: async query => {
      queries.push(query);
      return { total_count: 0, incomplete_results: false, items: [] };
    },
  }), clock, timezone);
  assert.throws(() => manager.start({ year: '2025', accounts: [''] }));
  assert.throws(() => manager.start({ year: '2025', orgs: ['acme is:issue'] }));
  const { collectionId } = manager.start({ year: '2025', repo: 'acme/app', orgs: ['ignored'] });
  await manager.finished(collectionId);
  assert.match(queries[0]!, /repo:acme\/app/);
  assert.doesNotMatch(queries[0]!, /org:/);
  assert.throws(() => manager.read({ collectionId, cursor: 'bad' }));
  await manager.close();
});

test('동시에 두 수집이 있어도 상세 조회 동시 실행은 4개 이하이다', async () => {
  let active = 0;
  let max = 0;
  const manager = new CollectionManager(source({
    search: async () => ({ total_count: 8, incomplete_results: false, items: Array.from({ length: 8 }, (_, i) => item(i + 1)) }),
    detail: async item => {
      active++;
      max = Math.max(max, active);
      await delay(5);
      active--;
      return pr(item.number);
    },
  }), clock, timezone);
  const a = manager.start({ year: '2025' });
  const b = manager.start({ year: '2025' });
  assert.throws(() => manager.start({ year: '2025' }), /동시/);
  await Promise.all([manager.finished(a.collectionId), manager.finished(b.collectionId)]);
  assert.equal(max, 4);
  await manager.close();
});

test('진행 중 취소는 자식 조회에 전달되고 완전한 결과로 표시하지 않는다', async () => {
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const manager = new CollectionManager(source({
    detail: async (_item, _credential, signal) => {
      began();
      await delay(10_000, undefined, { signal });
      return pr();
    },
  }), clock, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await started;
  manager.cancel(collectionId);
  await manager.finished(collectionId);
  assert.equal(manager.read({ collectionId }).status, 'cancelled');
  assert.equal(manager.read({ collectionId }).complete, false);
  await manager.close();
});

test('미래 연도는 인증·API 없이 0개 보고서로 완료한다', async () => {
  let called = false;
  const manager = new CollectionManager(source({ credentials: async () => { called = true; throw new Error(); } }), clock, timezone);
  const { collectionId } = manager.start({ year: '2027' });
  await manager.finished(collectionId);
  assert.equal(called, false);
  assert.deepEqual(manager.read({ collectionId }).period.reports, []);
  await manager.close();
});

test('정확히 현지 월초 자정의 빈 구간은 역전된 검색 없이 0건 월을 표시한다', async () => {
  let called = false;
  const manager = new CollectionManager(source({
    credentials: async () => { called = true; throw new Error(); },
  }), () => Date.parse('2025-01-31T15:00:00Z'), timezone);
  const { collectionId } = manager.start({ month: '2025-02' });
  await manager.finished(collectionId);
  const result = manager.read({ collectionId });
  assert.equal(called, false);
  assert.equal(result.status, 'completed');
  assert.equal(result.summary?.months[0]?.month, '2025-02');
  assert.equal(result.summary?.months[0]?.prs, 0);
  await manager.close();
});

test('완료된 메모리 결과는 1시간 미사용 후 만료되고 서버 종료 시 제거된다', async () => {
  let now = clock();
  const manager = new CollectionManager(source(), () => now, timezone);
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  now += 3_600_001;
  assert.throws(() => manager.read({ collectionId }), /만료/);
  await manager.close();
  assert.throws(() => manager.start({ year: '2025' }), /종료/);
});
