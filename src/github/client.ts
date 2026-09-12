import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod/v4';
import { AppError, publicError } from '../errors.js';
import { systemTimezone } from '../period.js';
import type { Account, Environment, PullRequest } from '../types.js';
import { trimBody } from './evidence.js';
import { ghEnvironment, runGh, type Runner } from './process.js';

const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const accountName = z.string().trim().regex(loginPattern);
export const repoName = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]+$/);

const authSchema = z.object({
  hosts: z.record(z.string(), z.array(z.object({
    login: z.string(),
    active: z.boolean().optional(),
    state: z.string(),
  }))),
});
const searchItemSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  repository_url: z.string(),
  created_at: z.string(),
});
const searchSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(searchItemSchema),
});
export type SearchItem = z.infer<typeof searchItemSchema>;
export interface Credential { login: string; token: string }

const count = z.number().int().nonnegative();
const metadataSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        number: z.number().int().positive(), title: z.string(), url: z.string(),
        author: z.object({ login: z.string() }).nullable(),
        createdAt: z.string(), mergedAt: z.string().nullable(), closedAt: z.string().nullable(),
        state: z.enum(['OPEN', 'CLOSED', 'MERGED']), isDraft: z.boolean(),
        additions: count, deletions: count, changedFiles: count, headRefName: z.string(),
        commits: z.object({ totalCount: count }),
      }),
    }),
  }),
});
const evidenceSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        body: z.string(),
        commits: z.object({
          totalCount: count,
          nodes: z.array(z.object({ commit: z.object({ messageHeadline: z.string() }) })),
        }),
        files: z.object({ totalCount: count, nodes: z.array(z.object({ path: z.string() })) }),
      }),
    }),
  }),
});

const metadataQuery = [
  'query($owner:String!,$repo:String!,$number:Int!){',
  'repository(owner:$owner,name:$repo){pullRequest(number:$number){',
  'number title url author{login} createdAt mergedAt closedAt state isDraft',
  'additions deletions changedFiles headRefName commits{totalCount}',
  '}}}',
].join(' ');
const evidenceQuery = [
  'query($owner:String!,$repo:String!,$number:Int!){',
  'repository(owner:$owner,name:$repo){pullRequest(number:$number){',
  'body commits(first:20){totalCount nodes{commit{messageHeadline}}}',
  'files(first:10){totalCount nodes{path}}',
  '}}}',
].join(' ');

function parseJson(value: string): unknown {
  try { return JSON.parse(value); }
  catch { throw new AppError('INVALID_RESPONSE', 'GitHub CLI가 올바른 JSON을 반환하지 않았습니다.'); }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('INVALID_RESPONSE', 'GitHub 응답의 필수 정보가 누락되었거나 잘못되었습니다.');
  return result.data;
}

export function repositoryOf(item: SearchItem): string {
  const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(item.repository_url);
  if (!match || !repoName.safeParse(match[1]).success ||
      item.html_url !== 'https://github.com/' + match[1] + '/pull/' + item.number) {
    throw new AppError('INVALID_RESPONSE', 'GitHub PR 주소를 검증하지 못했습니다.');
  }
  return match[1]!;
}

function httpBody(output: string): { body: string; headers: string } {
  if (!output.startsWith('HTTP/')) return { body: output, headers: '' };
  const separator = /\r?\n\r?\n/.exec(output);
  if (!separator) throw new AppError('INVALID_RESPONSE', 'GitHub HTTP 응답을 읽지 못했습니다.');
  return {
    headers: output.slice(0, separator.index),
    body: output.slice(separator.index + separator[0].length),
  };
}

export class GithubClient {
  constructor(
    private readonly runner: Runner = runGh,
    private readonly parentEnv: NodeJS.ProcessEnv = process.env,
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void> =
      async (ms, signal) => { await delay(ms, undefined, { signal }); },
  ) {}

  async inspect(signal?: AbortSignal): Promise<Environment> {
    const environment: Environment = {
      ready: false, nodeVersion: process.version, ghVersion: null,
      timezone: systemTimezone(), accounts: [], errors: [],
    };
    try {
      const version = await this.runner(['--version'], { env: ghEnvironment(this.parentEnv), signal });
      const match = /gh version ([\d.]+)/.exec(version.stdout);
      if (version.exitCode || !match) throw new AppError('GH_UNAVAILABLE', 'gh 버전을 확인하지 못했습니다.');
      environment.ghVersion = match[1]!;
      environment.accounts = await this.accounts(signal);
      for (const account of environment.accounts) {
        if (!account.authenticated) environment.errors.push({
          code: 'AUTH_INVALID', account: account.login,
          message: 'gh 인증이 유효하지 않습니다. gh auth login으로 다시 로그인하세요.',
        });
      }
      if (!environment.accounts.length) environment.errors.push({
        code: 'AUTH_REQUIRED', message: 'github.com 계정이 없습니다. gh auth login으로 로그인하세요.',
      });
      environment.ready = environment.accounts.some(a => a.authenticated);
    } catch (error) { environment.errors.push(publicError(error)); }
    return environment;
  }

  async accounts(signal?: AbortSignal): Promise<Account[]> {
    const result = await this.runner(['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], {
      env: ghEnvironment(this.parentEnv), signal,
    });
    if (result.exitCode) {
      if (/unknown flag.*json/i.test(result.stderr)) {
        throw new AppError('GH_UPGRADE_REQUIRED', 'gh auth status --json을 지원하는 최신 GitHub CLI로 업데이트하세요.');
      }
      throw new AppError('AUTH_REQUIRED', 'gh 인증을 확인하지 못했습니다. gh auth login으로 로그인하세요.');
    }
    const hosts = parse(authSchema, parseJson(result.stdout)).hosts;
    return (hosts['github.com'] ?? []).map(account => {
      if (!loginPattern.test(account.login)) throw new AppError('INVALID_RESPONSE', '올바르지 않은 GitHub 계정 이름입니다.');
      return { login: account.login, active: account.active ?? false, authenticated: account.state === 'success' };
    });
  }

  async credentials(requested: string[] | undefined, signal: AbortSignal): Promise<Credential[]> {
    const accounts = await this.accounts(signal);
    const names = requested ?? accounts.map(a => a.login);
    if (!names.length) throw new AppError('AUTH_REQUIRED', '집계할 github.com 인증 계정이 없습니다.');
    const credentials: Credential[] = [];
    for (const name of names) {
      signal.throwIfAborted();
      const account = accounts.find(a => a.login.toLowerCase() === name.toLowerCase());
      if (!account) throw new AppError('ACCOUNT_NOT_FOUND', 'gh에 로그인되지 않은 계정입니다: ' + name);
      if (!account.authenticated) throw new AppError('AUTH_INVALID', 'gh 인증을 갱신하세요: ' + account.login);
      const result = await this.runner(['auth', 'token', '--hostname', 'github.com', '--user', account.login], {
        env: ghEnvironment(this.parentEnv), signal,
      });
      const token = result.stdout.trim();
      if (result.exitCode || !token || /\s/.test(token)) {
        throw new AppError('AUTH_INVALID', '계정 인증 정보를 읽을 수 없습니다: ' + account.login);
      }
      credentials.push({ login: account.login, token });
    }
    return credentials;
  }

  private async api(args: string[], credential: Credential, signal: AbortSignal, input?: string): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      try {
        const result = await this.runner(['api', '--hostname', 'github.com', '--include', ...args], {
          env: ghEnvironment(this.parentEnv, credential.token), signal, input,
        });
        const response = httpBody(result.stdout);
        const code = Number(/^HTTP\/\S+\s+(\d+)/.exec(response.headers)?.[1]);
        if (result.exitCode || code >= 400) {
          const diagnostic = response.headers + '\n' + result.stderr + '\n' + response.body;
          const limited = code === 429 || /rate limit|retry-after|x-ratelimit-remaining:\s*0/i.test(diagnostic);
          if (limited) {
            const retrySeconds = Number(/retry-after:\s*(\d+)/i.exec(diagnostic)?.[1]);
            const reset = Number(/x-ratelimit-reset:\s*(\d+)/i.exec(diagnostic)?.[1]);
            const waitMs = retrySeconds ? retrySeconds * 1000 :
              reset ? Math.max(1000, reset * 1000 - Date.now()) : (attempt + 1) * 5000;
            if (attempt < 2 && waitMs <= 30_000) {
              await this.wait(waitMs, signal);
              continue;
            }
            throw new AppError('RATE_LIMITED', 'GitHub API 제한에 도달했습니다. 제한 해제 후 다시 수집하세요.');
          }
          if (code === 401) throw new AppError('AUTH_INVALID', 'GitHub 인증이 만료되었습니다. gh auth login으로 갱신하세요.');
          if (code === 403 || code === 404 || code === 422) {
            throw new AppError('ACCESS_DENIED', '대상 저장소 접근 권한, 조직 SSO 승인 또는 검색 조건을 확인하세요.');
          }
          throw new AppError('GITHUB_REQUEST_FAILED', 'GitHub 요청에 실패했습니다.', true);
        }
        const json = parseJson(response.body);
        if (json && typeof json === 'object' && 'errors' in json) {
          throw new AppError('GRAPHQL_ERROR', 'GitHub 상세 조회에 실패했습니다. 접근 권한 또는 API 제한을 확인하세요.');
        }
        return json;
      } catch (error) {
        if (signal.aborted) throw new AppError('CANCELLED', '수집이 취소되었습니다.');
        if (!(error instanceof AppError && error.retryable) || attempt === 2) throw error;
        await this.wait(1000 * 2 ** attempt, signal);
      }
    }
    throw new AppError('GITHUB_REQUEST_FAILED', 'GitHub 요청에 실패했습니다.');
  }

  async search(query: string, page: number, credential: Credential, signal: AbortSignal) {
    return parse(searchSchema, await this.api([
      '--method', 'GET', 'search/issues', '-f', 'q=' + query,
      '-f', 'sort=created', '-f', 'order=asc', '-F', 'per_page=100', '-F', 'page=' + page,
    ], credential, signal));
  }

  async detail(item: SearchItem, credential: Credential, signal: AbortSignal): Promise<PullRequest> {
    const repository = repositoryOf(item);
    const [owner, repo] = repository.split('/');
    const variables = { owner, repo, number: item.number };
    const request = (query: string) => this.api(
      ['--method', 'POST', 'graphql', '--input', '-'], credential, signal,
      JSON.stringify({ query, variables }),
    );
    const raw = parse(metadataSchema, await request(metadataQuery)).data.repository.pullRequest;
    if (raw.url !== item.html_url || raw.number !== item.number) {
      throw new AppError('INVALID_RESPONSE', '검색 결과와 상세 PR이 일치하지 않습니다.');
    }
    const isRelease = /^Release\//i.test(raw.title) || /^release\//i.test(raw.headRefName);
    const pr: PullRequest = {
      url: raw.url, number: raw.number, repository, author: raw.author?.login ?? credential.login,
      title: raw.title.slice(0, 512), createdAt: raw.createdAt, mergedAt: raw.mergedAt, closedAt: raw.closedAt,
      state: raw.mergedAt ? 'merged' : raw.state === 'CLOSED' ? 'closed' : raw.isDraft ? 'draft' : 'open',
      additions: raw.additions, deletions: raw.deletions, changedFiles: raw.changedFiles,
      commits: raw.commits.totalCount, isRelease, body: '', commitHeadlines: [], files: [], evidenceNotes: [],
    };
    if (isRelease) {
      pr.evidenceNotes.push('릴리즈 PR: 본문·커밋 메시지·파일 목록을 수집하지 않았습니다.');
      return pr;
    }
    const evidence = parse(evidenceSchema, await request(evidenceQuery)).data.repository.pullRequest;
    const trimmed = trimBody(evidence.body);
    pr.body = trimmed.body;
    pr.evidenceNotes = trimmed.notes;
    pr.commitHeadlines = evidence.commits.nodes.slice(0, 20).map(n => n.commit.messageHeadline.slice(0, 200));
    pr.files = evidence.files.nodes.slice(0, 10).map(n => n.path.slice(0, 300));
    if (evidence.commits.totalCount > pr.commitHeadlines.length) pr.evidenceNotes.push('커밋 메시지는 처음 20개까지 제공됩니다. 통계는 전체 개수입니다.');
    if (evidence.commits.nodes.some(n => n.commit.messageHeadline.length > 200)) pr.evidenceNotes.push('커밋 제목을 200자로 축약했습니다.');
    if (evidence.files.totalCount > pr.files.length) pr.evidenceNotes.push('파일 목록은 처음 10개까지 제공됩니다. 통계는 전체 개수입니다.');
    if (evidence.files.nodes.some(n => n.path.length > 300)) pr.evidenceNotes.push('파일 경로를 300자로 축약했습니다.');
    if (raw.title.length > 512) pr.evidenceNotes.push('PR 제목을 512자로 축약했습니다.');
    return pr;
  }
}
