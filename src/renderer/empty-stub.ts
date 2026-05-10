// Universal stub for Node-only modules pulled in by main-thread code paths
// the renderer never executes (genney importer, child_process spawning).
// Any usage at runtime is a bug — code should have moved to a Rust command.

const proxyHandler: ProxyHandler<object> = {
  get(_target, prop) {
    if (prop === 'then') return undefined; // not a thenable
    return () => {
      throw new Error(`Node-only module used in renderer (${String(prop)})`);
    };
  },
};

const stub = new Proxy({}, proxyHandler);

export const Worker = stub;
export const spawn = stub;
export const spawnSync = stub;
export const exec = stub;
export const execSync = stub;
export const fork = stub;
export const isMainThread = true;
export const parentPort = null;
export const workerData = null;
export const threadId = 0;

export default stub;
