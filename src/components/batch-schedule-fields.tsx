"use client";

import { useMemo, useState } from "react";
import { OPERATING_DAYS, DAY_LABELS, timeSlotsForDay } from "@/lib/schedule";

export function BatchScheduleFields({
  defaultDay,
  defaultTimeSlot,
}: {
  /** Pre-select a day — used when editing an existing batch. */
  defaultDay?: string;
  /** Pre-select a time slot ("HH:mm|HH:mm") — only takes effect alongside defaultDay. */
  defaultTimeSlot?: string;
} = {}) {
  const [day, setDay] = useState(defaultDay ?? "");

  const slots = useMemo(() => (day ? timeSlotsForDay(day) : []), [day]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Day</span>
        <select
          name="dayOfWeek"
          required
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
        >
          <option value="" disabled>Select a day</option>
          <option value="MON" disabled>Monday (Holiday)</option>
          {OPERATING_DAYS.map((d) => (
            <option key={d} value={d}>{DAY_LABELS[d]}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Time slot (1 hour)</span>
        <select
          name="timeSlot"
          required
          disabled={!day}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400"
          defaultValue={day === defaultDay ? defaultTimeSlot ?? "" : ""}
        >
          <option value="" disabled>
            {day ? "Select a time slot" : "Select a day first"}
          </option>
          {slots.map((slot) => (
            <option key={slot.start} value={`${slot.start}|${slot.end}`}>
              {slot.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
