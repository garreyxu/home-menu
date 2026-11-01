export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, "postgres://[redacted]")
    .replace(/(DATABASE_URL(?:_UNPOOLED)?\s*[=:]\s*)\S+/gi, "$1[redacted]");
}
