"use client";

import { useState } from "react";
import { Select } from "@/components/ui";

export type NoticeBatch = {
  id: string;
  label: string; // "4:00 PM · Keyboard"
  teacherId: string | null;
  teacherName: string | null;
};

type Scope = "all" | "teacher" | "batches";

// "Which classes" for a class notice: all of that day's classes, all of one
// teacher's, or ticked ones. The list underneath always shows exactly the
// classes the notice will go to for the choice made above it, so picking a
// teacher narrows it to that teacher's classes straight away (no Preview
// needed). Only the ticked boxes of "specific classes" are posted; the server
// works the same classes out again from the scope and teacher.
export function NoticeClassPicker({
  batches,
  teachers,
  initialScope,
  initialTeacherId,
  initialPicked,
  dateLabel,
}: {
  batches: NoticeBatch[];
  teachers: [string, string][]; // [id, name] of the teachers who have a class that day
  initialScope: Scope;
  initialTeacherId: string;
  initialPicked: string[];
  dateLabel: string;
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPicked));

  const teacherName = teachers.find(([id]) => id === teacherId)?.[1] ?? "this teacher";
  const shown = scope === "teacher" ? batches.filter((b) => b.teacherId === teacherId) : batches;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Specific classes are grouped by teacher so a teacher's classes sit together.
  const groups = Array.from(
    shown.reduce((m, b) => m.set(b.teacherName ?? "No teacher", [...(m.get(b.teacherName ?? "No teacher") ?? []), b]), new Map<string, NoticeBatch[]>())
  );

  return (
    <>
      <Select label="Which classes" name="scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
        <option value="all">All classes that day</option>
        <option value="teacher">All classes of one teacher</option>
        <option value="batches">Specific classes (tick below)</option>
      </Select>

      {scope === "teacher" && teachers.length > 0 && (
        <Select label="Teacher" name="teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          {teachers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-ink mb-1">
          {scope === "all" ? `All classes on ${dateLabel}` : scope === "teacher" ? `${teacherName}'s classes on ${dateLabel}` : `Tick the classes on ${dateLabel}`}
        </legend>
        {batches.length === 0 ? (
          <p className="text-xs text-slate-500">No classes are scheduled on {dateLabel}.</p>
        ) : shown.length === 0 ? (
          <p className="text-xs text-slate-500">
            {teacherName} has no classes on {dateLabel}.
          </p>
        ) : scope === "batches" ? (
          <div className="max-h-56 overflow-y-auto rounded-md border border-line">
            {groups.map(([teacher, list]) => (
              <div key={teacher} className="border-b border-slate-100 last:border-0">
                <p className="bg-panel px-3 py-1.5 text-xs font-medium text-slate-600">{teacher}</p>
                {list.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" name="batchId" value={b.id} checked={picked.has(b.id)} onChange={() => toggle(b.id)} />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ul className="max-h-56 overflow-y-auto rounded-md border border-line divide-y divide-slate-100">
            {shown.map((b) => (
              <li key={b.id} className="px-3 py-2 text-sm">
                {b.label}
                {scope === "all" && <span className="text-slate-500"> · {b.teacherName ?? "No teacher"}</span>}
              </li>
            ))}
          </ul>
        )}
        {scope !== "batches" && shown.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            {shown.length} class{shown.length === 1 ? "" : "es"} will get the notice.
          </p>
        )}
      </fieldset>
    </>
  );
}
