"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StampButton } from "@/components/stamp-button";
import {
  removalSkippedNotice,
  type ImportReport,
  type ListedPage,
} from "@/server/notion/report";

type SyncState = {
  running?: boolean;
  processed?: number;
  total?: number | null;
  report?: ImportReport | null;
  error?: string | null;
  settled?: boolean;
};

export function NotionSyncButton({
  onSynced,
}: {
  /** Runs after a finished sync, before router.refresh(). */
  onSynced?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);
  const watching = useRef(false);
  const sawRunning = useRef(false);
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
        if (body.running) sawRunning.current = true;
        if (
          watching.current &&
          sawRunning.current &&
          !body.running &&
          body.report &&
          !body.error
        ) {
          watching.current = false;
          sawRunning.current = false;
          try {
            await onSyncedRef.current?.();
          } catch {
            // The refresh below still asks the server for a new wall.
          }
          if (!cancel) {
            startTransition(() => {
              router.refresh();
            });
          }
        }
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
  }, [pending, router]);

  async function start() {
    if (pending || state?.running) return;
    watching.current = true;
    sawRunning.current = false;
    setPending(true);
    setShowNote(true);
    try {
      const response = await fetch("/api/notion/sync", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as SyncState;
      if (body.running) sawRunning.current = true;
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
      <StampButton
        type="button"
        tone="outline"
        className="w-full sm:w-auto"
        disabled={running}
        aria-busy={running}
        onClick={() => void start()}
      >
        {running ? "正在同步" : "从 Notion 同步"}
      </StampButton>
      {note ? (
        <div className="flex max-w-full flex-col gap-1 text-sm text-sumi-soft">
          <p aria-live="polite" className="break-words">
            {note}
          </p>
          {!running && state?.report ? (
            <>
              <PageList
                title={`没有步骤 ${state.report.noStepPages.length}`}
                pages={state.report.noStepPages}
              />
              <PageList
                title={`读取失败 ${state.report.erroredPages.length}`}
                pages={state.report.erroredPages}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PageList({
  title,
  pages,
}: {
  title: string;
  pages: readonly ListedPage[];
}) {
  if (pages.length === 0) return null;
  return (
    <details className="max-w-full text-left">
      <summary className="cursor-pointer">{title}</summary>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto break-all">
        {pages.map((page) => (
          <li key={page.pageId}>
            <a href={page.url} target="_blank" rel="noreferrer">
              {page.name?.trim() || "未命名"}
            </a>
          </li>
        ))}
      </ul>
    </details>
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
    `新增 ${report.added}，更新 ${report.updated}，删除 ${report.deleted}，下架 ${report.inactivated}，上墙 ${report.onWall}`,
    `导入 ${report.imported} 道，做过 ${report.tried}，没有步骤 ${report.noSteps}，读取失败 ${report.errored}，样本菜退下 ${report.seedsRetired}`,
  ];
  if (report.removalsSkipped) {
    parts.unshift(removalSkippedNotice(report.wouldRemove));
  }
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
