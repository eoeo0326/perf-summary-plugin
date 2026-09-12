import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePeriod, activityMonth, includesCreatedAt } from '../src/period.js';
import { aggregate } from '../src/aggregate.js';
import { pr } from './fixtures.js';

const now = Date.parse('2026-05-19T15:30:00Z');
const zone = 'Asia/Seoul';

test('부분 날짜, 윤년, 상호 배타 및 실제 날짜를 검증한다', () => {
  const range = normalizePeriod({ since: '2024', until: '2024-02' }, now, zone);
  assert.equal(range.since, '2024-01-01');
  assert.equal(range.until, '2024-02-29');
  for (const input of [
    {}, { until: '2025' }, { year: '2025', month: '2025-01' },
    { year: '2025', until: '2025' }, { month: '2025-13' },
    { since: '2025-02-29' }, { since: '2024-02-30' }, { since: '0000' },
    { since: '2025-12', until: '2025-01' },
  ]) assert.throws(() => normalizePeriod(input, now, zone));
});

test('현재 월은 현지 오늘까지, 미래 월은 오류다', () => {
  const p = normalizePeriod({ month: '2026-05' }, now, zone);
  assert.equal(p.until, '2026-05-20');
  assert.equal(p.endMs, now);
  assert.equal(p.reports[0]?.relativePath, 'PerformanceSummary/2026/2026-05-01_2026-05-20.md');
  assert.throws(() => normalizePeriod({ month: '2026-06' }, now, zone), /미래/);
});

test('연간 과거 13개·현재 6개·미래 0개 출력 계획과 단일 기간 모드를 구분한다', () => {
  assert.equal(normalizePeriod({ year: '2025' }, now, zone).reports.length, 13);
  const current = normalizePeriod({ year: '2026' }, now, zone);
  assert.equal(current.reports.length, 6);
  assert.equal(current.reports.at(-1)?.relativePath, 'PerformanceSummary/2026/year_2026-01-01_2026-05-20.md');
  assert.deepEqual(normalizePeriod({ year: '2027' }, now, zone).reports, []);
  assert.equal(normalizePeriod({ since: '2025', until: '2025' }, now, zone).reports.length, 1);
});

test('한국 시간 경계를 반영하고 병합일과 상관없이 생성 월에 포함한다', () => {
  const p = normalizePeriod({ month: '2025-02' }, now, zone);
  assert.equal(includesCreatedAt('2025-01-31T14:59:59Z', p), false);
  assert.equal(includesCreatedAt('2025-01-31T15:00:00Z', p), true);
  assert.equal(includesCreatedAt('2025-02-28T15:00:00Z', p), false);
  const year = normalizePeriod({ year: '2025' }, now, zone);
  const values = [
    pr(1, { createdAt: '2025-01-31T14:59:59Z', mergedAt: '2025-03-01T00:00:00Z' }),
    pr(2, { createdAt: '2025-01-31T15:00:00Z', state: 'draft' }),
  ];
  const result = aggregate(values, year);
  assert.equal(activityMonth(values[0]!.createdAt, year), '2025-01');
  assert.equal(result.months[0]?.prs, 1);
  assert.equal(result.months[1]?.prs, 1);
  for (const field of ['prs', 'merged', 'draft', 'commits', 'changedFiles', 'additions', 'deletions'] as const) {
    assert.equal(result.months.reduce((sum, month) => sum + month[field], 0), result.total[field]);
  }
});

test('DST의 23시간·25시간 날짜 경계를 처리한다', () => {
  const spring = normalizePeriod({ since: '2025-03-09', until: '2025-03-09' }, now, 'America/New_York');
  const autumn = normalizePeriod({ since: '2025-11-02', until: '2025-11-02' }, now, 'America/New_York');
  assert.equal((spring.endMs - spring.startMs) / 3_600_000, 23);
  assert.equal((autumn.endMs - autumn.startMs) / 3_600_000, 25);
});
