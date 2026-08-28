import { Badge } from "@/components/ui";
import { PLAN_LABELS, subscriptionTotals, renewalUrgency, countUsedClasses } from "@/lib/subscription";
import { format } from "date-fns";

type SubscriptionWithGrants = {
  id: string;
  plan: string;
  baseClasses: number;
  carryForwardClasses: number;
  startDate: Date;
  endDate: Date | null;
  status: string;
  classesUsedAtClose: number | null;
  classesUsedAtMigration: number;
  bonusGrants: { id: string; classes: number; reason: string | null }[];
};

const statusColors: Record<string, string> = {
  ACTIVE: "green",
  EXPIRED: "slate",
  CANCELLED: "red",
};

export function SubscriptionProgress({
  subscription,
  attendance,
}: {
  subscription: SubscriptionWithGrants;
  attendance: { status: string; date: Date }[];
}) {
  const liveUsed = countUsedClasses(attendance.filter((a) => a.date >= subscription.startDate));
  const { bonusClasses, totalClasses, used, remaining } = subscriptionTotals(subscription, liveUsed);
  const urgency = subscription.status === "ACTIVE" ? renewalUrgency(remaining) : null;
  const pct = totalClasses === 0 ? 0 : Math.min(100, Math.round((used / totalClasses) * 100));

  const breakdown = [
    `${subscription.baseClasses} base`,
    subscription.carryForwardClasses > 0 ? `+${subscription.carryForwardClasses} carried forward` : null,
    bonusClasses > 0 ? `+${bonusClasses} bonus` : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-slate-900">
          {PLAN_LABELS[subscription.plan as keyof typeof PLAN_LABELS] ?? subscription.plan}
        </p>
        <div className="flex items-center gap-1.5">
          {urgency === "due" && <Badge color="red">Renewal overdue</Badge>}
          {urgency === "soon" && <Badge color="yellow">Renew soon</Badge>}
          <Badge color={statusColors[subscription.status] ?? "slate"}>{subscription.status}</Badge>
        </div>
      </div>
      {breakdown.length > 1 && <p className="text-xs text-slate-400 mb-1">{breakdown.join(" ")} = {totalClasses} classes</p>}
      <div className="w-full bg-slate-100 rounded-full h-2 mb-1.5">
        <div
          className={`h-2 rounded-full ${remaining <= 0 ? "bg-red-500" : remaining <= 2 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">
        {used} of {totalClasses} classes used · {remaining > 0 ? `${remaining} remaining` : "0 remaining"}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        {format(subscription.startDate, "d MMM yyyy")} &rarr; {subscription.endDate ? format(subscription.endDate, "d MMM yyyy") : "open"}
      </p>
      {subscription.bonusGrants.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {subscription.bonusGrants.map((g) => (
            <li key={g.id} className="text-xs text-slate-400">
              +{g.classes} bonus{g.reason ? ` — ${g.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
