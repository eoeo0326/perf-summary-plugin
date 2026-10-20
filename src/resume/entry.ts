import { runRenderCli } from './render.js';

try {
  await runRenderCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : 'HTML 변환에 실패했습니다.') + '\n');
  process.exitCode = 1;
}
