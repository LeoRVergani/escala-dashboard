export class PublicationError extends Error {
  code: string;
  httpStatus: number;
  details?: unknown;

  constructor(code: string, message: string, options?: { httpStatus?: number; details?: unknown });
  static httpStatusFor(code: string): number;
}
