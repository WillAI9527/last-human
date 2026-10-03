import { cn } from "@/lib/utils";

/** Blood-red wax seal with the six-seat mark centred. Replaces award cartoons. */
export function AwardSeal({ className }: { className?: string }) {
  return (
    <span className={cn("lh-award-seal", className)} aria-hidden="true">
      <img src="/brand/mark-transparent.svg" alt="" />
    </span>
  );
}
