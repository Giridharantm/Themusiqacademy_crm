"use client";

import { useMemo, useState } from "react";

type Student = { id: string; name: string; studentCode?: string };

const MAX_RESULTS = 8;

export function BulkAttendanceFields({
  roster,
  additionalAttendees = [],
  addableStudents,
}: {
  /** Students normally enrolled in this batch. */
  roster: Student[];
  /** Students already recorded present for this batch+date who aren't in the normal roster (comp/reschedule from a previous save) — shown so revisiting a date doesn't hide who was actually marked. */
  additionalAttendees?: Student[];
  /** Other active students of this same instrument who can be added for a comp/reschedule class — only ever searched, never rendered in full. */
  addableStudents: Student[];
}) {
  const [rows, setRows] = useState<Student[]>([...roster, ...additionalAttendees]);
  const [query, setQuery] = useState("");

  const remainingToAdd = useMemo(
    () => addableStudents.filter((s) => !rows.some((r) => r.id === s.id)),
    [addableStudents, rows]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const filtered = remainingToAdd.filter(
      (s) => s.name.toLowerCase().includes(q) || s.studentCode?.toLowerCase().includes(q)
    );
    return filtered.slice(0, MAX_RESULTS);
  }, [query, remainingToAdd]);

  function addStudent(student: Student) {
    setRows((prev) => [...prev, student]);
    setQuery("");
  }

  function removeStudent(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Everyone listed will be marked present when you save — remove anyone who didn&apos;t attend.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No students to mark — add one below</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
          {rows.map((s) => {
            const isComp = !roster.some((r) => r.id === s.id);
            return (
              <li key={s.id} className="flex items-center justify-between px-3 py-2">
                <input type="hidden" name="studentIds" value={s.id} />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-900">{s.name}</span>
                  {isComp && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">comp</span>}
                </div>
                <button type="button" onClick={() => removeStudent(s.id)} className="text-xs text-slate-400 hover:text-red-600">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {remainingToAdd.length > 0 && (
        <div className="relative">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Add a student for this instrument (reschedule / comp class)</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or student ID..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </label>
          {query.trim() !== "" && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-400">No matching students</li>
              ) : (
                matches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => addStudent(s)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50"
                    >
                      <span className="text-slate-900">{s.name}</span>
                      {s.studentCode && <span className="text-xs text-slate-400">{s.studentCode}</span>}
                    </button>
                  </li>
                ))
              )}
              {remainingToAdd.length > MAX_RESULTS && matches.length === MAX_RESULTS && (
                <li className="px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100">Keep typing to narrow down further</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
