import { readFileSync } from 'node:fs';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { CollectionManager } from '../collections.js';
import { GithubClient } from '../github/client.js';
import { publicError } from '../errors.js';
import { getReportContext, reportUri, workflowInstructions } from '../reports.js';
import { collectSchema, executeTool, modeSchema, toolSchemas } from '../tools.js';

export { collectSchema } from '../tools.js';

export const version: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

async function result(action: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = JSON.parse(JSON.stringify(await action()));
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  } catch (error) {
    const data = publicError(error);
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  }
}

export function createApp(github = new GithubClient(), collections = new CollectionManager(github)) {
  const services = { github, collections };
  const server = new McpServer(
    { name: 'perf-summary', version },
    { instructions: workflowInstructions },
  );
  server.registerTool('check_environment', {
    description: 'gh 설치·인증 계정·PC 시간대를 점검합니다. 인증 정보 자체는 반환하지 않습니다.',
    inputSchema: toolSchemas.check_environment, annotations: { ...readOnly, openWorldHint: true },
  }, async () => result(() => executeTool('check_environment', {}, services)));

  server.registerTool('collect_activity', {
    description: 'GitHub PR 성과 수집을 시작합니다. year/month/since 중 하나만 지정하세요. 즉시 collectionId를 반환하며 get_activity로 완료·부분 실패를 확인합니다.',
    inputSchema: collectSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async input => result(() => executeTool('collect_activity', input, services)));

  server.registerTool('get_activity', {
    description: '수집 진행 상태 또는 PR 생성일 기준 통계·근거 페이지를 조회합니다. 완료 후 nextCursor가 없을 때까지 읽으세요. complete=false면 누락 경고가 필수입니다.',
    inputSchema: toolSchemas.get_activity,
    annotations: readOnly,
  }, async input => result(() => executeTool('get_activity', input, services)));

  server.registerTool('cancel_collection', {
    description: '진행 중인 로컬 수집을 취소합니다. GitHub 데이터와 사용자 파일은 변경하지 않습니다.',
    inputSchema: toolSchemas.cancel_collection,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ collectionId }) => result(() => executeTool('cancel_collection', { collectionId }, services)));

  server.registerTool('get_report_context', {
    description: '성과 보고서의 작성 지침과 Markdown 템플릿을 제공합니다. LLM 호출은 연결된 에이전트가 담당합니다.',
    inputSchema: toolSchemas.get_report_context,
    annotations: readOnly,
  }, async ({ mode }) => result(() => executeTool('get_report_context', { mode }, services)));

  server.registerTool('write_report', {
    description: '에이전트가 작성한 Markdown을 지정한 절대경로에 저장합니다. 기본 경로는 사용자 작업 폴더 아래 PerformanceSummary이며 npm 폴더를 사용하지 마세요. 기존 파일 덮어쓰기는 사용자 의사 확인 후 overwrite=true로 호출하세요. 미리보기 요청에는 호출하지 마세요.',
    inputSchema: toolSchemas.write_report,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ absolutePath, markdown, overwrite }) => result(() => executeTool('write_report', { absolutePath, markdown, overwrite }, services)));

  server.registerResource('report-guidelines', reportUri, {
    title: '성과 보고서 작성 지침', mimeType: 'text/markdown',
    description: 'get_report_context와 같은 공통 보고서 규칙입니다.',
  }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: (await getReportContext()).guidelines }],
  }));
  server.registerPrompt('performance-summary', {
    description: '수집 도구를 사용하여 GitHub 성과 보고서를 작성합니다.',
    argsSchema: z.object({ mode: modeSchema.optional() }).default({}),
  }, async ({ mode }) => ({
    messages: [{ role: 'user', content: {
      type: 'text',
      text: workflowInstructions + '\n\n' + (await getReportContext(mode)).guidelines,
    } }],
  }));

  const close = async () => {
    await collections.close();
    await server.close();
  };
  server.server.onclose = () => { void collections.close(); };
  return { server, collections, close };
}
