export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'ok', data };
}

export function err(code: number, message: string): ApiResponse<never> {
  return { code, message };
}
