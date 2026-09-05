"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextStudentCode } from "@/lib/students";

export async function createLead(formData: FormData) {
  const user = await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "OTHER") as "CALL" | "WALK_IN" | "REFERRAL" | "ONLINE" | "OTHER";
  const interestedCourseId = String(formData.get("interestedCourseId") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !phone) throw new Error("Name and phone are required");

  await prisma.lead.create({
    data: {
      name,
      phone,
      email,
      source,
      interestedCourseId,
      notes,
      assignedToId: user.id,
    },
  });

  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}

export async function updateLeadStatus(leadId: string, status: string) {
  await requireRole("ADMIN");
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: status as "NEW" | "CONTACTED" | "TRIAL_SCHEDULED" | "TRIAL_COMPLETED" | "CONVERTED" | "LOST" },
  });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

export async function changeLeadStatus(leadId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "");
  await updateLeadStatus(leadId, status);
}

export async function updateLead(leadId: string, formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "OTHER") as "CALL" | "WALK_IN" | "REFERRAL" | "ONLINE" | "OTHER";
  const interestedCourseId = String(formData.get("interestedCourseId") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !phone) throw new Error("Name and phone are required");

  await prisma.lead.update({
    where: { id: leadId },
    data: { name, phone, email, source, interestedCourseId, notes },
  });

  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}

export async function addFollowUp(leadId: string, formData: FormData) {
  const user = await requireRole("ADMIN");

  const note = String(formData.get("note") ?? "").trim();
  const followUpDateRaw = String(formData.get("followUpDate") ?? "");
  if (!note) throw new Error("Note is required");

  await prisma.followUp.create({
    data: {
      leadId,
      note,
      followUpDate: followUpDateRaw ? new Date(followUpDateRaw) : new Date(),
      createdById: user.id,
    },
  });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (lead && lead.status === "NEW") {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
  }

  revalidatePath(`/admin/leads/${leadId}`);
}

// Called after the admin reviews and confirms the pre-filled conversion form
// (name/phone/email/instrument/etc, all editable) — never happens on a
// single click. Any corrections made here are also saved back onto the lead
// record, so it stays the accurate source of what was actually verified.
export async function convertLeadToStudent(leadId: string, formData: FormData) {
  await requireRole("ADMIN");

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");

  const name = String(formData.get("name") ?? lead.name).trim();
  const phone = String(formData.get("phone") ?? lead.phone).trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const interestedCourseId = String(formData.get("interestedCourseId") ?? "") || null;
  const dobRaw = String(formData.get("dob") ?? "");
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!name || !phone) throw new Error("Name and phone are required");

  // One transaction: if student creation fails (e.g. a code collision), the
  // lead must not be left stuck marked CONVERTED with no student attached.
  const student = await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { name, phone, email, interestedCourseId, status: "CONVERTED" },
    });

    return tx.student.create({
      data: {
        studentCode: await nextStudentCode(),
        name,
        dob: dobRaw ? new Date(dobRaw) : null,
        gender,
        phone,
        email,
        address,
        leadId: lead.id,
      },
    });
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/students");
  redirect(`/admin/students/${student.id}`);
}

export async function deleteLead(leadId: string) {
  await requireRole("ADMIN");
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}
