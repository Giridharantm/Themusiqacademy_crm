"use client";

type Option = { value: string; label: string };

function AutoSubmitSelect({
  name,
  value,
  options,
  placeholder,
}: {
  name: string;
  value?: string;
  options: Option[];
  placeholder: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="flex-1 min-w-[8rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function BatchFilterFields({
  courseOptions,
  dayOptions,
  timeOptions,
  selectedCourseId,
  selectedDay,
  selectedTime,
  showTimeFilter = true,
}: {
  courseOptions: Option[];
  dayOptions: Option[];
  timeOptions: Option[];
  selectedCourseId?: string;
  selectedDay?: string;
  selectedTime?: string;
  showTimeFilter?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 w-full">
      <AutoSubmitSelect name="courseId" value={selectedCourseId} options={courseOptions} placeholder="All instruments" />
      <AutoSubmitSelect name="day" value={selectedDay} options={dayOptions} placeholder="All days" />
      {showTimeFilter && <AutoSubmitSelect name="time" value={selectedTime} options={timeOptions} placeholder="All times" />}
    </div>
  );
}
