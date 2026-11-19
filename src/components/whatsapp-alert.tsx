import Link from "next/link";
import type { FailureGroup } from "@/lib/whatsapp-stats";

// A red box for the admin when WhatsApp refused some of today's messages: how many,
// why, and what to do. Shown on the dashboard and the WhatsApp page; renders nothing
// when there were no failures today.
export function WhatsAppAlert({ failures }: { failures: FailureGroup[] }) {
  const total = failures.reduce((n, g) => n + g.count, 0);
  if (total === 0) return null;
  return (
    <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
      <p className="font-semibold">
        {total} WhatsApp message{total === 1 ? "" : "s"} did not go out today
      </p>
      <ul className="mt-2 space-y-2">
        {failures.map((g) => (
          <li key={g.code ?? g.title}>
            <p>
              <b>{g.count}</b> · {g.title}
              {g.code ? <span className="text-red-700/70"> (WhatsApp error {g.code})</span> : null}
            </p>
            <p className="text-red-800/90 mt-0.5">{g.action}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        <Link href="/admin/whatsapp/reminders" className="font-medium underline">
          Open Class reminders to send the failed ones again
        </Link>
      </p>
    </div>
  );
}
