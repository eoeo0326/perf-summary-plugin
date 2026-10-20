import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { planReport } from '../src/cli/options.js';

const now = Date.parse('2026-05-20T03:00:00Z');
const workspace = path.resolve('사용자 작업 폴더');
const plan = (...args: string[]) => planReport(args, workspace, now, 'Asia/Seoul');

test('year 과거 13개·현재 6개·미래 0개와 since-until 단일 출력을 구분한다', () => {
  assert.equal(plan('--year', '2025').reports.length, 13);
  assert.equal(plan('--year', '2026').reports.length, 6);
  assert.equal(plan('--year', '2027').reports.length, 0);
  const range = plan('--since', '2025', '--until', '2025');
  assert.equal(range.period.since, '2025-01-01');
  assert.equal(range.period.until, '2025-12-31');
  assert.equal(range.reports.length, 1);
  assert.equal(range.reports[0]?.kind, 'range');
});

test('month 현재 달·미래 달, since-until 부분 날짜·윤년·종료일 생략을 처리한다', () => {
  assert.equal(plan('--month', '2026-05').period.until, '2026-05-20');
  assert.throws(() => plan('--month', '2026-06'), /미래/);
  const leap = plan('--since', '2024-02', '--until', '2024-02');
  assert.equal(leap.period.since, '2024-02-01');
  assert.equal(leap.period.until, '2024-02-29');
  assert.equal(plan('--since', '2025-03-15').period.until, '2026-05-20');
});

test('기간 상호 배타와 until 종속, 잘못된 날짜·누락·중복·알 수 없는 옵션을 거부한다', () => {
  for (const args of [[], ['--until', '2025'], ['--year', '2025', '--until', '2025'],
    ['--year', '2025', '--month', '2025-03'], ['--since', '2025-02-30'],
    ['--year'], ['--year', '2025', '--year', '2025'], ['--year', '2025', '--other', 'x']]) {
    assert.throws(() => plan(...args), args.join(' '));
  }
});

test('조직·계정 목록을 정규화하고 repo 우선순위를 알리며 빈 항목을 거부한다', () => {
  const result = plan('--year', '2025', '--org', ' acme,other,ACME ', '--account', 'alice, bob,alice', '--repo', 'acme/app');
  assert.deepEqual(result.input.orgs?.map(s => s.toLowerCase()), ['acme', 'other']);
  assert.deepEqual(result.input.accounts, ['alice', 'bob']);
  assert.equal(result.input.repo, 'acme/app');
  assert.equal(result.notes.length, 1);
  assert.deepEqual(plan('--year', '2025').input, { year: '2025' });
  for (const flag of ['--org', '--account']) {
    assert.throws(() => plan('--year', '2025', flag, 'a,,b'));
    assert.throws(() => plan('--year', '2025', flag, '  '));
  }
});

test('단일 출력 경로와 연간 무시 안내를 처리하고 미리보기에는 파일을 쓰지 않는다', () => {
  const result = plan('--month', '2025-03', '--output', './reports/march.md');
  assert.equal(result.reports[0]?.absolutePath, path.join(workspace, 'reports', 'march.md'));
  assert.equal(result.preview, false);
  const year = plan('--year', '2025', '--output', './ignored.txt');
  assert.equal(year.reports.length, 13);
  assert.match(year.notes.join(), /--output/);
  for (const flags of [['--dry-run'], ['--output', 'none'], ['--output', 'none', '--dry-run']]) {
    assert.equal(plan('--year', '2025', ...flags).preview, true);
  }
  assert.throws(() => plan('--month', '2025-03', '--output', 'report.txt'));
});

test('PerformanceSummary 하위 경로를 중복하지 않고 세 positional 별칭·등호 옵션을 지원한다', () => {
  const nested = path.join(workspace, 'PerformanceSummary', '2025');
  const result = planReport(['month', '2025-03'], nested, now, 'Asia/Seoul');
  assert.equal(result.reports[0]?.absolutePath, path.join(workspace, 'PerformanceSummary', '2025', '2025-03-01_2025-03-31.md'));
  assert.deepEqual(plan('year', '2025').input, plan('--year=2025').input);
  assert.deepEqual(plan('since', '2025-03', '--until=2025-06').input, { since: '2025-03', until: '2025-06' });
});
