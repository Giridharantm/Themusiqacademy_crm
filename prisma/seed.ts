import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { splitGst } from "../src/lib/billing";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@musiqacademy.test" },
    update: {},
    create: {
      name: "Academy Admin",
      email: "admin@musiqacademy.test",
      passwordHash: password,
      role: "ADMIN",
      phone: "9000000001",
    },
  });

  const teacherGuitarViolin = await prisma.user.upsert({
    where: { email: "teacher.ravi@musiqacademy.test" },
    update: {},
    create: {
      name: "Ravi Kumar",
      email: "teacher.ravi@musiqacademy.test",
      passwordHash: password,
      role: "TEACHER",
      phone: "9000000002",
    },
  });

  const teacherKeyboardVocals = await prisma.user.upsert({
    where: { email: "teacher.anjali@musiqacademy.test" },
    update: {},
    create: {
      name: "Anjali Nair",
      email: "teacher.anjali@musiqacademy.test",
      passwordHash: password,
      role: "TEACHER",
      phone: "9000000003",
    },
  });

  const teacherCarnaticHindustani = await prisma.user.upsert({
    where: { email: "teacher.lakshmi@musiqacademy.test" },
    update: {},
    create: {
      name: "Lakshmi Iyer",
      email: "teacher.lakshmi@musiqacademy.test",
      passwordHash: password,
      role: "TEACHER",
      phone: "9000000004",
    },
  });

  const teacherDrums = await prisma.user.upsert({
    where: { email: "teacher.arun@musiqacademy.test" },
    update: {},
    create: {
      name: "Arun Das",
      email: "teacher.arun@musiqacademy.test",
      passwordHash: password,
      role: "TEACHER",
      phone: "9000000005",
    },
  });

  const parent1 = await prisma.user.upsert({
    where: { email: "parent.sharma@musiqacademy.test" },
    update: {},
    create: {
      name: "Deepa Sharma",
      email: "parent.sharma@musiqacademy.test",
      passwordHash: password,
      role: "PARENT",
      phone: "9000000006",
    },
  });

  const courseDefs = [
    { id: "course-guitar", name: "Guitar" },
    { id: "course-keyboard", name: "Keyboard" },
    { id: "course-drums", name: "Drums" },
    { id: "course-western-vocals", name: "Western Vocals" },
    { id: "course-carnatic-vocals", name: "Carnatic Vocals" },
    { id: "course-hindustani-vocals", name: "Hindustani Vocals" },
    { id: "course-violin", name: "Violin" },
  ];

  const courses: Record<string, Awaited<ReturnType<typeof prisma.course.upsert>>> = {};
  for (const c of courseDefs) {
    courses[c.id] = await prisma.course.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        name: c.name,
        description: `${c.name} lessons for all skill levels`,
        durationMinutes: 60,
      },
    });
  }

  // Schedule: Monday holiday. Tue-Fri 3pm-9pm, Sat 2pm-8pm, Sun 11am-5pm.
  // Every batch is one instrument + one day + one 1-hour slot. Guitar runs
  // twice a week (Tue + Thu) to demonstrate a student attending the same
  // instrument across multiple batches, pooled under one subscription.
  const batchDefs = [
    { id: "batch-guitar-tue", name: "Guitar - Tuesday - 5:00 PM", courseId: "course-guitar", teacherId: teacherGuitarViolin.id, day: "TUE", startTime: "17:00", endTime: "18:00", room: "Room 1" },
    { id: "batch-guitar-thu", name: "Guitar - Thursday - 5:00 PM", courseId: "course-guitar", teacherId: teacherGuitarViolin.id, day: "THU", startTime: "17:00", endTime: "18:00", room: "Room 1" },
    { id: "batch-violin-tue", name: "Violin - Tuesday - 7:00 PM", courseId: "course-violin", teacherId: teacherGuitarViolin.id, day: "TUE", startTime: "19:00", endTime: "20:00", room: "Room 1" },
    { id: "batch-keyboard-tue", name: "Keyboard - Tuesday - 4:00 PM", courseId: "course-keyboard", teacherId: teacherKeyboardVocals.id, day: "TUE", startTime: "16:00", endTime: "17:00", room: "Room 2" },
    { id: "batch-western-vocals-tue", name: "Western Vocals - Tuesday - 3:00 PM", courseId: "course-western-vocals", teacherId: teacherKeyboardVocals.id, day: "TUE", startTime: "15:00", endTime: "16:00", room: "Room 2" },
    { id: "batch-drums-tue", name: "Drums - Tuesday - 6:00 PM", courseId: "course-drums", teacherId: teacherDrums.id, day: "TUE", startTime: "18:00", endTime: "19:00", room: "Room 3" },
    { id: "batch-carnatic-sat", name: "Carnatic Vocals - Saturday - 2:00 PM", courseId: "course-carnatic-vocals", teacherId: teacherCarnaticHindustani.id, day: "SAT", startTime: "14:00", endTime: "15:00", room: "Room 1" },
    { id: "batch-hindustani-sun", name: "Hindustani Vocals - Sunday - 11:00 AM", courseId: "course-hindustani-vocals", teacherId: teacherCarnaticHindustani.id, day: "SUN", startTime: "11:00", endTime: "12:00", room: "Room 1" },
  ];

  const batches: Record<string, Awaited<ReturnType<typeof prisma.batch.upsert>>> = {};
  for (const b of batchDefs) {
    batches[b.id] = await prisma.batch.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        name: b.name,
        courseId: b.courseId,
        teacherId: b.teacherId,
        dayOfWeek: b.day,
        startTime: b.startTime,
        endTime: b.endTime,
        room: b.room,
      },
    });
  }

  const student1 = await prisma.student.upsert({
    where: { id: "student-arjun" },
    update: {},
    create: {
      id: "student-arjun",
      studentCode: "STUD-00001",
      name: "Arjun Sharma",
      dob: new Date("2014-05-12"),
      gender: "Male",
      phone: "9000000006",
      email: "parent.sharma@musiqacademy.test",
      joinDate: new Date("2026-01-15"),
      status: "ACTIVE",
    },
  });

  await prisma.studentGuardian.upsert({
    where: { studentId_userId: { studentId: student1.id, userId: parent1.id } },
    update: {},
    create: {
      studentId: student1.id,
      userId: parent1.id,
      relation: "Mother",
    },
  });

  // Arjun attends Guitar twice a week — Tuesday AND Thursday — as two
  // separate batch enrollments sharing one pooled Guitar subscription.
  const enrollmentTue = await prisma.enrollment.upsert({
    where: { studentId_batchId: { studentId: student1.id, batchId: batches["batch-guitar-tue"].id } },
    update: {},
    create: {
      studentId: student1.id,
      batchId: batches["batch-guitar-tue"].id,
      startDate: new Date("2026-01-15"),
      status: "ACTIVE",
    },
  });
  const enrollmentThu = await prisma.enrollment.upsert({
    where: { studentId_batchId: { studentId: student1.id, batchId: batches["batch-guitar-thu"].id } },
    update: {},
    create: {
      studentId: student1.id,
      batchId: batches["batch-guitar-thu"].id,
      startDate: new Date("2026-01-15"),
      status: "ACTIVE",
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Most recent occurrence of a weekday (JS getDay() index) on/before `base`,
  // then step back further by `occurrencesAgo` full weeks.
  function pastWeekday(base: Date, dayIndex: number, occurrencesAgo: number) {
    const d = new Date(base);
    const diff = (d.getDay() - dayIndex + 7) % 7;
    d.setDate(d.getDate() - diff - occurrencesAgo * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Simulate a near-complete 3-month / 24-class subscription pooled across
  // both batches: 12 Tuesday + 12 Thursday sessions over ~12 weeks, 2 missed.
  // Since absences don't consume a class, that's 22 used out of 24 — 2
  // remaining, due for renewal.
  const tueDates = Array.from({ length: 12 }, (_, i) => pastWeekday(today, 2, 11 - i));
  const thuDates = Array.from({ length: 12 }, (_, i) => pastWeekday(today, 4, 11 - i));
  const subscriptionStart = tueDates[0] < thuDates[0] ? tueDates[0] : thuDates[0];

  // This window is relative to "today", so it shifts on every reseed run on a
  // later date — prune whatever rolled out of it first, or reseeding on
  // different days keeps accumulating stray rows beyond the intended 24.
  await prisma.attendance.deleteMany({
    where: {
      studentId: student1.id,
      courseId: courses["course-guitar"].id,
      date: { notIn: [...tueDates, ...thuDates] },
    },
  });

  await prisma.subscription.upsert({
    where: { id: "sub-arjun-guitar-1" },
    update: {},
    create: {
      id: "sub-arjun-guitar-1",
      studentId: student1.id,
      courseId: courses["course-guitar"].id,
      plan: "THREE_MONTHS",
      baseClasses: 24,
      startDate: subscriptionStart,
      endDate: new Date(subscriptionStart.getFullYear(), subscriptionStart.getMonth() + 3, subscriptionStart.getDate()),
      status: "ACTIVE",
    },
  });

  const tueAbsentIndexes = new Set([3]);
  const thuAbsentIndexes = new Set([9]);

  for (let i = 0; i < tueDates.length; i++) {
    const status: "PRESENT" | "ABSENT" = tueAbsentIndexes.has(i) ? "ABSENT" : "PRESENT";
    await prisma.attendance.upsert({
      where: { studentId_courseId_date: { studentId: student1.id, courseId: courses["course-guitar"].id, date: tueDates[i] } },
      update: {},
      create: { studentId: student1.id, courseId: courses["course-guitar"].id, date: tueDates[i], status, markedById: teacherGuitarViolin.id },
    });
  }
  for (let i = 0; i < thuDates.length; i++) {
    const status: "PRESENT" | "ABSENT" = thuAbsentIndexes.has(i) ? "ABSENT" : "PRESENT";
    await prisma.attendance.upsert({
      where: { studentId_courseId_date: { studentId: student1.id, courseId: courses["course-guitar"].id, date: thuDates[i] } },
      update: {},
      create: { studentId: student1.id, courseId: courses["course-guitar"].id, date: thuDates[i], status, markedById: teacherGuitarViolin.id },
    });
  }

  await prisma.homework.upsert({
    where: { id: "hw-guitar-1" },
    update: {},
    create: {
      id: "hw-guitar-1",
      batchId: batches["batch-guitar-tue"].id,
      teacherId: teacherGuitarViolin.id,
      title: "Practice C major and G major chords",
      description: "20 minutes daily, focus on clean transitions between chords.",
      dueDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.feedback.upsert({
    where: { id: "fb-arjun-1" },
    update: {},
    create: {
      id: "fb-arjun-1",
      studentId: student1.id,
      teacherId: teacherGuitarViolin.id,
      note: "Arjun is progressing well with chord transitions. Needs to work on strumming rhythm consistency.",
    },
  });

  const invoice1 = await prisma.invoice.upsert({
    where: { invoiceNumber: "INV-0001" },
    update: {},
    create: {
      invoiceNumber: "INV-0001",
      studentId: student1.id,
      dueDate: new Date(today.getFullYear(), today.getMonth(), 10),
      periodStart: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      periodEnd: new Date(today.getFullYear(), today.getMonth() - 1, 28),
      discount: 0,
      ...splitGst(2500),
      total: 2500,
      status: "PAID",
      items: {
        create: [{ description: "Guitar (Monthly fee)", amount: 2500 }],
      },
      payments: {
        create: [{ amount: 2500, method: "UPI" }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { invoiceNumber: "INV-0002" },
    update: {},
    create: {
      invoiceNumber: "INV-0002",
      studentId: student1.id,
      dueDate: new Date(today.getFullYear(), today.getMonth(), 10),
      periodStart: new Date(today.getFullYear(), today.getMonth(), 1),
      periodEnd: new Date(today.getFullYear(), today.getMonth(), 28),
      discount: 0,
      ...splitGst(2500),
      total: 2500,
      status: "PENDING",
      items: {
        create: [{ description: "Guitar (Monthly fee)", amount: 2500 }],
      },
    },
  });

  await prisma.lead.upsert({
    where: { id: "lead-priya" },
    update: {},
    create: {
      id: "lead-priya",
      name: "Priya Menon",
      phone: "9000000007",
      email: "priya.menon@example.com",
      source: "WALK_IN",
      status: "NEW",
      interestedCourseId: courses["course-keyboard"].id,
      notes: "Walked in asking about keyboard classes for her 8-year-old daughter.",
      assignedToId: admin.id,
      followUps: {
        create: [
          {
            note: "Initial walk-in enquiry, gave brochure and fee details.",
            followUpDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
            createdById: admin.id,
          },
        ],
      },
    },
  });

  await prisma.lead.upsert({
    where: { id: "lead-karthik" },
    update: {},
    create: {
      id: "lead-karthik",
      name: "Karthik Iyer",
      phone: "9000000008",
      source: "CALL",
      status: "TRIAL_SCHEDULED",
      interestedCourseId: courses["course-drums"].id,
      notes: "Called asking about drum batches. Trial scheduled.",
      assignedToId: admin.id,
      followUps: {
        create: [
          {
            note: "Scheduled trial class for Saturday.",
            followUpDate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000),
            createdById: admin.id,
          },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log("Login as admin: admin@musiqacademy.test / password123");
  console.log("Login as teacher: teacher.ravi@musiqacademy.test / password123");
  console.log("Login as parent: parent.sharma@musiqacademy.test / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
