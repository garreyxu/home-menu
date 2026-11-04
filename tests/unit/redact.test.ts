import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../scripts/redact";

describe("redactSecrets", () => {
  it("hides notion tokens, bearer secrets, and connection strings", () => {
    const redacted = redactSecrets(
      "Bearer ntn_supersecretvalue NOTION_TOKEN=ntn_other postgres://user:pass@host/db",
    );
    expect(redacted).not.toContain("ntn_supersecretvalue");
    expect(redacted).not.toContain("ntn_other");
    expect(redacted).not.toContain("user:pass");
    expect(redacted).toContain("Bearer [redacted]");
    expect(redacted).toContain("NOTION_TOKEN=[redacted]");
  });
});
