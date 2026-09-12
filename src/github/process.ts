import { execFile } from 'node:child_process';
import { AppError } from '../errors.js';

export interface RunOptions {
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  input?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type Runner = (args: string[], options: RunOptions) => Promise<RunResult>;

export const runGh: Runner = (args, options) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) {
    reject(new AppError('CANCELLED', '수집이 취소되었습니다.'));
    return;
  }
  const child = execFile('gh', args, {
    env: options.env,
    signal: options.signal,
    timeout: 45_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
  }, (error, stdout, stderr) => {
    if (options.signal?.aborted) {
      reject(new AppError('CANCELLED', '수집이 취소되었습니다.'));
    } else if (error && 'code' in error && error.code === 'ENOENT') {
      reject(new AppError('GH_NOT_FOUND', 'gh를 찾을 수 없습니다. GitHub CLI 설치와 PATH를 확인하세요.'));
    } else if (error?.killed || (error && 'code' in error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')) {
      reject(new AppError('GH_TIMEOUT', 'GitHub CLI 실행 시간 또는 응답 크기 제한을 초과했습니다.', true));
    } else {
      resolve({ stdout, stderr, exitCode: error ? 1 : 0 });
    }
  });
  // EPIPE is handled by the process completion callback; never write gh output to our stdout.
  child.stdin?.on('error', () => {});
  child.stdin?.end(options.input);
});

export function ghEnvironment(parent: NodeJS.ProcessEnv, token?: string): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) {
    if ([
      'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN',
      'GH_HOST', 'GH_DEBUG', 'DEBUG', 'GH_PAGER', 'PAGER', 'GH_FORCE_TTY',
    ].includes(key.toUpperCase())) delete env[key];
  }
  env.GH_HOST = 'github.com';
  env.GH_PROMPT_DISABLED = '1';
  env.GH_PAGER = 'cat';
  env.NO_COLOR = '1';
  if (token) env.GH_TOKEN = token;
  return env;
}
