import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createTeacher } from "@/lib/actions/user-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Button, EmptyState, Badge } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { normalizeSearchQuery, phoneSearchDigits } from "@/lib/search";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = normalizeSearchQuery((await searchParams).q);
  const phoneDigits = q ? phoneSearchDigits(q) : undefined;

  const teachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
            ],
          }
        : {}),
    },
    include: { _count: { select: { batchesTaught: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle="Manage teacher accounts and their assigned batches"
        action={<SearchBox placeholder="Search teachers..." defaultValue={q} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            {teachers.length === 0 ? (
              <CardBody>
                <EmptyState text={q ? "No teachers match your search" : "No teachers added yet"} />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/teachers/${t.id}`} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.email}{t.phone ? " · " + t.phone : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.status === "INACTIVE" && <Badge color="slate">Inactive</Badge>}
                        <Badge>{t._count.batchesTaught} batch{t._count.batchesTaught !== 1 ? "es" : ""}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Add teacher" subtitle="Creates a login for the teacher portal" />
          <CardBody>
            <form action={createTeacherAndRedirect} className="space-y-3">
              <Input label="Name" name="name" required />
              <Input label="Email" name="email" type="email" required />
              <Input label="Phone" name="phone" />
              <Input label="Temporary password" name="password" placeholder="Defaults to password123" />
              <Button type="submit" className="w-full">Add teacher</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

async function createTeacherAndRedirect(formData: FormData) {
  "use server";
  const { redirect } = await import("next/navigation");
  const id = await createTeacher(formData);
  redirect(`/admin/teachers/${id}`);
}
