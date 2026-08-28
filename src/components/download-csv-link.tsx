import Link from "next/link";
import { Button } from "@/components/ui";

// Renders the same filters the report page is currently showing onto the
// export route's query string, so the download always matches the preview
// exactly — never a stale or differently-filtered set.
export function DownloadCsvLink({ href, params }: { href: string; params: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => !!entry[1])
  ).toString();
  return (
    <Link href={qs ? `${href}?${qs}` : href}>
      <Button type="button" variant="secondary">Download CSV</Button>
    </Link>
  );
}
