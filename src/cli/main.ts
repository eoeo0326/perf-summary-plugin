import { fileURLToPath } from 'node:url';
import { CollectionManager } from '../collections.js';
import { AppError, publicError } from '../errors.js';
import { GithubClient } from '../github/client.js';
import { executeTool, isToolName, toolSchemas, validateToolInput, type ToolServices } from '../tools.js';
import { planReport } from './options.js';
import { callRuntime, serveRuntime, stopRuntime, type RuntimeOptions } from './runtime.js';

declare const __PERF_SUMMARY_VERSION__: string;
export const version = typeof __PERF_SUMMARY_VERSION__ === 'string' ? __PERF_SUMMARY_VERSION__ : 'development';
const help = `perf-summary ${version} (Node.js 22+)
  node <skill>/scripts/perf-summary.mjs plan --year YYYY [--org a,b] [--account alice,bob]
  node <skill>/scripts/perf-summary.mjs plan --month YYYY-MM [--repo owner/repo] [--output path.md]
  node <skill>/scripts/perf-summary.mjs plan --since YYYY[-MM[-DD]] [--until YYYY[-MM[-DD]]]
  plan also accepts: --dry-run, --output none; positional aliases: year, month, since.
  node <skill>/scripts/perf-summary.mjs <tool> --input '<JSON>'
  node <skill>/scripts/perf-summary.mjs <tool> --input -  (JSON from stdin)
  tools: ${Object.keys(toolSchemas).join(', ')}
  Input defaults to {}. Tool JSON fields and results match the MCP API.
  write_report: {"absolutePath":"/workspace/report.md","markdown":"# Report","overwrite":false}
  --version | --help | --stop-worker (cancel active collections and clear this runtime)
`;

async function inputJson(args: string[]) {
  if (!args.length) return {};
  if (args.length !== 2 || args[0] !== '--input') throw new AppError('INVALID_ARGUMENT', '도구 입력은 --input JSON 또는 --input - 형식입니다.');
  let source = args[1]!;
  if (source === '-') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 128 * 1024 * 1024) throw new AppError('INVALID_INPUT', 'JSON 입력이 너무 큽니다.');
      chunks.push(buffer);
    }
    source = Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(source); }
  catch { throw new AppError('INVALID_INPUT', '유효한 JSON 입력이 필요합니다.'); }
}

export async function runCli(args = process.argv.slice(2), overrides: Partial<RuntimeOptions> = {}) {
  const options: RuntimeOptions = {
    entry: process.argv[1] ?? fileURLToPath(import.meta.url), version, ...overrides,
  };
  try {
    const [method, ...rest] = args;
    if (!method || method === '--help') { process.stdout.write(help); return; }
    if (method === '--version') { process.stdout.write(version + '\n'); return; }
    if (method === '--worker') { await serveRuntime(options); return; }
    let result: unknown;
    if (method === '--stop-worker') result = await stopRuntime(options);
    else if (method === 'plan') result = planReport(rest);
    else {
      if (!isToolName(method)) throw new AppError('INVALID_ARGUMENT', '알 수 없는 명령입니다. --help를 확인하세요.');
      const input = await inputJson(rest);
      validateToolInput(method, input);
      if (['collect_activity', 'get_activity', 'cancel_collection'].includes(method)) {
        result = await callRuntime(method, input, options);
      } else {
        const github = new GithubClient();
        const services: ToolServices = options.services?.() ?? { github, collections: new CollectionManager(github) };
        try {
          result = await executeTool(method, input, {
            ...services, guidelines: new URL('../references/report-guidelines.md', import.meta.url),
          });
        } finally { await services.collections.close(); }
      }
    }
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify(publicError(error)) + '\n');
    process.exitCode = 1;
  }
}
