import { PixelFrame } from "@/components/pixel-frame";

export function EmptyMenu({ message }: { message: string }) {
  return (
    <PixelFrame className="mx-auto w-full max-w-md">
      <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
        <div className="pixel-boat" data-asset="empty-boat" aria-hidden="true">
          <div className="pixel-boat-sail" />
          <div className="pixel-boat-hull" />
        </div>
        <p className="text-sm text-balance text-ink sm:text-base">{message}</p>
      </div>
    </PixelFrame>
  );
}
