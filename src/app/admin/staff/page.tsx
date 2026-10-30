import { prisma } from "@/lib/prisma";
import { createFrontDesk, resetFrontDeskPassword, setFrontDeskStatus } from "@/lib/actions/staff-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function StaffPage() {
  const staff = await prisma.user.findMany({ where: { role: "FRONT_DESK" }, orderBy: [{ status: "asc" }, { name: "asc" }] });

  return (
    <div>
      <PageHeader title="Front desk staff" subtitle="Logins for the front desk: leads, students, attendance, payments and the WhatsApp inbox — no reports, teachers or reminder controls" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Front desk logins" />
            {staff.length === 0 ? (
              <CardBody>
                <EmptyState text="No front desk logins yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {staff.map((u) => (
                  <li key={u.id} className="px-5 py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{u.name}</p>
                        <p className="text-xs text-muted">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge color={u.status === "ACTIVE" ? "green" : "slate"}>{u.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
                        <form action={setFrontDeskStatus.bind(null, u.id, u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                          <ConfirmSubmitButton confirmMessage={u.status === "ACTIVE" ? `Stop ${u.name} signing in? Their history stays.` : `Let ${u.name} sign in again?`}>
                            {u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                    <details>
                      <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">Set a new password</summary>
                      <form action={resetFrontDeskPassword.bind(null, u.id)} className="mt-2 flex items-end gap-2 max-w-sm">
                        <div className="flex-1">
                          <Input label="New password (8+ characters)" name="password" type="password" minLength={8} required autoComplete="new-password" />
                        </div>
                        <SubmitButton variant="secondary" pendingText="Saving…">
                          Save
                        </SubmitButton>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Add a front desk login" />
          <CardBody>
            <form action={createFrontDesk} className="space-y-3">
              <Input label="Name" name="name" required />
              <Input label="Email (used to sign in)" name="email" type="email" required />
              <Input label="Phone" name="phone" />
              <Input label="Password (8+ characters)" name="password" type="password" minLength={8} required autoComplete="new-password" />
              <SubmitButton className="w-full" pendingText="Adding…">
                Add login
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
