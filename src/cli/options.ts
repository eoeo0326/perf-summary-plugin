import path from 'node:path';
import { AppError } from '../errors.js';
import { normalizePeriod, systemTimezone } from '../period.js';
import { collectSchema } from '../tools.js';
import type { CollectInput } from '../types.js';

const valueFlags = new Set(['year', 'month', 'since', 'until', 'org', 'repo', 'account', 'output']);
function names(value: string): string[] {
  const items = value.split(',').map(s => s.trim());
  if (items.some(s => !s)) throw new AppError('INVALID_FILTER', '쉼표 목록에 빈 항목이 있습니다.');
  return [...new Map(items.map(s => [s.toLowerCase(), s])).values()];
}

export function reportPath(workspace: string, relativePath: string): string {
  // Reuse the nearest PerformanceSummary ancestor, including its year subfolders.
  for (let directory = path.resolve(workspace); ; directory = path.dirname(directory)) {
    if (path.basename(directory) === 'PerformanceSummary') {
      return path.resolve(path.dirname(directory), relativePath);
    }
    if (path.dirname(directory) === directory) break;
  }
  return path.resolve(workspace, relativePath);
}

export function planReport(
  args: string[], workspace = process.cwd(), now = Date.now(), timezone = systemTimezone(),
) {
  const values = new Map<string, string>();
  let dryRun = false;
  const tokens = [...args];
  if (['year', 'month', 'since'].includes(tokens[0] ?? '')) tokens[0] = '--' + tokens[0];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '--dry-run' && !dryRun) { dryRun = true; continue; }
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(token);
    if (!match || !valueFlags.has(match[1]!) || values.has(match[1]!)) {
      throw new AppError('INVALID_ARGUMENT', '알 수 없거나 중복된 옵션입니다: ' + token);
    }
    const value = match[2] ?? tokens[++i];
    if (!value || value.startsWith('--')) throw new AppError('INVALID_ARGUMENT', '옵션 값이 필요합니다: ' + token);
    values.set(match[1]!, value);
  }
  const raw: Record<string, unknown> = {};
  for (const key of ['year', 'month', 'since', 'until', 'repo']) {
    if (values.has(key)) raw[key] = values.get(key);
  }
  if (values.has('org')) raw.orgs = names(values.get('org')!);
  if (values.has('account')) raw.accounts = names(values.get('account')!);
  const parsed = collectSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_ARGUMENT', '기간·조직·레포·계정 형식을 확인하세요.');
  const input: CollectInput = parsed.data;
  const period = normalizePeriod(input, now, timezone);
  const output = values.get('output');
  const preview = dryRun || output === 'none';
  const notes: string[] = [];
  if (input.repo && input.orgs) notes.push('repo 조건을 우선 적용하여 orgs는 무시합니다.');
  if (period.mode === 'year' && output && output !== 'none') notes.push('연간 모드에서는 --output을 무시합니다.');
  const outputPath = period.mode !== 'year' && output && output !== 'none' ? path.resolve(workspace, output) : undefined;
  if (outputPath && path.extname(outputPath).toLowerCase() !== '.md') {
    throw new AppError('INVALID_PATH', '출력은 .md 확장자여야 합니다.');
  }
  return {
    input, period, workspace: path.resolve(workspace), preview, notes,
    reports: period.reports.map(report => ({
      ...report, absolutePath: outputPath ?? reportPath(workspace, report.relativePath),
    })),
  };
}
