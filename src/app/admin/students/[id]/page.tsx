import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addGuardian,
  removeGuardian,
  enrollInBatch,
  updateEnrollmentStatus,
  updateEnrollmentBatch,
  deleteEnrollment,
  updateStudentStatus,
} from "@/lib/actions/student-actions";
import { createOrRenewSubscription, updateSubscription, addBonusClasses, cancelSubscription, addPastSubscription } from "@/lib/actions/subscription-actions";
import { markAttendanceOnDateAsAdmin, removeAttendanceOnDateAsAdmin } from "@/lib/actions/attendance-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Select, Button, EmptyState } from "@/components/ui";
import { SubscriptionProgress } from "@/components/subscription-progress";
import { SubscriptionFormFields } from "@/components/subscription-form-fields";
import { EditSubscriptionFields } from "@/components/edit-subscription-fields";
import { PastSubscriptionFields } from "@/components/past-subscription-fields";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { EnrollBatchFields } from "@/components/enroll-batch-fields";
import { subscriptionTotals, countUsedClasses, attendanceForSubscription } from "@/lib/subscription";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  PENDING: "yellow",
  PARTIAL: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
};

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      guardians: { include: { user: true } },
      enrollments: {
        include: {
          batch: { include: { course: true, teacher: true } },
        },
        orderBy: { startDate: "desc" },
      },
      attendance: {
        orderBy: { date: "desc" },
      },
      subscriptions: {
        include: { bonusGrants: true, course: true },
        orderBy: { createdAt: "desc" },
      },
      invoices: { orderBy: { issueDate: "desc" }, include: { payments: true } },
      feedback: { orderBy: { date: "desc" }, take: 10, include: { teacher: true } },
    },
  });

  if (!student) notFound();

  const batches = await prisma.batch.findMany({ include: { course: true }, orderBy: { name: "asc" } });

  const enrolledBatchIds = new Set(student.enrollments.map((e) => e.batchId));
  const enrolledCourseIds = new Set(student.enrollments.map((e) => e.batch.courseId));
  const allAvailableBatches = batches
    .filter((b) => !enrolledBatchIds.has(b.id))
    .map((b) => ({ id: b.id, courseId: b.courseId, courseName: b.course.name, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime }));

  // The global "Add a batch" form is only for instruments the student has
  // zero enrollments in — adding another day of one they're already in
  // happens inline within that instrument's own card, right next to its
  // existing batches, instead of in a form disconnected from them below.
  const availableBatches = allAvailableBatches.filter((b) => !enrolledCourseIds.has(b.courseId));

  // For editing an existing enrollment: other day/time slots of the SAME
  // instrument the student isn't already in, plus its own current batch.
  function editableBatchesFor(courseId: string, currentBatchId: string) {
    return batches.filter((b) => b.courseId === courseId && (b.id === currentBatchId || !enrolledBatchIds.has(b.id)));
  }

  const courseIdsWithActiveSubscription = student.subscriptions.filter((s) => s.status === "ACTIVE").map((s) => s.courseId);

  // Group enrollments by course — a subscription pools across every batch
  // (day-slot) the student attends for that instrument.
  const courseGroups = new Map<string, { courseName: string; enrollments: typeof student.enrollments }>();
  for (const e of student.enrollments) {
    const key = e.batch.courseId;
    if (!courseGroups.has(key)) courseGroups.set(key, { courseName: e.batch.course.name, enrollments: [] });
    courseGroups.get(key)!.enrollments.push(e);
  }

  return (
    <div>
      <PageHeader
        title={student.name}
        subtitle={`${student.studentCode} · ${student.phone ?? "No phone"}${student.email ? " · " + student.email : ""} · Joined ${format(student.joinDate, "d MMM yyyy")}`}
        action={
          <form action={async () => {
            "use server";
            await updateStudentStatus(student.id, student.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
          }}>
            <Button type="submit" variant="secondary">
              Mark {student.status === "ACTIVE" ? "Inactive" : "Active"}
            </Button>
          </form>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Enrollments & subscriptions"
              action={<Badge color={student.status === "ACTIVE" ? "green" : "slate"}>{student.status}</Badge>}
            />
            {courseGroups.size === 0 ? (
              <CardBody>
                <EmptyState text="Not enrolled in any batch yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {Array.from(courseGroups.entries()).map(([courseId, group]) => {
                  const courseSubscriptions = student.subscriptions.filter((s) => s.courseId === courseId);
                  const activeSubscription = courseSubscriptions.find((s) => s.status === "ACTIVE");
                  const pastSubscriptions = courseSubscriptions.filter((s) => s.status !== "ACTIVE");
                  const pooledAttendance = student.attendance.filter((a) => a.courseId === courseId);
                  const activeRemaining = activeSubscription
                    ? subscriptionTotals(
                        activeSubscription,
                        countUsedClasses(attendanceForSubscription(activeSubscription.startDate, pooledAttendance))
                      ).remaining
                    : undefined;

                  return (
                    <li key={courseId} className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900 mb-2">{group.courseName}</p>

                      <ul className="space-y-2 mb-3">
                        {group.enrollments.map((e) => (
                          <li key={e.id} className="bg-slate-50 rounded-md px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <Link href={`/admin/batches/${e.batchId}`} className="text-sm text-slate-900 hover:text-indigo-600">
                                  {DAY_LABELS[e.batch.dayOfWeek]} · {formatTimeLabel(e.batch.startTime)} - {formatTimeLabel(e.batch.endTime)}
                                </Link>
                                <p className="text-xs text-slate-500">{e.batch.teacher?.name ?? "Unassigned"}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                <Badge color={e.status === "ACTIVE" ? "green" : "slate"}>{e.status}</Badge>
                                {e.status === "ACTIVE" ? (
                                  <>
                                    <form action={async () => { "use server"; await updateEnrollmentStatus(e.id, student.id, "PAUSED"); }}>
                                      <Button type="submit" variant="ghost">Pause</Button>
                                    </form>
                                    <form action={async () => { "use server"; await updateEnrollmentStatus(e.id, student.id, "COMPLETED"); }}>
                                      <Button type="submit" variant="ghost">Complete</Button>
                                    </form>
                                  </>
                                ) : e.status === "PAUSED" ? (
                                  <form action={async () => { "use server"; await updateEnrollmentStatus(e.id, student.id, "ACTIVE"); }}>
                                    <Button type="submit" variant="ghost">Resume</Button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <details className="text-xs" key={e.batchId}>
                                <summary className="text-indigo-600 hover:underline cursor-pointer list-none">Edit</summary>
                                <form action={updateEnrollmentBatch.bind(null, e.id, student.id)} className="flex items-end gap-2 mt-2">
                                  <div className="flex-1 min-w-[10rem]">
                                    <Select label="Day / time" name="batchId" defaultValue={e.batchId}>
                                      {editableBatchesFor(e.batch.courseId, e.batchId).map((b) => (
                                        <option key={b.id} value={b.id}>
                                          {DAY_LABELS[b.dayOfWeek]} · {formatTimeLabel(b.startTime)} - {formatTimeLabel(b.endTime)}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  <Button type="submit" variant="secondary">Save</Button>
                                </form>
                              </details>
                              <form action={deleteEnrollment.bind(null, e.id, student.id)}>
                                <Button type="submit" variant="ghost">Delete</Button>
                              </form>
                            </div>
                          </li>
                        ))}
                      </ul>

                      {allAvailableBatches.some((b) => b.courseId === courseId) && (
                        <details className="mb-3" key={`${courseId}-${group.enrollments.length}`}>
                          <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">
                            + Add another day for {group.courseName}
                          </summary>
                          <form action={enrollInBatch.bind(null, student.id)} className="mt-2">
                            <EnrollBatchFields
                              batches={allAvailableBatches.filter((b) => b.courseId === courseId)}
                              courseIdsWithActiveSubscription={courseIdsWithActiveSubscription}
                              defaultStartDate={format(new Date(), "yyyy-MM-dd")}
                              lockedCourseId={courseId}
                            />
                          </form>
                        </details>
                      )}

                      {activeSubscription ? (
                        <div className="bg-slate-50 rounded-md p-3 mb-2">
                          <SubscriptionProgress subscription={activeSubscription} attendance={pooledAttendance} />
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                          No active subscription — add one below to start tracking classes.
                        </p>
                      )}

                      <form className="flex items-end gap-2 mb-2">
                        <div className="flex-1 max-w-[10rem]">
                          <Input label="Mark attendance for a date" name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required />
                        </div>
                        <Button type="submit" variant="secondary" formAction={markAttendanceOnDateAsAdmin.bind(null, student.id, courseId)}>
                          Mark present
                        </Button>
                        <Button type="submit" variant="ghost" formAction={removeAttendanceOnDateAsAdmin.bind(null, student.id, courseId)}>
                          Remove
                        </Button>
                      </form>

                      {pooledAttendance.length > 0 && (
                        <details className="mb-2">
                          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                            {pooledAttendance.length} class{pooledAttendance.length !== 1 ? "es" : ""} recorded
                          </summary>
                          <ul className="mt-2 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                            {pooledAttendance.map((a) => (
                              <li key={a.id} className="py-1.5 flex items-center justify-between text-sm gap-2">
                                <span className="text-slate-600">{format(a.date, "d MMM yyyy")}</span>
                                <div className="flex items-center gap-2">
                                  <Badge color={a.status === "PRESENT" ? "green" : "red"}>{a.status}</Badge>
                                  <form action={removeAttendanceOnDateAsAdmin.bind(null, student.id, courseId)}>
                                    <input type="hidden" name="date" value={format(a.date, "yyyy-MM-dd")} />
                                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                                  </form>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {pastSubscriptions.length > 0 && (
                        <details className="mb-2">
                          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                            {pastSubscriptions.length} past subscription{pastSubscriptions.length !== 1 ? "s" : ""}
                          </summary>
                          <ul className="mt-2 space-y-2">
                            {pastSubscriptions.map((s) => (
                              <li key={s.id} className="bg-slate-50 rounded-md p-3">
                                <SubscriptionProgress subscription={s} attendance={pooledAttendance} />
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <details className="mb-2" key={`past-${pastSubscriptions.length}`}>
                        <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">+ Add a past subscription</summary>
                        <p className="text-xs text-slate-400 mt-1 mb-2 max-w-sm">
                          For a cycle that already ended before it was entered here — logs its own plan, dates, and completed count without touching the current subscription.
                        </p>
                        <form action={addPastSubscription.bind(null, student.id, courseId)} className="space-y-3 max-w-sm">
                          <PastSubscriptionFields />
                          <Button type="submit" variant="secondary" className="w-full">Add past subscription</Button>
                        </form>
                      </details>

                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {activeSubscription && (
                          <>
                            <details className="inline-block" key={activeSubscription.bonusGrants.length}>
                              <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">+ Add bonus classes</summary>
                              <form action={addBonusClasses.bind(null, activeSubscription.id, student.id)} className="flex items-end gap-2 mt-2">
                                <div className="w-24">
                                  <Input label="Classes" name="classes" type="number" min="1" required />
                                </div>
                                <div className="flex-1">
                                  <Input label="Reason" name="reason" placeholder="e.g. Diwali offer" />
                                </div>
                                <Button type="submit" variant="secondary">Add</Button>
                              </form>
                            </details>
                            <details className="inline-block">
                              <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">Edit subscription</summary>
                              <form action={updateSubscription.bind(null, activeSubscription.id, student.id)} className="mt-2 space-y-3 max-w-sm">
                                <EditSubscriptionFields subscription={activeSubscription} />
                                <Button type="submit" variant="secondary" className="w-full">Save changes</Button>
                              </form>
                            </details>
                            <form action={cancelSubscription.bind(null, activeSubscription.id, student.id)}>
                              <ConfirmSubmitButton confirmMessage="Cancel this subscription? This freezes it immediately at today's usage and can't be undone.">
                                Cancel subscription
                              </ConfirmSubmitButton>
                            </form>
                          </>
                        )}
                      </div>

                      <details className="mb-1" key={activeSubscription?.id ?? `new-${courseId}`}>
                        <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">
                          {activeSubscription ? "Renew / change subscription" : "Add subscription"}
                        </summary>
                        <form action={createOrRenewSubscription.bind(null, student.id, courseId)} className="mt-2 space-y-3 max-w-sm">
                          <SubscriptionFormFields defaultStartDate={format(new Date(), "yyyy-MM-dd")} currentRemaining={activeRemaining} />
                          <Button type="submit" className="w-full">
                            {activeSubscription ? "Renew subscription" : "Start subscription"}
                          </Button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
            {availableBatches.length > 0 && (
              <CardBody className="border-t border-slate-100">
                <p className="text-sm font-medium text-slate-700 mb-2">Enroll in a new instrument</p>
                <form action={enrollInBatch.bind(null, student.id)} key={enrolledCourseIds.size}>
                  <EnrollBatchFields
                    batches={availableBatches}
                    courseIdsWithActiveSubscription={courseIdsWithActiveSubscription}
                    defaultStartDate={format(new Date(), "yyyy-MM-dd")}
                  />
                </form>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Billing" action={<Link href={`/admin/billing/new?studentId=${student.id}`} className="text-sm text-indigo-600 hover:underline">New invoice</Link>} />
            {student.invoices.length === 0 ? (
              <CardBody>
                <EmptyState text="No invoices raised yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.invoices.map((inv) => {
                  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                  return (
                    <li key={inv.id}>
                      <Link href={`/admin/billing/${inv.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{inv.invoiceNumber}</p>
                          <p className="text-xs text-slate-500">Due {format(inv.dueDate, "d MMM yyyy")} · Rs. {paid.toLocaleString("en-IN")} of {inv.total.toLocaleString("en-IN")} paid</p>
                        </div>
                        <Badge color={statusColors[inv.status]}>{inv.status}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Teacher feedback" />
            {student.feedback.length === 0 ? (
              <CardBody>
                <EmptyState text="No feedback recorded yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.feedback.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <p className="text-sm text-slate-900">{f.note}</p>
                    <p className="text-xs text-slate-400 mt-1">{f.teacher?.name ?? "Teacher"} · {format(f.date, "d MMM yyyy")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Guardians, parents & self" subtitle="Adult students can link their own account too" />
            {student.guardians.length === 0 ? (
              <CardBody>
                <EmptyState text="No guardian linked yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.guardians.map((g) => (
                  <li key={g.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{g.user.name}</p>
                      <p className="text-xs text-slate-500">{g.relation} · {g.user.email}</p>
                    </div>
                    <form action={removeGuardian.bind(null, student.id, g.userId)}>
                      <Button type="submit" variant="ghost">Remove</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <CardBody className="border-t border-slate-100">
              <form action={addGuardian.bind(null, student.id)} className="space-y-3">
                <Input label="Guardian name" name="name" required />
                <Input label="Email (used for login)" name="email" type="email" required />
                <Input label="Phone" name="phone" />
                <Select label="Relation" name="relation" defaultValue="Mother">
                  <option value="Mother">Mother</option>
                  <option value="Father">Father</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Self">Self (adult student)</option>
                </Select>
                <p className="text-xs text-slate-400">
                  For adult students, use &quot;Self&quot; with their own email/phone so they log in directly.
                  New logins get password &quot;password123&quot; — ask them to sign in and note it down.
                </p>
                <Button type="submit" variant="secondary" className="w-full">Link guardian</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
