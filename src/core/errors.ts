export type UserErrorCode =
  | 'invalid_input'
  | 'rate_limited'
  | 'not_found'
  | 'forbidden'
  | 'expired'
  | 'conflict';

/** An error whose message is safe and useful to show to the person who triggered it. */
export class UserError extends Error {
  constructor(
    public readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

export function isUserError(e: unknown): e is UserError {
  return e instanceof UserError;
}
