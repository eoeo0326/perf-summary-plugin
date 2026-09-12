import type { PullRequest } from '../src/types.js';
import type { RunOptions, Runner, RunResult } from '../src/github/process.js';
import type { SearchItem } from '../src/github/client.js';

export function pr(number = 1, changes: Partial<PullRequest> = {}): PullRequest {
  return {
    number, url: 'https://github.com/acme/app/pull/' + number, repository: 'acme/app',
    author: 'alice', title: 'feat: 인증 기능 구현', createdAt: '2025-01-15T01:00:00Z',
    mergedAt: '2025-02-01T01:00:00Z', closedAt: '2025-02-01T01:00:00Z', state: 'merged',
    additions: 100, deletions: 20, changedFiles: 12, commits: 37, isRelease: false,
    body: '인증 흐름을 구현했습니다.', commitHeadlines: ['feat: auth'], files: ['src/auth.ts'],
    evidenceNotes: [], ...changes,
  };
}

export function item(number = 1, changes: Partial<SearchItem> = {}): SearchItem {
  return {
    number, html_url: 'https://github.com/acme/app/pull/' + number,
    repository_url: 'https://api.github.com/repos/acme/app',
    created_at: '2025-01-15T01:00:00Z', ...changes,
  };
}

export function json(data: unknown): RunResult {
  return { stdout: JSON.stringify(data), stderr: '', exitCode: 0 };
}

export function fixtureRunner(
  intercept?: (args: string[], options: RunOptions) => RunResult | undefined | Promise<RunResult | undefined>,
): { runner: Runner; calls: { args: string[]; options: RunOptions }[] } {
  const calls: { args: string[]; options: RunOptions }[] = [];
  const runner: Runner = async (args, options) => {
    calls.push({ args, options });
    const custom = await intercept?.(args, options);
    if (custom) return custom;
    if (args[0] === '--version') return { stdout: 'gh version 2.80.0 (2025-09-23)\n', stderr: '', exitCode: 0 };
    if (args[0] === 'auth' && args[1] === 'status') return json({ hosts: {
      'github.com': [
        { login: 'alice', active: true, state: 'success', token: 'never-return-this' },
        { login: 'bob', active: false, state: 'success' },
      ],
      'enterprise.example': [{ login: 'enterprise-user', active: true, state: 'success' }],
    } });
    if (args[0] === 'auth' && args[1] === 'token') {
      return { stdout: 'secret-for-' + args.at(-1) + '\n', stderr: '', exitCode: 0 };
    }
    if (args.includes('search/issues')) {
      const n = options.env.GH_TOKEN === 'secret-for-bob' ? 2 : 1;
      return json({ total_count: 1, incomplete_results: false, items: [item(n)] });
    }
    if (args.includes('graphql')) {
      const input = JSON.parse(options.input!);
      if (input.query.includes('headRefName')) {
        const data = pr(input.variables.number);
        return json({ data: { repository: { pullRequest: {
          ...data, author: { login: options.env.GH_TOKEN === 'secret-for-bob' ? 'bob' : 'alice' },
          state: 'MERGED', isDraft: false, headRefName: 'feat/auth', commits: { totalCount: 37 },
        } } } });
      }
      return json({ data: { repository: { pullRequest: {
        body: '인증 구현\n\n> [!NOTE]\n> template\n\n## 수동 테스트 체크리스트\n- [ ] test',
        commits: { totalCount: 37, nodes: [{ commit: { messageHeadline: 'feat: auth' } }] },
        files: { totalCount: 12, nodes: [{ path: 'src/auth.ts' }] },
      } } } });
    }
    throw new Error('Unexpected gh command');
  };
  return { runner, calls };
}
