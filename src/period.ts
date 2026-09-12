import { DateTime } from 'luxon';
import { AppError } from './errors.js';
import type { CollectInput, Period, ReportPeriod } from './types.js';

export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function date(value: string, end: boolean, zone: string): DateTime {
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) {
    throw new AppError('INVALID_DATE', '날짜 형식은 YYYY, YYYY-MM 또는 YYYY-MM-DD입니다.');
  }
  const parts = value.split('-').map(Number);
  const parsed = DateTime.fromObject(
    { year: parts[0], month: parts[1] ?? 1, day: parts[2] ?? 1 },
    { zone },
  );
  if (!parsed.isValid || parsed.year < 1) {
    throw new AppError('INVALID_DATE', '존재하지 않는 날짜입니다: ' + value);
  }
  if (!end || parts.length === 3) return parsed.startOf('day');
  return parsed.endOf(parts.length === 1 ? 'year' : 'month').startOf('day');
}

function report(kind: ReportPeriod['kind'], start: DateTime, end: DateTime): ReportPeriod {
  const since = start.toISODate()!;
  const until = end.toISODate()!;
  return {
    kind, since, until,
    relativePath: 'PerformanceSummary/' + start.year + '/' +
      (kind === 'year' ? 'year_' : '') + since + '_' + until + '.md',
  };
}

export function normalizePeriod(
  input: CollectInput,
  nowMs = Date.now(),
  timezone = systemTimezone(),
): Period {
  const now = DateTime.fromMillis(nowMs, { zone: timezone });
  if (!now.isValid) throw new AppError('INVALID_TIMEZONE', 'PC의 시간대를 확인할 수 없습니다.');
  const today = now.startOf('day');
  const modes = [input.year, input.month, input.since].filter(v => v !== undefined);
  if (modes.length !== 1 || (input.until !== undefined && input.since === undefined)) {
    throw new AppError('INVALID_PERIOD', 'year, month, since 중 하나만 지정하고 until은 since와 함께 사용하세요.');
  }
  let mode: Period['mode'];
  let start: DateTime;
  let end: DateTime;
  if (input.year !== undefined) {
    if (!/^\d{4}$/.test(input.year)) throw new AppError('INVALID_DATE', 'year는 YYYY 형식입니다.');
    mode = 'year';
    start = date(input.year, false, timezone);
    end = date(input.year, true, timezone);
    if (start.year === today.year) end = today;
  } else if (input.month !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(input.month)) throw new AppError('INVALID_DATE', 'month는 YYYY-MM 형식입니다.');
    mode = 'month';
    start = date(input.month, false, timezone);
    end = date(input.month, true, timezone);
    if (start > today) throw new AppError('FUTURE_MONTH', '미래 달은 집계할 수 없습니다.');
    if (end > today) end = today;
  } else {
    mode = 'range';
    start = date(input.since!, false, timezone);
    end = input.until === undefined ? today : date(input.until, true, timezone);
  }
  if (start > end) throw new AppError('INVALID_PERIOD', '시작일은 종료일보다 늦을 수 없습니다.');
  const empty = start.toMillis() > nowMs;
  const reports: ReportPeriod[] = [];
  if (mode === 'year') {
    if (!empty) {
      for (let month = start; month <= end; month = month.plus({ months: 1 })) {
        reports.push(report('month', month, DateTime.min(month.endOf('month'), end)));
      }
      reports.push(report('year', start, end));
    }
  } else {
    reports.push(report(mode, start, end));
  }
  return {
    mode, since: start.toISODate()!, until: end.toISODate()!,
    timezone, capturedAt: now.toUTC().toISO()!,
    startMs: start.toMillis(),
    endMs: Math.min(end.plus({ days: 1 }).startOf('day').toMillis(), nowMs),
    empty, reports,
  };
}

export function activityMonth(createdAt: string, period: Period): string {
  const value = DateTime.fromISO(createdAt, { zone: 'utc' }).setZone(period.timezone);
  if (!value.isValid) throw new AppError('INVALID_RESPONSE', 'GitHub에서 잘못된 PR 날짜를 반환했습니다.');
  return value.toFormat('yyyy-MM');
}

export function includesCreatedAt(createdAt: string, period: Period): boolean {
  const time = DateTime.fromISO(createdAt, { zone: 'utc' }).toMillis();
  if (!Number.isFinite(time)) throw new AppError('INVALID_RESPONSE', 'GitHub에서 잘못된 PR 날짜를 반환했습니다.');
  return time >= period.startMs && time < period.endMs;
}
