const DB_NAME = 'aurora-aqua-media';
const STORE = 'wallpaper';
const DB_VERSION = 1;
const HANDLE_KEY = 'videoHandle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}
function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveVideoBlob(blob: Blob): Promise<string> {
  try {
    const db = await openDb();
    const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, 'readwrite').put(blob, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('blob put failed'));
    });
    db.close();
    return `idb:${id}`;
  } catch {
    return '';
  }
}

export async function loadVideoBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const request = tx(db, 'readonly').get(id);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('blob get failed'));
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const request = tx(db, 'readwrite').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
    db.close();
  } catch {}
}

export async function saveVideoHandle(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, 'readwrite').put(handle, HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('handle put failed'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadVideoHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const request = tx(db, 'readonly').get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('handle get failed'));
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export function isVideoWallpaper(wallpaper: string): boolean {
  return wallpaper.startsWith('data:video/') || wallpaper.startsWith('idb:') || wallpaper.startsWith('fsa:');
}
