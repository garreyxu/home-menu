"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StampProps = {
  tone?: "solid" | "outline";
  addedCount?: number;
};

export function StampButton({
  tone = "solid",
  addedCount = 0,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & StampProps) {
  const added = addedCount > 0;
  return (
    <Button
      className={cn(
        "stamp-button focus-ring h-auto rounded-none border-0 shadow-none",
        "focus-visible:ring-0 active:translate-y-0",
        tone === "outline" && "is-outline",
        added && "is-added",
        className,
      )}
      {...props}
    >
      {children ?? (added ? `已加 ${addedCount} 次` : "＋加到哪天")}
    </Button>
  );
}
