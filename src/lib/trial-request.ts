// Validation and spam guards for the public "Book a trial class" form on the
// marketing website (POST /api/trial-request). Kept free of Next/Prisma
// imports so it can be unit-tested; the route handler wires it to the DB.

export const CLASS_FOR_OPTIONS = ["Myself (adult)", "My child (under 18)", "Someone else"] as const;

// A person typing quickly still takes a few seconds to fill four fields; a
// bot posting straight to the endpoint reports ~0 (or nothing at all).
export const MIN_FILL_MS = 2500;

// Indian mobile numbers: accepts "98849 04856", "+91 98849-04856",
// "091 9884904856", "09884904856" and returns the bare 10 digits (starting
// 6-9), which is how phone numbers are already stored across the CRM.
export function normalizeIndianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export type TrialRequest = {
  name: string;
  phone: string;
  email: string | null;
  interest: string;
  classFor: string | null;
};

export type TrialParseResult =
  | { ok: true; value: TrialRequest }
  | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// `interestOptions` are the course names currently in the CRM, so the form
// can never invent an instrument that doesn't exist.
export function parseTrialRequest(body: unknown, interestOptions: string[]): TrialParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const b = body as Record<string, unknown>;

  const name = str(b.name, 80).replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Please enter your name." };

  const phone = normalizeIndianPhone(str(b.phone, 30));
  if (!phone) return { ok: false, error: "Please enter a valid 10-digit mobile number." };

  const emailRaw = str(b.email, 120);
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return { ok: false, error: "That email address doesn't look right." };
  }

  const interest = interestOptions.find((o) => o.toLowerCase() === str(b.interest, 60).toLowerCase());
  if (!interest) return { ok: false, error: "Please choose an instrument." };

  const classForRaw = str(b.classFor, 40);
  const classFor = (CLASS_FOR_OPTIONS as readonly string[]).includes(classForRaw) ? classForRaw : null;

  return { ok: true, value: { name, phone, email: emailRaw || null, interest, classFor } };
}

// True when the submission looks automated: the hidden "website" field was
// filled in (humans never see it), or the form was submitted implausibly
// fast / without reporting a fill time.
export function looksLikeBot(body: unknown): boolean {
  if (!body || typeof body !== "object") return true;
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim() !== "") return true;
  const elapsed = Number(b.elapsedMs);
  return !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS;
}

// Sliding-window limiter, in memory — the app runs as a single container, so
// there is nothing to share between instances. Per-IP stops one visitor
// hammering the form; the global cap stops a flood from many addresses.
export function createRateLimiter(opts: { perKey: number; global: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  let globalHits: number[] = [];
  const prune = (list: number[], now: number) => list.filter((t) => now - t < opts.windowMs);

  return {
    // Returns true if the request is allowed (and records it).
    allow(key: string, now = Date.now()): boolean {
      globalHits = prune(globalHits, now);
      const mine = prune(hits.get(key) ?? [], now);
      if (globalHits.length >= opts.global || mine.length >= opts.perKey) {
        hits.set(key, mine);
        return false;
      }
      mine.push(now);
      globalHits.push(now);
      hits.set(key, mine);
      // Don't let the map grow forever with one-off visitors.
      if (hits.size > 5000) for (const [k, v] of hits) if (prune(v, now).length === 0) hits.delete(k);
      return true;
    },
  };
}

export function leadNotes(req: TrialRequest, submittedAt: Date) {
  const lines = ["Requested a trial class via the website form."];
  if (req.classFor) lines.push(`Class is for: ${req.classFor}.`);
  lines.push(`Submitted ${submittedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
  return lines.join(" ");
}
