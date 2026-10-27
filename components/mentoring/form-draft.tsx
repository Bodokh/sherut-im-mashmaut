"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { Button } from "@/components/staff/ui/button";
import type { CommandSuccess } from "@/lib/mentoring/contracts";
import {
  reconcileStoredDraft,
  type DraftIntent,
  type PersistedDraft,
} from "./draft-state";

export function useFormDraft<T>(key: string, initial: T) {
  const { readDraft, writeDraft, clearDraft, submit, draftScopeKey } = useWorkspace();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "saved" | "error" | "load_error"
  >("loading");
  const [isHydrated, setHydrated] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [writeAttempt, setWriteAttempt] = useState(0);
  const hydrationKey = JSON.stringify([key, draftScopeKey, loadAttempt]);
  const hydrated = isHydrated && loadedScope === hydrationKey;
  const [recovered, setRecovered] = useState<CommandSuccess | null>(null);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const changed = useRef(false);
  const active = useRef(true);
  const liveValue = useRef(initial);
  const intent = useRef<DraftIntent | null>(null);
  const hydrationGeneration = useRef(0);

  const loadDraft = useEffectEvent((isCancelled: () => boolean) => {
    void readDraft<T | PersistedDraft<T>>(key)
      .then(async (draft) => {
        if (isCancelled()) return;
        // Reconcile before enabling edits: a prepared Save may already exist in
        // the server/outbox, even when a crash prevented local draft cleanup.
        const restored = await reconcileStoredDraft(
          draft,
          initial,
          submit,
        );
        if (isCancelled()) return;
        intent.current = restored.intent;
        liveValue.current = restored.value;
        setValue(restored.value);
        setRecovered(restored.recovered);
        if (restored.rejected) {
          await writeDraft<PersistedDraft<T>>(key, {
            kind: "mentoring-form-draft-v1",
            value: restored.value,
            intent: null,
          });
          if (isCancelled()) return;
        }
        setLoadedScope(hydrationKey);
        setHydrated(true);
        setStatus(draft ? "saved" : "ready");
      })
      .catch(() => {
        if (!isCancelled()) setStatus("load_error");
      });
  });

  useEffect(() => {
    active.current = true;
    changed.current = false;
    ++revision.current;
    const generation = ++hydrationGeneration.current;
    let cancelled = false;
    loadDraft(() => cancelled || generation !== hydrationGeneration.current);
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [key, draftScopeKey, loadAttempt]);

  const persist = useCallback(
    (next: T) => {
      const currentRevision = ++revision.current;
      setStatus("saving");
      const envelope: PersistedDraft<T> = {
        kind: "mentoring-form-draft-v1",
        value: next,
        intent: intent.current,
      };
      queue.current = queue.current
        .catch(() => undefined)
        .then(() => writeDraft(key, envelope));
      queue.current
        .then(() => {
          if (active.current && revision.current === currentRevision)
            setStatus("saved");
        })
        .catch(() => {
          if (active.current && revision.current === currentRevision)
            setStatus("error");
        });
      return queue.current;
    },
    [key, writeDraft],
  );

  const saveChangedValue = useEffectEvent(() => {
    if (hydrated && changed.current) void persist(value);
  });
  useEffect(() => { saveChangedValue(); }, [hydrated, value, writeAttempt]);

  return {
    value: loadedScope === hydrationKey ? value : initial,
    update(next: T) {
      changed.current = true;
      liveValue.current = next;
      setValue(next);
    },
    hydrated,
    status,
    recovered: loadedScope === hydrationKey ? recovered : null,
    recheck() {
      changed.current = false;
      setHydrated(false);
      setStatus("loading");
      setLoadAttempt((attempt) => attempt + 1);
    },
    retry() {
      if (hydrated) setWriteAttempt((attempt) => attempt + 1);
      else {
        setStatus("loading");
        setLoadAttempt((attempt) => attempt + 1);
      }
    },
    async prepare(payload: unknown) {
      if (!hydrated)
        throw new Error("Draft hydration must finish before submission.");
      const signature = JSON.stringify(payload);
      if (intent.current?.signature !== signature)
        intent.current = { signature, operationId: crypto.randomUUID() };
      const operationId = intent.current.operationId;
      // Persist the retry identity before the action can enter the outbox or server.
      // A reload between accepted submission and draft cleanup reuses the same action.
      await persist(liveValue.current);
      return operationId;
    },
    async clear() {
      const generation = ++hydrationGeneration.current;
      ++revision.current;
      changed.current = false;
      await queue.current.catch(() => undefined);
      await clearDraft(key);
      if (generation !== hydrationGeneration.current) return;
      intent.current = null;
      if (active.current) {
        setRecovered(null);
        setStatus("ready");
      }
    },
  };
}

export function DraftStatus({
  status,
  onRetry,
}: {
  status: ReturnType<typeof useFormDraft>["status"];
  onRetry?: () => void;
}) {
  const failed = status === "error" || status === "load_error";
  const Icon = failed
    ? CircleAlertIcon
    : status === "loading" || status === "saving"
      ? LoaderCircleIcon
      : CheckCircle2Icon;
  const messages = {
    loading: "טעינת טיוטה שמורה…",
    ready: "הטיוטה תישמר אוטומטית במכשיר הזה",
    saving: "שמירת טיוטה במכשיר…",
    saved: "הטיוטה נשמרה במכשיר הזה",
    error:
      "השמירה האוטומטית נכשלה. יש להשאיר את הטופס פתוח ולשמור את הדיווח לפני היציאה.",
    load_error:
      "לא ניתן לטעון את הטיוטה השמורה. יש לנסות שוב לפני הזנת פרטים, כדי לשמור על מידע שכבר הוזן.",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-start gap-2"
    >
      <p
        className={
          failed
            ? "flex items-center gap-2 text-sm text-destructive"
            : "flex items-center gap-2 text-xs text-muted-foreground"
        }
      >
        <Icon
          aria-hidden="true"
          className={
            status === "loading" || status === "saving"
              ? "size-4 shrink-0 animate-spin"
              : "size-4 shrink-0"
          }
        />
        {messages[status]}
      </p>
      {failed && onRetry && (
        <Button type="button" variant="outline" onClick={onRetry}>
          {status === "load_error"
            ? "ניסיון נוסף לטעינת הטיוטה"
            : "ניסיון נוסף לשמירת הטיוטה"}
        </Button>
      )}
    </div>
  );
}
