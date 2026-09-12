export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function publicError(error: unknown): { code: string; message: string } {
  // Never forward raw child-process errors: they may contain credentials or API bodies.
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'CANCELLED', message: '수집이 취소되었습니다.' };
  }
  return { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다. 다시 시도해 주세요.' };
}
