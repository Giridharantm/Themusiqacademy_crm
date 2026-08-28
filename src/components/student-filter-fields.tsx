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
      className="flex-1 min-w-[10rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const RENEWAL_OPTIONS: Option[] = [
  { value: "this-month", label: "Renewing this month" },
  { value: "soon", label: "Renew soon (≤ 2 left)" },
  { value: "due", label: "Renewal overdue" },
];

const SORT_OPTIONS: Option[] = [
  { value: "joined", label: "Newest joined" },
  { value: "renewal", label: "Renewal date (soonest)" },
  { value: "remaining", label: "Classes remaining (fewest)" },
];

// Filters and sort are all query-param driven and combine freely (unlike a
// row of single-select pills) — meant to stay usable once the student list
// is in the hundreds, where scrolling to eyeball who needs a renewal isn't
// practical.
export function StudentFilterFields({
  courseOptions,
  selectedStatus,
  selectedCourseId,
  selectedRenewal,
  selectedSort,
}: {
  courseOptions: Option[];
  selectedStatus?: string;
  selectedCourseId?: string;
  selectedRenewal?: string;
  selectedSort?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 w-full">
      <AutoSubmitSelect
        name="status"
        value={selectedStatus}
        options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]}
        placeholder="All statuses"
      />
      <AutoSubmitSelect name="courseId" value={selectedCourseId} options={courseOptions} placeholder="All instruments" />
      <AutoSubmitSelect name="renewal" value={selectedRenewal} options={RENEWAL_OPTIONS} placeholder="All renewal states" />
      <AutoSubmitSelect name="sort" value={selectedSort} options={SORT_OPTIONS} placeholder="Sort: Name (A-Z)" />
    </div>
  );
}
