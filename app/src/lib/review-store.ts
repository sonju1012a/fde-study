"use client";
import { useSyncExternalStore } from "react";
import type { Quote } from "./quote-schema.ts";

/**
 * 검토 상태 저장소. 브라우저 localStorage에 둔다.
 * 운영 환경에서는 DB로 바꾸는 자리이고, 인터페이스(get/update/reset)는 그대로 유지한다.
 */
export type ChangeLog = { field: string; from: unknown; to: unknown; at: string };
export type ReviewState = {
  quote: Quote;            // 검토자가 수정한 현재 값
  status: "pending" | "confirmed";
  changes: ChangeLog[];    // 수정 이력 (운영 피드백 루프의 원천 데이터)
  openedAt?: string;
  confirmedAt?: string;
};
type Store = Record<string, ReviewState>;

const KEY = "quote-review-v1";
const EMPTY: Store = {};
let cache: Store | null = null;
const listeners = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    cache = {};
  }
  return cache;
}
function write(next: Store) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 불가 환경이면 메모리로만 유지 */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

export function useReviewStore() {
  const store = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    store,
    get: (id: string): ReviewState | undefined => store[id],
    /** 처음 열 때 호출: 추출 원본으로 상태를 만든다 */
    open: (id: string, original: Quote) => {
      if (store[id]) return;
      write({ ...store, [id]: { quote: original, status: "pending", changes: [], openedAt: new Date().toISOString() } });
    },
    setField: (id: string, field: string, from: unknown, to: unknown, next: Quote) => {
      const cur = store[id]; if (!cur) return;
      write({ ...store, [id]: { ...cur, quote: next, changes: [...cur.changes, { field, from, to, at: new Date().toISOString() }] } });
    },
    confirm: (id: string) => {
      const cur = store[id]; if (!cur) return;
      write({ ...store, [id]: { ...cur, status: "confirmed", confirmedAt: new Date().toISOString() } });
    },
    reopen: (id: string) => {
      const cur = store[id]; if (!cur) return;
      write({ ...store, [id]: { ...cur, status: "pending", confirmedAt: undefined } });
    },
    reset: (id: string, original: Quote) => {
      write({ ...store, [id]: { quote: original, status: "pending", changes: [], openedAt: new Date().toISOString() } });
    },
    clearAll: () => write({}),
  };
}
