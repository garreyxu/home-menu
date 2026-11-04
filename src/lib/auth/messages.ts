export const INVALID_CREDENTIALS_MESSAGE = "用户名或密码不对";
export const RATE_LIMITED_MESSAGE = "歇会儿再试";

export type LoginState = {
  error?: string;
  /** Milliseconds left on the login lock, when the error is the rate limit. */
  retryAfterMs?: number;
};
