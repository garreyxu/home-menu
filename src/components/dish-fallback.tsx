import { placeholderInitials } from "@/lib/display";
import { BrushRuns } from "@/components/brush-runs";

export function DishFallback({ name }: { name: string }) {
  const initials = placeholderInitials(name);
  return (
    <div
      className="dish-fallback"
      role="img"
      title={name}
      aria-label={`${name}，还没有插画`}
    >
      <svg
        className="dish-fallback-enso"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <path
          d="M50 16c16 1 28 8 32 20 4 12 1 24-8 34-10 11-24 16-38 15-16-1-28-10-34-22-6-13-3-28 8-38 9-8 22-10 40-9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <p className="dish-fallback-name font-brush">
        <BrushRuns text={initials} />
      </p>
    </div>
  );
}
