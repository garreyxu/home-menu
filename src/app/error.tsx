"use client";

import { StampButton } from "@/components/stamp-button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="frame-panel frame-panel-b w-full max-w-md">
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <p className="text-base text-shu">菜单没能打开。</p>
          <StampButton type="button" onClick={() => reset()}>
            重试
          </StampButton>
        </div>
      </div>
    </main>
  );
}
