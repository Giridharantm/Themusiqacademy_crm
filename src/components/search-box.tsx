export function SearchBox({
  placeholder = "Search...",
  defaultValue,
  extraParams,
}: {
  placeholder?: string;
  defaultValue?: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" className="flex items-center gap-2 min-w-0">
      {extraParams &&
        Object.entries(extraParams)
          .filter(([, v]) => v)
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full min-w-[9rem] sm:w-64 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center px-3.5 py-2 rounded-md text-sm font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
      >
        Search
      </button>
    </form>
  );
}
