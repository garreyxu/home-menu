"use client";

import { useEffect, useState } from "react";
import { PixelButton } from "@/components/pixel-frame";
import type { ImportReport } from "@/server/notion/report";

type SyncState = {
  running?: boolean;
  processed?: number;
  total?: number | null;
  report?: ImportReport | null;
  error?: string | null;
  settled?: boolean;
};

export function NotionSyncButton() {
  const [state, setState] = useState<SyncState | null>(null);
  const [pending, setPending] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    let cancel = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch("/api/notion/sync", { cache: "no-store" });
        const body = (await response.json()) as SyncState;
        if (cancel) return;
        setState(body);
        if (body.running) timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (cancel) return;
        setState({
          running: false,
          error: "同步状态读失败",
          settled: false,
        });
      }
    }

    void poll();
    return () => {
      cancel = true;
      if (timer) clearTimeout(timer);
    };
  }, [pending]);

  async function start() {
    if (pending || state?.running) return;
    setPending(true);
    setShowNote(true);
    try {
      const response = await fetch("/api/notion/sync", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as SyncState;
      setState(body);
    } catch {
      setState({
        running: false,
        error: "同步没能开始。",
        settled: false,
      });
    } finally {
      setPending(false);
    }
  }

  const running = Boolean(state?.running) || pending;
  const note =
    showNote || state?.running || state?.settled ? describeSync(state) : null;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2 sm:max-w-md sm:items-end">
      <PixelButton
        type="button"
        tone="sea"
        size="sm"
        disabled={running}
        aria-busy={running}
        onClick={() => void start()}
      >
        {running ? "正在同步" : "从 Notion 同步"}
      </PixelButton>
      {note ? (
        <p
          aria-live="polite"
          className="max-w-full text-sm break-words text-driftwood"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

function describeSync(state: SyncState | null): string | null {
  if (!state) return null;
  if (state.running) {
    const total = state.total ?? 0;
    return total > 0
      ? `正在同步，已处理 ${state.processed ?? 0} / ${total}`
      : "正在同步…";
  }
  if (state.error) return state.error;
  if (!state.report) return null;
  const report = state.report;
  const parts = [
    `新增 ${report.added}，更新 ${report.updated}，下架 ${report.delisted}，上墙 ${report.onWall}`,
    `导入 ${report.imported} 道，有图 ${report.withPhoto}，占位 ${report.placeholder}`,
    `未尝试、未导入 ${report.notTried}`,
  ];
  if (report.skipped.length > 0) {
    parts.push(
      report.skipped
        .map((skip) => `跳过 ${skip.name ?? "未命名"}：${skip.reason}`)
        .join("；"),
    );
  }
  if (report.warnings.length > 0) parts.push(report.warnings.join(" "));
  return parts.join("。");
}
