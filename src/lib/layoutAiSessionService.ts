import type { LayoutAiBackendResponse, LayoutAiFields } from "@/lib/layoutAiService";

const DATABASE_NAME = "immapp-layout-ai-session";
const STORE_NAME = "layout-sessions";
const RECORD_KEY = "current";
const SESSION_ID_KEY = "immapp:layout-ai:session-id";

type StoredLayoutAiSession = {
  id: typeof RECORD_KEY;
  sessionId: string;
  fileBlob: Blob | null;
  fileName: string;
  fileType: string;
  fileLastModified: number;
  result: LayoutAiBackendResponse | null;
  comparisonFields: LayoutAiFields | null;
  message: string;
  updatedAt: string;
};

export type LayoutAiSessionState = {
  file: File | null;
  result: LayoutAiBackendResponse | null;
  comparisonFields: LayoutAiFields | null;
  message: string;
};

export async function loadLayoutAiSession(): Promise<LayoutAiSessionState | null> {
  if (!canUseIndexedDb()) return null;
  const database = await openDatabase();
  try {
    const stored = await requestToPromise<StoredLayoutAiSession | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY),
    );
    if (!stored || stored.sessionId !== getSessionId()) return null;
    const file = stored.fileBlob
      ? new File([stored.fileBlob], stored.fileName, {
          type: stored.fileType || stored.fileBlob.type,
          lastModified: stored.fileLastModified,
        })
      : null;
    return {
      file,
      result: stored.result,
      comparisonFields: stored.comparisonFields,
      message: stored.message,
    };
  } finally {
    database.close();
  }
}

export async function saveLayoutAiSession(state: LayoutAiSessionState) {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const fileBlob = state.file ? state.file.slice(0, state.file.size, state.file.type) : null;
    transaction.objectStore(STORE_NAME).put({
      id: RECORD_KEY,
      sessionId: getSessionId(),
      fileBlob,
      fileName: state.file?.name ?? "",
      fileType: state.file?.type ?? "",
      fileLastModified: state.file?.lastModified ?? 0,
      result: state.result,
      comparisonFields: state.comparisonFields,
      message: state.message,
      updatedAt: new Date().toISOString(),
    } satisfies StoredLayoutAiSession);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearLayoutAiSession() {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function getSessionId() {
  const existing = sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  sessionStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}
