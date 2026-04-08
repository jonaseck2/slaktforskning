// Provide a working localStorage mock for the happy-dom environment.
// On Windows, happy-dom's --localstorage-file path handling is broken,
// leaving localStorage.getItem / setItem / clear as non-functions.
// This setup file replaces localStorage with a reliable in-memory mock
// that works identically on Windows and macOS.

const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: (key: string) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  key: (index: number) => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
