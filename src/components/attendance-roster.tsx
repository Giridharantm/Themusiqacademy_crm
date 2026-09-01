import { Badge } from "@/components/ui";
import { AttendanceCompSearch } from "@/components/attendance-comp-search";

type Student = { id: string; name: string };
type MarkAction = (studentId: string, courseId: string, dateStr: string) => Promise<void>;

function StudentRow({
  student,
  marked,
  courseId,
  dateStr,
  markAction,
  unmarkAction,
  tag,
}: {
  student: Student;
  marked: boolean;
  courseId: string;
  dateStr: string;
  markAction: MarkAction;
  unmarkAction: MarkAction;
  tag?: string;
}) {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-900">{student.name}</span>
        {tag && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{tag}</span>}
      </div>
      {marked ? (
        <div className="flex items-center gap-2">
          <Badge color="green">Present</Badge>
          <form action={unmarkAction.bind(null, student.id, courseId, dateStr)}>
            <button type="submit" className="text-xs text-slate-400 hover:text-red-600">Unmark</button>
          </form>
        </div>
      ) : (
        <form action={markAction.bind(null, student.id, courseId, dateStr)}>
          <button type="submit" className="text-xs px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
            Mark present
          </button>
        </form>
      )}
    </li>
  );
}

export function AttendanceRoster({
  courseId,
  dateStr,
  batchGroups,
  otherStudents,
  addableStudents,
  markedCount,
  totalCount,
  markAction,
  unmarkAction,
}: {
  courseId: string;
  dateStr: string;
  batchGroups: { batchId: string; label: string; students: (Student & { marked: boolean })[] }[];
  otherStudents: (Student & { marked: boolean })[];
  addableStudents: (Student & { studentCode: string })[];
  markedCount: number;
  totalCount: number;
  markAction: MarkAction;
  unmarkAction: MarkAction;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Mark students present as they arrive — no need to do the whole class at once.</p>
        <Badge color={totalCount > 0 && markedCount === totalCount ? "green" : markedCount > 0 ? "yellow" : "slate"}>
          {markedCount} of {totalCount} marked
        </Badge>
      </div>

      {batchGroups.length === 0 && otherStudents.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No students scheduled — use search below to add someone</p>
      ) : (
        batchGroups.map((group) => {
          const groupMarked = group.students.filter((s) => s.marked).length;
          return (
            <div key={group.batchId}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700">{group.label}</p>
                <span className="text-xs text-slate-400">{groupMarked} of {group.students.length} marked</span>
              </div>
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                {group.students.map((s) => (
                  <StudentRow
                    key={s.id}
                    student={s}
                    marked={s.marked}
                    courseId={courseId}
                    dateStr={dateStr}
                    markAction={markAction}
                    unmarkAction={unmarkAction}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {otherStudents.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-1.5">Other students (reschedule / comp)</p>
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
            {otherStudents.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                marked={s.marked}
                courseId={courseId}
                dateStr={dateStr}
                markAction={markAction}
                unmarkAction={unmarkAction}
                tag="comp"
              />
            ))}
          </ul>
        </div>
      )}

      <AttendanceCompSearch addableStudents={addableStudents} courseId={courseId} dateStr={dateStr} markAction={markAction} />
    </div>
  );
}
