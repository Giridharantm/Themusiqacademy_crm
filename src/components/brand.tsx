import Image from "next/image";

// The academy's emblem and name, set like the logo's lockup: "The Musiq" in
// the display font over a bold gold "ACADEMY" whose letters are spread edge to
// edge, so both lines are exactly the same width (same treatment as the
// marketing website). The letters are decorative — screen readers get the
// plain words.
export function BrandLockup({ large = false }: { large?: boolean }) {
  const size = large ? 64 : 36;
  return (
    <span className="inline-flex shrink-0 items-center gap-3 whitespace-nowrap">
      <Image src={large ? "/logo-emblem-lg.png" : "/logo-emblem.png"} alt="" width={size} height={size} priority />
      <span className="inline-flex flex-col leading-none">
        <span className={`font-display font-bold tracking-[0.04em] text-page ${large ? "text-2xl" : "text-lg"}`}>The Musiq</span>
        <span aria-hidden="true" className={`mt-1.5 flex justify-between font-bold uppercase text-page ${large ? "text-sm" : "text-[0.7rem]"}`}>
          {"ACADEMY".split("").map((letter, i) => (
            <span key={i}>{letter}</span>
          ))}
        </span>
        <span className="sr-only">Academy</span>
      </span>
    </span>
  );
}
