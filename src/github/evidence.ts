export function trimBody(raw: string): { body: string; notes: string[] } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let callout = false;
  for (const line of lines) {
    if (/^#{2,3}\s+(수동 테스트 체크리스트|테스트 항목)(?:\s|$)/.test(line)) break;
    if (/^\s*>\s*\[!(CAUTION|TIP|IMPORTANT|WARNING|NOTE)\]/i.test(line)) {
      callout = true;
      continue;
    }
    if (callout) {
      if (line.trim() === '' || /^---+$/.test(line.trim())) callout = false;
      continue;
    }
    output.push(line);
  }
  const cleaned = output.join('\n').trim();
  const body = cleaned.slice(0, 1500);
  const notes: string[] = [];
  if (cleaned !== raw.trim()) notes.push('PR 본문의 callout·테스트 템플릿을 제거했습니다.');
  if (cleaned.length > 1500) notes.push('PR 본문을 1,500자로 축약했습니다.');
  return { body, notes };
}
