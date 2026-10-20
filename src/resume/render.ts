import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Marked } from 'marked';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const styles = `
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; background: #f1f3f5; color: #202a32;
  font: 11pt/1.65 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
main { width: 100%; max-width: 210mm; margin: 32px auto; padding: 18mm; background: white;
  box-shadow: 0 4px 24px #202a3212; overflow-wrap: anywhere; }
h1, h2, h3, h4 { color: #18252c; line-height: 1.35; break-after: avoid; }
h1 { margin: 0 0 8px; font-size: 24pt; letter-spacing: -.035em; }
h2 { margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #dce2e6; font-size: 15pt; }
h3 { margin: 20px 0 8px; font-size: 12pt; }
p { margin: 8px 0 12px; orphans: 3; widows: 3; }
ul, ol { padding-left: 1.4em; margin: 8px 0 16px; }
li { margin: 0 0 8px; break-inside: avoid; }
li > p { margin: 4px 0; }
blockquote { margin: 12px 0; padding-left: 12px; border-left: 2px solid #dce2e6; color: #46555f; }
h1 + blockquote { margin: 0 0 24px; padding: 0; border: 0; font-size: 9pt; }
a { color: #20557d; text-decoration-thickness: .06em; text-underline-offset: .14em; }
strong { font-weight: 700; }
code { font-family: ui-monospace, monospace; font-size: .9em; }
pre { white-space: pre-wrap; padding: 12px; background: #f5f7f8; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid #dce2e6; }
hr { margin: 24px 0; border: 0; border-top: 1px solid #dce2e6; }
@media screen and (max-width: 640px) { main { margin: 0; padding: 24px 20px; box-shadow: none; } }
@page { size: A4; margin: 18mm; }
@media print {
  body { background: white; }
  main { margin: 0; padding: 0; max-width: none; box-shadow: none; }
  a { color: inherit; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}
`;

export function renderResume(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const header = normalized.match(/^# ([^\n]+)\n\s*\n> 생성 일시: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \([^\n)]+\))\s*(?:\n|$)/);
  if (!header) throw new Error('첫 H1 제목 바로 아래에 생성 일시: YYYY-MM-DD HH:mm:ss (시간대)를 blockquote로 작성하세요.');
  const marked = new Marked({
    async: false, gfm: true,
    renderer: {
      html({ text }) { return escapeHtml(text); },
      image({ text }) { return escapeHtml(text); },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safe = href.replace(/[\u0000-\u0020\u007f]/g, '');
        if (!/^(https?:\/\/|mailto:|#)/i.test(safe)) return text;
        if (!safe.startsWith('#')) {
          try { new URL(safe); } catch { return text; }
        }
        return '<a href="' + escapeHtml(safe) + '"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + text + '</a>';
      },
    },
  });
  const body = marked.parse(normalized, { async: false });
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(header[1]!)}</title>
<style>${styles}</style>
</head>
<body><main>
${body}</main></body>
</html>
`;
}

export async function runRenderCli(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    input: { type: 'string' }, output: { type: 'string' },
    'no-html': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    process.stdout.write('render-resume --input /absolute/resume.md --output /absolute/resume.html\n--no-html: 입력을 읽거나 HTML을 생성하지 않습니다.\n');
    return;
  }
  // The skill skips this process entirely for Markdown-only requests. This guard
  // also keeps an explicitly disabled standalone invocation free of file I/O.
  if (values['no-html']) {
    process.stdout.write(JSON.stringify({ written: false, reason: 'html_disabled' }) + '\n');
    return;
  }
  if (!values.input || !values.output || !path.isAbsolute(values.input) || !path.isAbsolute(values.output) ||
      path.extname(values.input).toLowerCase() !== '.md' || path.extname(values.output).toLowerCase() !== '.html') {
    throw new Error('--input은 절대 .md 경로, --output은 절대 .html 경로여야 합니다.');
  }
  const html = renderResume(await readFile(values.input, 'utf8'));
  await writeFile(values.output, html, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ written: true, path: values.output }) + '\n');
}
