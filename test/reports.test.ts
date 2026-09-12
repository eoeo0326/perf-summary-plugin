import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getReportContext, writeReport } from '../src/reports.js';

test('작업 디렉터리와 무관하게 지정 경로에 저장하고 덮어쓰기를 제어한다', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'perf-report-'));
  try {
    const target = path.join(root, '한글 경로', 'report.md');
    assert.equal((await writeReport(target, '# Original\n')).written, true);
    const conflict = await writeReport(target, '# Replacement\n');
    assert.equal(conflict.written, false);
    assert.equal(await readFile(target, 'utf8'), '# Original\n');
    assert.equal((await writeReport(target, '# Replacement\n', true)).written, true);
    assert.equal(await readFile(target, 'utf8'), '# Replacement\n');
    assert.deepEqual(await readdir(path.dirname(target)), ['report.md']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('동시 저장 시 한 작성자만 성공하며 기존 파일이 손상되지 않는다', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'perf-race-'));
  try {
    const target = path.join(root, 'report.md');
    const results = await Promise.all([writeReport(target, '# One\n'), writeReport(target, '# Two\n')]);
    assert.equal(results.filter(result => result.written).length, 1);
    assert.ok(['# One\n', '# Two\n'].includes(await readFile(target, 'utf8')));
    assert.deepEqual(await readdir(root), ['report.md']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('상대경로·비Markdown·빈 보고서를 거부한다', async () => {
  await assert.rejects(writeReport('relative.md', '# Report'));
  await assert.rejects(writeReport(path.join(tmpdir(), 'report.json'), '# Report'));
  await assert.rejects(writeReport(path.join(tmpdir(), 'report.md'), '   '));
});

test('기존 symlink를 통해 다른 파일을 덮어쓰지 않는다', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'perf-link-'));
  try {
    const actual = path.join(root, 'original.txt');
    const target = path.join(root, 'report.md');
    await writeFile(actual, 'original');
    await symlink(actual, target);
    await assert.rejects(writeReport(target, '# replacement', true));
    assert.equal(await readFile(actual, 'utf8'), 'original');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('보고서 지침은 공통 템플릿과 연간 섹션을 패키지 리소스에서 읽는다', async () => {
  const context = await getReportContext('year');
  assert.equal(context.mode, 'year');
  assert.match(context.guidelines, /## 📖 연간 종합/);
  assert.match(context.guidelines, /## 📊 한눈에 보기/);
  assert.match(context.guidelines, /## 📈 월별 추이/);
});
