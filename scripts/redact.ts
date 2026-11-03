export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, "postgres://[redacted]")
    .replace(/(DATABASE_URL(?:_UNPOOLED)?\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .replace(/Bearer\s+[^\s'"]+/gi, "Bearer [redacted]")
    .replace(/\b(?:ntn|secret)_[A-Za-z0-9]+\b/g, "[redacted]")
    .replace(
      /(BLOB_READ_WRITE_TOKEN|CRON_SECRET|NOTION_TOKEN|SESSION_SECRET|AUTH_PASSWORD_HASH)\s*[=:]\s*\S+/gi,
      "$1=[redacted]",
    );
}
