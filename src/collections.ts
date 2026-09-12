import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { aggregate, sortPullRequests } from './aggregate.js';
import { AppError, publicError } from './errors.js';
import { accountName, repoName, repositoryOf, type Credential, type SearchItem } from './github/client.js';
import { activityMonth, includesCreatedAt, normalizePeriod, systemTimezone } from './period.js';
import type { CollectInput, Issue, Period, Progress, PullRequest } from './types.js';

export interface ActivitySource {
  credentials(requested: string[] | undefined, signal: AbortSignal): Promise<Credential[]>;
  search(query: string, page: number, credential: Credential, signal: AbortSignal): Promise<{
    total_count: number; incomplete_results: boolean; items: SearchItem[];
  }>;
  detail(item: SearchItem, credential: Credential, signal: AbortSignal): Promise<PullRequest>;
}

type Status = 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
interface Collection {
  id: string;
  input: CollectInput;
  period: Period;
  accounts: string[];
  status: Status;
  progress: Progress;
  prs: PullRequest[];
  issues: Issue[];
  issueCount: number;
  controller: AbortController;
  completion: Promise<void>;
  touchedAt: number;
  searchRequests: number;
}

export interface ReadActivityInput {
  collectionId: string;
  cursor?: string;
  month?: string;
  repo?: string;
  pageSize?: number;
}

function normalizeNames(values: string[] | undefined, label: string): string[] | undefined {
  if (values === undefined) return undefined;
  if (!values.length) throw new AppError('INVALID_FILTER', label + ' 목록은 비어 있을 수 없습니다.');
  const result = new Map<string, string>();
  for (const value of values) {
    const parsed = accountName.safeParse(value);
    if (!parsed.success) throw new AppError('INVALID_FILTER', label + ' 이름이 올바르지 않습니다.');
    result.set(parsed.data.toLowerCase(), parsed.data);
  }
  return [...result.values()];
}

function normalizeInput(input: CollectInput): CollectInput {
  const accounts = normalizeNames(input.accounts, '계정');
  const orgs = normalizeNames(input.orgs, '조직');
  const repo = input.repo === undefined ? undefined : repoName.safeParse(input.repo);
  if (repo && !repo.success) throw new AppError('INVALID_FILTER', '레포는 owner/repo 형식이어야 합니다.');
  return { ...input, accounts, orgs, repo: repo?.success ? repo.data : undefined };
}

function isoSecond(ms: number): string {
  return DateTime.fromMillis(ms, { zone: 'utc' }).toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function queryFor(credential: Credential, scope: string, start: number, end: number): string {
  return ['is:pr', 'author:' + credential.login, scope,
    'created:' + isoSecond(start) + '..' + isoSecond(end - 1000)].filter(Boolean).join(' ');
}

export class CollectionManager {
  private readonly jobs = new Map<string, Collection>();
  private closed = false;
  private activeDetails = 0;
  private readonly detailQueue: (() => void)[] = [];

  constructor(
    private readonly source: ActivitySource,
    private readonly clock: () => number = Date.now,
    private readonly timezone: () => string = systemTimezone,
  ) {}

  start(rawInput: CollectInput) {
    if (this.closed) throw new AppError('SERVER_CLOSED', 'MCP 서버가 종료되었습니다.');
    this.prune();
    if ([...this.jobs.values()].filter(job => job.status === 'running').length >= 2) {
      throw new AppError('BUSY', '동시 수집은 2개까지 가능합니다. 기존 수집을 완료하거나 취소하세요.');
    }
    if (this.jobs.size >= 20) throw new AppError('COLLECTION_LIMIT', '보관 가능한 수집 결과를 초과했습니다. 새 MCP 세션에서 다시 실행하세요.');
    const input = normalizeInput(rawInput);
    const period = normalizePeriod(input, this.clock(), this.timezone());
    const id = randomUUID();
    const job: Collection = {
      id, input, period, accounts: [], status: 'running',
      progress: { phase: 'authentication', discovered: 0, processed: 0, succeeded: 0, failed: 0 },
      prs: [], issues: [], issueCount: 0, controller: new AbortController(),
      completion: Promise.resolve(), touchedAt: this.clock(), searchRequests: 0,
    };
    this.jobs.set(id, job);
    job.completion = Promise.resolve().then(() => this.run(job));
    return {
      collectionId: id, status: job.status, period,
      nextPollAfterMs: 2000,
      notes: input.repo && input.orgs ? ['repo 조건을 우선 적용하여 orgs는 무시합니다.'] : [],
    };
  }

  private issue(job: Collection, error: unknown, context: Pick<Issue, 'account' | 'url'> = {}) {
    job.issueCount++;
    if (job.issues.length < 100) job.issues.push({ ...publicError(error), ...context });
  }

  private async run(job: Collection): Promise<void> {
    const signal = job.controller.signal;
    const candidates = new Map<string, { item: SearchItem; credential: Credential }>();
    try {
      if (job.period.empty || job.period.endMs <= job.period.startMs) {
        job.status = 'completed';
        return;
      }
      const credentials = await this.source.credentials(job.input.accounts, signal);
      job.accounts = credentials.map(c => c.login);
      job.progress.phase = 'search';
      const scopes = job.input.repo ? ['repo:' + job.input.repo] :
        job.input.orgs?.map(org => 'org:' + org) ?? [''];
      // GitHub timestamps are second-resolution. Widen the query, then apply the exact interval locally.
      const start = Math.floor(job.period.startMs / 1000) * 1000;
      const end = Math.ceil(job.period.endMs / 1000) * 1000;
      for (const credential of credentials) {
        for (const scope of scopes) {
          signal.throwIfAborted();
          try {
            await this.searchWindow(job, credential, scope, start, end, item => {
              repositoryOf(item);
              if (!includesCreatedAt(item.created_at, job.period)) return;
              if (!candidates.has(item.html_url)) candidates.set(item.html_url, { item, credential });
              job.progress.discovered = candidates.size;
            });
          } catch (error) {
            if (signal.aborted) throw error;
            this.issue(job, error, { account: credential.login });
          }
        }
      }
      job.progress.phase = 'details';
      const queue = [...candidates.values()];
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (!signal.aborted) {
          const candidate = queue[index++];
          if (!candidate) return;
          await this.acquireDetail();
          try {
            signal.throwIfAborted();
            const pr = await this.source.detail(candidate.item, candidate.credential, signal);
            if (!includesCreatedAt(pr.createdAt, job.period)) {
              throw new AppError('INVALID_RESPONSE', '검색된 PR의 생성일이 요청 기간 밖에 있습니다.');
            }
            job.prs.push(pr);
            job.progress.succeeded++;
          } catch (error) {
            if (!signal.aborted) {
              job.progress.failed++;
              this.issue(job, error, { account: candidate.credential.login, url: candidate.item.html_url });
            }
          } finally {
            this.releaseDetail();
            job.progress.processed++;
          }
        }
      }));
      signal.throwIfAborted();
      job.prs = sortPullRequests(job.prs, job.period);
      job.status = job.issueCount ? (job.prs.length ? 'partial' : 'failed') : 'completed';
    } catch (error) {
      if (signal.aborted) job.status = 'cancelled';
      else {
        this.issue(job, error);
        job.status = job.prs.length ? 'partial' : 'failed';
      }
    } finally {
      // Release references to all per-account credentials when collection finishes.
      candidates.clear();
      job.progress.phase = 'done';
      job.touchedAt = this.clock();
    }
  }

  private async searchWindow(
    job: Collection, credential: Credential, scope: string, start: number, end: number,
    accept: (item: SearchItem) => void,
  ): Promise<void> {
    const signal = job.controller.signal;
    const query = queryFor(credential, scope, start, end);
    const search = async (page: number) => {
      if (++job.searchRequests > 1000) {
        throw new AppError('SEARCH_BUDGET_EXCEEDED', '검색 요청 1,000회 한도에 도달했습니다. 기간 또는 레포 조건을 좁혀 다시 수집하세요.');
      }
      return this.source.search(query, page, credential, signal);
    };
    const first = await search(1);
    if (first.total_count > 1000 || first.incomplete_results) {
      if (end - start <= 1000) {
        throw new AppError('SEARCH_INCOMPLETE', '1초 구간도 검색 한도 또는 불완전 응답을 해결하지 못했습니다. 레포 조건을 좁혀 다시 수집하세요.');
      }
      const middle = start + Math.floor((end - start) / 2000) * 1000;
      // A failed half must not hide successful results in the other half.
      for (const [a, b] of [[start, middle], [middle, end]] as const) {
        try { await this.searchWindow(job, credential, scope, a, b, accept); }
        catch (error) {
          if (signal.aborted) throw error;
          this.issue(job, error, { account: credential.login });
        }
      }
      return;
    }
    const seen = new Set<string>();
    const total = first.total_count;
    for (let page = 1; page <= Math.max(1, Math.ceil(total / 100)); page++) {
      signal.throwIfAborted();
      const response = page === 1 ? first : await search(page);
      if (response.incomplete_results || response.total_count !== total) {
        throw new AppError('SEARCH_INCOMPLETE', '검색 중 결과가 변경되었거나 불완전해졌습니다. 다시 수집하세요.');
      }
      response.items.forEach(accept);
      response.items.forEach(item => seen.add(item.html_url));
    }
    if (seen.size !== total) throw new AppError('SEARCH_INCOMPLETE', 'GitHub 검색 결과 개수와 수집 개수가 일치하지 않습니다.');
  }

  private async acquireDetail(): Promise<void> {
    if (this.activeDetails < 4) { this.activeDetails++; return; }
    await new Promise<void>(resolve => this.detailQueue.push(resolve));
  }

  private releaseDetail() {
    const next = this.detailQueue.shift();
    if (next) next();
    else this.activeDetails--;
  }

  read(input: ReadActivityInput) {
    const job = this.job(input.collectionId);
    if (input.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
      throw new AppError('INVALID_FILTER', 'month 필터는 YYYY-MM 형식입니다.');
    }
    const pageSize = input.pageSize ?? 10;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) {
      throw new AppError('INVALID_PAGE_SIZE', 'pageSize는 1~25입니다.');
    }
    const base = {
      collectionId: job.id, status: job.status, complete: job.status === 'completed',
      period: job.period, accounts: [...job.accounts], progress: { ...job.progress },
      nextPollAfterMs: job.status === 'running' ? 2000 : null,
      issues: [...job.issues], issueCount: job.issueCount,
      issuesTruncated: job.issueCount > job.issues.length,
    };
    if (job.status === 'running') {
      if (input.cursor) throw new AppError('INVALID_CURSOR', '완료된 수집 결과에서만 cursor를 사용하세요.');
      return { ...base, prs: [], nextCursor: null, summary: null, matchingCount: null, reportWarning: null };
    }
    const signature = JSON.stringify([job.id, input.month ?? null, input.repo?.toLowerCase() ?? null]);
    let offset = 0;
    if (input.cursor) {
      try {
        const value = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
        if (value.signature !== signature || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error();
        offset = value.offset;
      } catch { throw new AppError('INVALID_CURSOR', 'cursor가 유효하지 않거나 다른 수집·필터의 cursor입니다.'); }
    }
    const matching = job.prs.filter(pr =>
      (!input.month || activityMonth(pr.createdAt, job.period) === input.month) &&
      (!input.repo || pr.repository.toLowerCase() === input.repo.toLowerCase()));
    if (offset > matching.length) throw new AppError('INVALID_CURSOR', 'cursor가 결과 범위를 벗어났습니다.');
    const prs: PullRequest[] = [];
    let bytes = 0;
    for (const pr of matching.slice(offset, offset + pageSize)) {
      const size = Buffer.byteLength(JSON.stringify(pr));
      if (prs.length && bytes + size > 32_768) break;
      prs.push(pr);
      bytes += size;
    }
    const nextOffset = offset + prs.length;
    return {
      ...base, summary: aggregate(matching, job.period), matchingCount: matching.length, prs,
      nextCursor: nextOffset < matching.length ?
        Buffer.from(JSON.stringify({ signature, offset: nextOffset })).toString('base64url') : null,
      reportWarning: job.status !== 'completed' ?
        '수집이 완료되지 않았습니다. 아래 통계는 성공한 PR만 포함하며 완전한 성과 보고서로 제시하면 안 됩니다.' : null,
    };
  }

  cancel(id: string) {
    const job = this.job(id);
    if (job.status === 'running') job.controller.abort();
    return { collectionId: id, status: job.status, cancellationRequested: job.controller.signal.aborted };
  }

  async finished(id: string): Promise<void> { await this.job(id).completion; }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.all([...this.jobs.values()].map(job => job.completion));
    this.jobs.clear();
  }

  private job(id: string): Collection {
    this.prune();
    const job = this.jobs.get(id);
    if (!job) throw new AppError('COLLECTION_NOT_FOUND', '수집 결과가 없거나 만료되었습니다. collect_activity로 다시 수집하세요.');
    job.touchedAt = this.clock();
    return job;
  }

  private prune() {
    for (const [id, job] of this.jobs) {
      if (job.status !== 'running' && this.clock() - job.touchedAt > 3_600_000) this.jobs.delete(id);
    }
  }
}
