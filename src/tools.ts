import { z } from 'zod/v4';
import type { CollectionManager } from './collections.js';
import { AppError } from './errors.js';
import { accountName, repoName, type GithubClient } from './github/client.js';
import { getReportContext, writeReport } from './reports.js';

const periodDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);
export const collectSchema = z.object({
  year: z.string().regex(/^\d{4}$/).optional().describe('YYYY. 월별 보고서와 연간 종합을 생성합니다.'),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM. 현재 달은 오늘까지, 미래 달은 오류입니다.'),
  since: periodDate.optional().describe('YYYY[-MM[-DD]]. year/month 대신 사용합니다.'),
  until: periodDate.optional().describe('since 모드의 종료일. 생략하면 PC 시간대의 오늘입니다.'),
  orgs: z.array(accountName).min(1).max(50).optional(),
  repo: repoName.optional().describe('owner/repo. 지정하면 orgs보다 우선합니다.'),
  accounts: z.array(accountName).min(1).max(50).optional().describe('생략하면 gh에 로그인한 모든 github.com 계정입니다.'),
}).strict();
export const modeSchema = z.enum(['year', 'month', 'range']);
export const toolSchemas = {
  check_environment: z.object({}).strict(),
  collect_activity: collectSchema,
  get_activity: z.object({
    collectionId: z.string().uuid(), cursor: z.string().max(2048).optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    repo: repoName.optional(), pageSize: z.number().int().min(1).max(25).optional(),
  }).strict(),
  cancel_collection: z.object({ collectionId: z.string().uuid() }).strict(),
  get_report_context: z.object({ mode: modeSchema.optional() }).strict(),
  write_report: z.object({
    absolutePath: z.string().min(1).max(4096),
    markdown: z.string().min(1).max(20 * 1024 * 1024), overwrite: z.boolean().default(false),
  }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export function isToolName(name: string): name is ToolName { return Object.hasOwn(toolSchemas, name); }

export function validateToolInput(name: ToolName, input: unknown) {
  const parsed = toolSchemas[name].safeParse(input);
  if (!parsed.success) throw new AppError('INVALID_INPUT', '도구 입력 형식이 올바르지 않습니다. --help의 JSON 입력을 확인하세요.');
  return parsed.data;
}

export interface ToolServices {
  github: Pick<GithubClient, 'inspect'>;
  collections: CollectionManager;
  guidelines?: URL;
}

// Both transports use these schemas and operations. Only the transport envelope differs.
export async function executeTool(name: ToolName, input: unknown, services: ToolServices) {
  validateToolInput(name, input);
  switch (name) {
    case 'check_environment': return services.github.inspect();
    case 'collect_activity': return services.collections.start(toolSchemas.collect_activity.parse(input));
    case 'get_activity': return services.collections.read(toolSchemas.get_activity.parse(input));
    case 'cancel_collection': return services.collections.cancel(toolSchemas.cancel_collection.parse(input).collectionId);
    case 'get_report_context': return getReportContext(toolSchemas.get_report_context.parse(input).mode, services.guidelines);
    case 'write_report': {
      const { absolutePath, markdown, overwrite } = toolSchemas.write_report.parse(input);
      return writeReport(absolutePath, markdown, overwrite);
    }
  }
}
