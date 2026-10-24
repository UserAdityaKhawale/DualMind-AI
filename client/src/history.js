const DB_NAME = 'dualmind-debate-history';
const STORE_NAME = 'debates';
const DB_VERSION = 1;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local debate history.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local history could not be opened.'));
  });
}

async function storeRequest(mode, run) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = run(store);
    let value;
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => reject(new Error('Local history storage failed.'));
    transaction.oncomplete = () => { database.close(); resolve(value); };
    transaction.onerror = () => { database.close(); reject(new Error('Local history storage failed.')); };
    transaction.onabort = () => { database.close(); reject(new Error('Local history storage failed.')); };
  });
}

export const saveDebate = (debate) => storeRequest('readwrite', (store) => store.put(debate));
export const removeDebate = (id) => storeRequest('readwrite', (store) => store.delete(id));
export const clearDebates = () => storeRequest('readwrite', (store) => store.clear());
export const listDebates = async () => (await storeRequest('readonly', (store) => store.getAll()) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export function toHistoryRecord(run) {
  return {
    id: run.id,
    prompt: run.prompt,
    selectedModels: run.selectedModels,
    results: run.results,
    reviews: run.reviews,
    synthesis: run.synthesis,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: new Date().toISOString(),
    usage: run.usage,
  };
}
