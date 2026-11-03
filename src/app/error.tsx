"use client";

import { PixelButton, PixelFrame } from "@/components/pixel-frame";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <PixelFrame className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <p className="text-base text-ink">菜单没能打开。</p>
          <PixelButton type="button" onClick={() => reset()}>
            重试
          </PixelButton>
        </div>
      </PixelFrame>
    </main>
  );
}
