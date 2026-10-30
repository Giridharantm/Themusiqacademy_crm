import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { createFrontDesk, deleteUser, resetLearnerPasswordToPhone, setUserPassword, setUserStatus, updateUserDetails } from "@/lib/actions/user-admin-actions";
import { isPlaceholderEmail } from "@/lib/login";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SearchBox } from "@/components/search-box";
import { format } from "date-fns";

const PAGE_SIZE = 40;

const ROLE_TABS = [
  { value: "", label: "Everyone" },
  { value: "ADMIN", label: "Admin" },
  { value: "FRONT_DESK", label: "Front desk" },
  { value: "TEACHER", label: "Teachers" },
  { value: "PARENT", label: "Students & parents" },
] as const;

const ROLE_LABELS: Record<string, string> = { ADMIN: "Admin", FRONT_DESK: "Front desk", TEACHER: "Teacher", PARENT: "Student / parent" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const sp = await searchParams;
  const me = await currentUser();
  const q = sp.q?.trim() ?? "";
  const role = ROLE_TABS.some((t) => t.value === sp.role && t.value) ? (sp.role as "ADMIN" | "FRONT_DESK" | "TEACHER" | "PARENT") : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const ci = "insensitive" as const;
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: ci } },
            { email: { contains: q, mode: ci } },
            { phone: { contains: q } },
            { studentLinks: { some: { student: { name: { contains: q, mode: ci } } } } },
          ],
        }
      : {}),
  };

  const [users, total, counts] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { studentLinks: { include: { student: { select: { name: true, studentCode: true } } } } },
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["role"], _count: true }),
  ]);
  const countOf = (r: string) => counts.find((c) => c.role === r)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (over: Record<string, string>) => ({ pathname: "/admin/users", query: { ...(q ? { q } : {}), ...(role ? { role } : {}), ...over } });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Everyone who can sign in — change details, give a new password, switch off or remove. Passwords are stored scrambled, so they can be replaced but never shown."
        action={<SearchBox placeholder="Search name, email, phone or student…" defaultValue={q} extraParams={{ role }} />}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {ROLE_TABS.map((t) => {
          const active = (role ?? "") === t.value;
          const n = t.value ? countOf(t.value) : counts.reduce((s, c) => s + c._count, 0);
          return (
            <Link
              key={t.value || "all"}
              href={{ pathname: "/admin/users", query: { ...(q ? { q } : {}), ...(t.value ? { role: t.value } : {}) } }}
              className={`px-3 py-1.5 rounded-full text-sm border ${active ? "bg-brand text-page border-brand" : "bg-white text-ink border-line hover:bg-panel"}`}
            >
              {t.label} · {n}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`${total} login${total === 1 ? "" : "s"}`} subtitle={pages > 1 ? `Page ${page} of ${pages}` : undefined} />
            {users.length === 0 ? (
              <CardBody>
                <EmptyState text="Nobody matches" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {users.map((u) => {
                  const learner = u.role === "PARENT";
                  const isMe = u.id === me?.id;
                  const realEmail = isPlaceholderEmail(u.email) ? "" : u.email;
                  const passwordNote = u.passwordChangedAt
                    ? `Password changed ${format(u.passwordChangedAt, "d MMM yyyy")}`
                    : learner && u.phone
                      ? "Password is still the first one — their phone number"
                      : "Password not changed since the login was created";
                  return (
                    <li key={[u.id, u.name, u.email, u.phone, u.status, u.passwordChangedAt?.getTime()].join("|")} className="px-5 py-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {u.name} {isMe && <span className="text-xs text-muted">(you)</span>}
                          </p>
                          <p className="text-xs text-ink mt-0.5">
                            Username: <b>{learner ? (u.phone ?? "—") : u.email}</b>
                          </p>
                          <p className="text-xs text-muted">{passwordNote}</p>
                          {learner && u.studentLinks.length > 0 && (
                            <p className="text-xs text-muted mt-0.5">
                              For: {u.studentLinks.map((g) => `${g.student.name} (${g.student.studentCode})`).join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color="slate">{ROLE_LABELS[u.role]}</Badge>
                          <Badge color={u.status === "ACTIVE" ? "green" : "red"}>{u.status === "ACTIVE" ? "Active" : "Switched off"}</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                        <details className="text-xs">
                          <summary className="text-indigo-600 hover:underline cursor-pointer list-none">Edit details</summary>
                          <form action={updateUserDetails.bind(null, u.id)} className="mt-2 space-y-2 w-72 max-w-full">
                            <Input label="Name" name="name" defaultValue={u.name} required />
                            <Input label={learner ? "Phone (their username)" : "Phone"} name="phone" defaultValue={u.phone ?? ""} required={learner} />
                            <Input label={learner ? "Email (optional)" : "Email (their username)"} name="email" type="email" defaultValue={realEmail} required={!learner} />
                            <SubmitButton variant="secondary" pendingText="Saving…">
                              Save
                            </SubmitButton>
                          </form>
                        </details>

                        <details className="text-xs">
                          <summary className="text-indigo-600 hover:underline cursor-pointer list-none">Set a new password</summary>
                          <form action={setUserPassword.bind(null, u.id)} className="mt-2 flex items-end gap-2 w-72 max-w-full">
                            <div className="flex-1">
                              <Input label="New password (8+ characters)" name="password" type="text" minLength={8} required autoComplete="off" />
                            </div>
                            <SubmitButton variant="secondary" pendingText="Saving…">
                              Save
                            </SubmitButton>
                          </form>
                        </details>

                        {learner && u.phone && (
                          <form action={resetLearnerPasswordToPhone.bind(null, u.id)}>
                            <ConfirmSubmitButton confirmMessage={`Put ${u.name}'s password back to their phone number?`}>Reset to phone number</ConfirmSubmitButton>
                          </form>
                        )}

                        {!isMe && (
                          <form action={setUserStatus.bind(null, u.id, u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                            <ConfirmSubmitButton confirmMessage={u.status === "ACTIVE" ? `Stop ${u.name} signing in? Their history stays.` : `Let ${u.name} sign in again?`}>
                              {u.status === "ACTIVE" ? "Switch off" : "Switch on"}
                            </ConfirmSubmitButton>
                          </form>
                        )}

                        {!isMe && u.role !== "ADMIN" && (
                          <form action={deleteUser.bind(null, u.id)}>
                            <ConfirmSubmitButton variant="danger" confirmMessage={`Delete ${u.name}'s login permanently? This can't be undone.`}>
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {pages > 1 && (
              <CardBody className="border-t border-line flex items-center justify-between text-sm">
                {page > 1 ? (
                  <Link href={link({ page: String(page - 1) })} className="text-indigo-600 hover:underline">
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                {page < pages ? (
                  <Link href={link({ page: String(page + 1) })} className="text-indigo-600 hover:underline">
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </CardBody>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Add a front desk login" subtitle="Teachers are added on the Teachers page; students and parents on the student's page" />
          <CardBody>
            <form action={createFrontDesk} className="space-y-3">
              <Input label="Name" name="name" required />
              <Input label="Email (used to sign in)" name="email" type="email" required />
              <Input label="Phone" name="phone" />
              <Input label="Password (8+ characters)" name="password" type="text" minLength={8} required autoComplete="off" />
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
