import { describe, it, expect } from "vitest";
import { isReplyWindowOpen, replyHoursLeft, isUnread, cleanReplyText, previewText, REPLY_WINDOW_MS } from "./whatsapp-inbox";

const now = new Date("2026-10-27T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("reply window", () => {
  it("is open for 24 hours after the customer's last message", () => {
    expect(isReplyWindowOpen(ago(60_000), now)).toBe(true);
    expect(isReplyWindowOpen(ago(REPLY_WINDOW_MS - 1), now)).toBe(true);
    expect(isReplyWindowOpen(ago(REPLY_WINDOW_MS), now)).toBe(false);
    expect(isReplyWindowOpen(ago(REPLY_WINDOW_MS + 3_600_000), now)).toBe(false);
  });

  it("is closed when they have never written", () => {
    expect(isReplyWindowOpen(null, now)).toBe(false);
    expect(isReplyWindowOpen(undefined, now)).toBe(false);
  });

  it("says how many hours are left, rounded up", () => {
    expect(replyHoursLeft(ago(60_000), now)).toBe(24);
    expect(replyHoursLeft(ago(23.5 * 3_600_000), now)).toBe(1);
    expect(replyHoursLeft(ago(25 * 3_600_000), now)).toBe(0);
  });
});

describe("isUnread", () => {
  it("is unread until staff open the conversation after the latest message", () => {
    expect(isUnread({ lastInboundAt: ago(1000), lastReadAt: null })).toBe(true);
    expect(isUnread({ lastInboundAt: ago(1000), lastReadAt: ago(5000) })).toBe(true);
    expect(isUnread({ lastInboundAt: ago(5000), lastReadAt: ago(1000) })).toBe(false);
    expect(isUnread({ lastInboundAt: null, lastReadAt: null })).toBe(false);
  });
});

describe("cleanReplyText / previewText", () => {
  it("trims, normalises line endings, caps the length and rejects empty replies", () => {
    expect(cleanReplyText("  Sure,\r\nsee you Thursday  ")).toBe("Sure,\nsee you Thursday");
    expect(cleanReplyText("   \n ")).toBeNull();
    expect(cleanReplyText("x".repeat(2000))).toHaveLength(1000);
  });

  it("shortens a message to one line for the list", () => {
    expect(previewText("Can we\nmove it   to Thursday?")).toBe("Can we move it to Thursday?");
    expect(previewText("a".repeat(100), 10)).toBe("aaaaaaaaa…");
    expect(previewText(null)).toBe("");
  });
});
