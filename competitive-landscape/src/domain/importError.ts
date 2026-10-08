export class ImportError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'ImportError';
    this.details = details;
  }
}
