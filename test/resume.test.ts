import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderResume } from '../src/resume/render.js';

// Fictional content only. No personal reports or resumes belong in fixtures.
const markdown = `# 예시 지원자 · 개발자

> 생성 일시: 2030-02-03 09:10:11 (Asia/Seoul)

## 경력 요약

카메라 앱의 **통신 멈춤**을 분석하고 갱신 전용 경로를 구현했습니다.

### 테스트 조건의 성능 개선

- 동일한 테스트 입력에서 처리 시간이 12초→8초로 줄었습니다.
- [프로젝트](https://example.com/project?a=1&b=2)에서 결과를 확인할 수 있습니다.
`;

test('Markdown 내용·측정 조건·생성 일시·링크를 유지한 자체 완결 HTML을 만든다', () => {
  const html = renderResume(markdown);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<h1>예시 지원자 · 개발자<\/h1>/);
  assert.match(html, /<strong>통신 멈춤<\/strong>/);
  assert.match(html, /동일한 테스트 입력에서 처리 시간이 12초→8초로 줄었습니다\./);
  assert.equal(html.split('생성 일시: 2030-02-03 09:10:11 (Asia/Seoul)').length - 1, 1);
  assert.match(html, /href="https:\/\/example.com\/project\?a=1&amp;b=2"/);
  assert.match(html, /@page \{ size: A4; margin: 18mm; \}/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /<script|<link|@import|@font-face|transform:\s*scale|zoom:/i);
  assert.equal(renderResume(markdown.replace(/\n/g, '\r\n')), html);
});

test('원시 HTML·스크립트·원격 이미지를 실행·요청하지 않고 위험한 링크를 제거한다', () => {
  const html = renderResume(markdown + `
<script>alert('test')</script>

[열기](javascript:alert%281%29)

![구조 설명](https://example.com/tracking.png)

[인코딩](javascript&#58;alert%281%29)
`);
  assert.doesNotMatch(html, /<script|<img|href="javascript/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /구조 설명/);
});

test('생성 일시를 새로 만들지 않으며 누락된 제목·날짜·시간대를 거부한다', () => {
  assert.throws(() => renderResume('# 이력서\n\n내용'), /생성 일시/);
  assert.throws(() => renderResume(markdown.replace(' (Asia/Seoul)', '')), /생성 일시/);
  assert.throws(() => renderResume(markdown.replace('# 예시 지원자 · 개발자', '제목 없음')), /생성 일시/);
});

test('독립 번들은 한글·공백 경로를 지원하고 Markdown과 기존 HTML을 보존한다', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'resume-render-'));
  try {
    const input = path.join(root, '이력서 원문.md'), output = path.join(root, '이력서 출력.html');
    const script = fileURLToPath(new URL('../skills/resume-builder/scripts/render-resume.mjs', import.meta.url));
    await writeFile(input, markdown);
    const args = [script, '--input', input, '--output', output];
    const rendered = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.equal(JSON.parse(rendered.stdout).written, true);
    assert.equal(await readFile(input, 'utf8'), markdown);
    assert.equal(await readFile(output, 'utf8'), renderResume(markdown));
    const again = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(again.status, 0);
    assert.equal(await readFile(output, 'utf8'), renderResume(markdown));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('--no-html은 입력 파일을 읽거나 출력 파일을 생성하지 않는다', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'resume-no-html-'));
  try {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../skills/resume-builder/scripts/render-resume.mjs', import.meta.url)),
      '--no-html', '--input', path.join(root, '없는 파일.md'), '--output', path.join(root, 'resume.html'),
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { written: false, reason: 'html_disabled' });
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('개인 이력서 결과물은 Git에서 제외한다', () => {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8',
    input: ['recommendations.md', 'evidence.md', 'resume.md', 'resume.html']
      .map(file => 'ResumeDrafts/2030-02-03_091011/' + file).join('\n') + '\n',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 4);
});
