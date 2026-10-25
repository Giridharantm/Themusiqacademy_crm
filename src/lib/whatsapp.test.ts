import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, parseInboundMessages, leadPhoneFromWhatsApp, whatsappNote, createSeenIds } from "./whatsapp";

const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

describe("verifySignature", () => {
  const body = '{"object":"whatsapp_business_account"}';

  it("accepts a body signed with the app secret", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a missing or malformed header", () => {
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha1=abcd", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=not-hex", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=abcd", "s3cret")).toBe(false);
  });
});

const payload = (value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field: "messages", value }] }],
});

describe("parseInboundMessages", () => {
  it("reads a text message with the sender's profile name", () => {
    const msgs = parseInboundMessages(
      payload({
        contacts: [{ wa_id: "919845708094", profile: { name: "Aldrin" } }],
        messages: [{ id: "wamid.1", from: "919845708094", type: "text", text: { body: " Hi, guitar classes? " } }],
      })
    );
    expect(msgs).toEqual([{ id: "wamid.1", from: "919845708094", name: "Aldrin", text: "Hi, guitar classes?" }]);
  });

  it("describes non-text messages and reads button and list replies", () => {
    const msgs = parseInboundMessages(
      payload({
        messages: [
          { id: "a", from: "919845708094", type: "image" },
          { id: "b", from: "919845708094", type: "button", button: { text: "Yes" } },
          { id: "c", from: "919845708094", type: "interactive", interactive: { list_reply: { title: "Keyboard" } } },
        ],
      })
    );
    expect(msgs.map((m) => m.text)).toEqual(["[image message]", "Yes", "Keyboard"]);
    expect(msgs[0].name).toBeNull();
  });

  it("ignores status updates, other fields and malformed payloads", () => {
    expect(parseInboundMessages(payload({ statuses: [{ id: "x", status: "delivered" }] }))).toEqual([]);
    expect(parseInboundMessages({ object: "page", entry: [] })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages("nope")).toEqual([]);
    expect(parseInboundMessages(payload({ messages: [{ from: "9198", type: "text" }, 5, null] }))).toEqual([]);
  });
});

describe("leadPhoneFromWhatsApp", () => {
  it("turns an Indian WhatsApp number into the bare 10 digits stored across the CRM", () => {
    expect(leadPhoneFromWhatsApp("919845708094")).toBe("9845708094");
  });

  it("keeps a foreign number in full with a plus", () => {
    expect(leadPhoneFromWhatsApp("14155550123")).toBe("+14155550123");
  });
});

describe("whatsappNote", () => {
  it("stamps the message with its time in UTC", () => {
    expect(whatsappNote("Hello", new Date("2026-10-25T09:30:45Z"))).toBe("WhatsApp 2026-10-25 09:30 UTC: Hello");
    expect(whatsappNote("", new Date("2026-10-25T09:30:00Z"))).toContain("[empty message]");
  });
});

describe("createSeenIds", () => {
  it("reports an id as new once, then as a repeat", () => {
    const seen = createSeenIds();
    expect(seen.add("a")).toBe(true);
    expect(seen.add("a")).toBe(false);
    expect(seen.add("b")).toBe(true);
  });

  it("forgets the oldest ids once it is over its limit", () => {
    const seen = createSeenIds(2);
    seen.add("a");
    seen.add("b");
    seen.add("c");
    expect(seen.add("a")).toBe(true);
  });
});
