"use client";

import { useMemo, useState } from "react";

type Student = { id: string; name: string; studentCode: string };
type MarkAction = (studentId: string, courseId: string, dateStr: string) => Promise<void>;

const MAX_RESULTS = 8;

export function AttendanceCompSearch({
  addableStudents,
  courseId,
  dateStr,
  markAction,
}: {
  addableStudents: Student[];
  courseId: string;
  dateStr: string;
  markAction: MarkAction;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return addableStudents
      .filter((s) => s.name.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, addableStudents]);

  if (addableStudents.length === 0) return null;

  return (
    <div className="relative">
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Add a student (reschedule / comp class)</span>
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
                <form action={markAction.bind(null, s.id, courseId, dateStr)}>
                  <button
                    type="submit"
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50"
                  >
                    <span className="text-slate-900">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.studentCode}</span>
                  </button>
                </form>
              </li>
            ))
          )}
          {addableStudents.length > MAX_RESULTS && matches.length === MAX_RESULTS && (
            <li className="px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100">Keep typing to narrow down further</li>
          )}
        </ul>
      )}
    </div>
  );
}
