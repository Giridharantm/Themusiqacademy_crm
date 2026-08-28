"use client";

import { useMemo, useState } from "react";
import { Input, Select, Button } from "@/components/ui";
import { DAY_LABELS, OPERATING_DAYS, formatTimeLabel } from "@/lib/schedule";
import { SubscriptionFormFields } from "@/components/subscription-form-fields";

type BatchOption = {
  id: string;
  courseId: string;
  courseName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

export function EnrollBatchFields({
  batches,
  courseIdsWithActiveSubscription,
  defaultStartDate,
  lockedCourseId,
}: {
  batches: BatchOption[];
  courseIdsWithActiveSubscription: string[];
  defaultStartDate?: string;
  /** Restricts this picker to one instrument and hides the Instrument selector — used for "add another day" inline within a course the student's already enrolled in, so it shows up together with that instrument's existing batches instead of in the separate new-instrument form. */
  lockedCourseId?: string;
}) {
  // A subscription's plan (e.g. 8 classes/month) is usually spread across a
  // couple of day-slots a week — so enrolling should let you queue up every
  // batch for this student before submitting once, rather than a
  // submit-reload-repeat loop per batch.
  const [pending, setPending] = useState<BatchOption[]>([]);
  const [courseId, setCourseId] = useState(lockedCourseId ?? "");
  const [day, setDay] = useState("");
  const [batchId, setBatchId] = useState("");

  const pendingIds = useMemo(() => new Set(pending.map((b) => b.id)), [pending]);
  const selectableBatches = useMemo(() => batches.filter((b) => !pendingIds.has(b.id)), [batches, pendingIds]);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of selectableBatches) map.set(b.courseId, b.courseName);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [selectableBatches]);

  const daysForCourse = useMemo(() => {
    const set = new Set(selectableBatches.filter((b) => b.courseId === courseId).map((b) => b.dayOfWeek));
    return OPERATING_DAYS.filter((d) => set.has(d));
  }, [selectableBatches, courseId]);

  const timesForCourseDay = useMemo(
    () => selectableBatches.filter((b) => b.courseId === courseId && b.dayOfWeek === day),
    [selectableBatches, courseId, day]
  );

  function addBatch() {
    const batch = selectableBatches.find((b) => b.id === batchId);
    if (!batch) return;
    setPending((prev) => [...prev, batch]);
    setDay("");
    setBatchId("");
  }

  function removeBatch(id: string) {
    setPending((prev) => prev.filter((b) => b.id !== id));
  }

  const activeCourseIds = new Set(courseIdsWithActiveSubscription);
  const coursesNeedingSubscription = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of pending) {
      if (!activeCourseIds.has(b.courseId)) map.set(b.courseId, b.courseName);
    }
    return Array.from(map.entries());
  }, [pending, courseIdsWithActiveSubscription]);

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
          {pending.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-900">
                {lockedCourseId ? "" : `${b.courseName} · `}
                {DAY_LABELS[b.dayOfWeek]} · {formatTimeLabel(b.startTime)} - {formatTimeLabel(b.endTime)}
              </span>
              <button type="button" onClick={() => removeBatch(b.id)} className="text-xs text-slate-400 hover:text-red-600">
                Remove
              </button>
              <input type="hidden" name="batchIds" value={b.id} />
            </li>
          ))}
        </ul>
      )}

      {!lockedCourseId && (
        <Select
          label="Instrument"
          name="instrument"
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setDay("");
            setBatchId("");
          }}
        >
          <option value="" disabled>Select an instrument</option>
          {courses.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </Select>
      )}

      <Select
        label="Day"
        name="day"
        value={day}
        disabled={!courseId}
        onChange={(e) => {
          setDay(e.target.value);
          setBatchId("");
        }}
      >
        <option value="" disabled>{courseId ? "Select a day" : "Select an instrument first"}</option>
        {daysForCourse.map((d) => (
          <option key={d} value={d}>{DAY_LABELS[d]}</option>
        ))}
      </Select>

      <Select
        label="Batch time"
        name="batchId"
        value={batchId}
        disabled={!day}
        onChange={(e) => setBatchId(e.target.value)}
      >
        <option value="" disabled>{day ? "Select a time" : "Select a day first"}</option>
        {timesForCourseDay.map((b) => (
          <option key={b.id} value={b.id}>
            {formatTimeLabel(b.startTime)} - {formatTimeLabel(b.endTime)}
          </option>
        ))}
      </Select>

      <Button type="button" variant="secondary" className="w-full" disabled={!batchId} onClick={addBatch}>
        + Add this batch
      </Button>

      <Input label="Start date" name="startDate" type="date" defaultValue={defaultStartDate} />

      {coursesNeedingSubscription.map(([id, name]) => (
        <div key={id} className="border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500 mb-2">
            No active {name} subscription yet — set one up for this enrollment:
          </p>
          <SubscriptionFormFields fieldPrefix={`sub_${id}_`} hideStartDate />
        </div>
      ))}

      <Button type="submit" className="w-full" disabled={pending.length === 0}>
        {pending.length === 0
          ? "Add a batch to enroll"
          : `Enroll in ${pending.length} batch${pending.length !== 1 ? "es" : ""}`}
      </Button>
    </div>
  );
}
