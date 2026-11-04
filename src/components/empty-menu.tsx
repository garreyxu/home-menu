import { frameLetter } from "@/lib/frames";

export function EmptyMenu({ message }: { message: string }) {
  return (
    <div
      className={`frame-panel frame-panel-${frameLetter(message)} mx-auto w-full max-w-md`}
    >
      <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
        <svg className="enso-mark" viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M50 14c18 1 30 9 35 22 5 14 1 28-10 38-12 12-28 16-44 14-18-2-30-12-36-26-6-15-2-32 10-42 10-8 26-8 45-6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <p className="section-title font-brush text-balance text-sumi">
          {message}
        </p>
      </div>
    </div>
  );
}
