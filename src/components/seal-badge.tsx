import { sealRotation } from "@/lib/frames";
import { cn } from "@/lib/utils";

export function SealBadge({
  id,
  label = "推荐",
  decorative = false,
  className,
}: {
  id: string;
  label?: string;
  /** Header ornament. Dish seals stay in the accessibility tree via sr-only text. */
  decorative?: boolean;
  className?: string;
}) {
  const vertical = Array.from(label).length > 1;
  return (
    <>
      <span
        className={cn("seal-badge font-brush", className)}
        style={{ ["--seal-rotate" as string]: `${sealRotation(id)}deg` }}
        aria-hidden="true"
      >
        <span className={cn("seal-word", vertical && "is-vertical")}>
          {label}
        </span>
      </span>
      {decorative ? null : <span className="sr-only">{label}</span>}
    </>
  );
}
