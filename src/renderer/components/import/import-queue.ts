/**
 * Runs N import files one after another.
 *
 * Sequential is not a simplification — `beginAccounting` throws on re-entry,
 * and two overlapping imports would merge their consumed-node sets, letting one
 * file's read mark another file's tag as accounted for. That is exactly the
 * silent drop the accounting work exists to prevent.
 *
 * A file that throws does not abandon the rest: the researcher picked four
 * files, and one bad file should not cost them the other three. The failure is
 * named in the combined result instead.
 */

export interface QueueFileResult<R> {
  file: string;
  report: R | null;
  error: string | null;
}

export interface QueueResult<R> {
  results: QueueFileResult<R>[];
  succeeded: number;
  failed: number;
}

/** A throw is not guaranteed to be an Error — a string reaches the report too. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function runImportQueue<R>(
  files: string[],
  importOne: (file: string) => Promise<R>,
  onProgress?: (done: number, total: number, file: string) => void,
): Promise<QueueResult<R>> {
  const results: QueueFileResult<R>[] = [];
  let succeeded = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const report = await importOne(file);
      results.push({ file, report, error: null });
      succeeded++;
    } catch (err) {
      results.push({ file, report: null, error: describeError(err) });
      failed++;
    }
    // Progress fires for a failed file too — the researcher is watching a
    // counter, and a queue that stalls at 2 of 4 reads as a hang.
    onProgress?.(i + 1, files.length, file);
  }
  return { results, succeeded, failed };
}
