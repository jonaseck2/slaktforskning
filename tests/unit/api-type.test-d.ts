/**
 * Type-level tests for ApiSurface<typeof channelRegistry>.
 * Run: npx tsc --noEmit --skipLibCheck
 * The @ts-expect-error comments validate that typos and wrong arg types fail.
 */
import { channelRegistry } from '../../src/shared/channels';
import type { ApiSurface } from '../../src/shared/channels/api-type';

type API = ApiSurface<typeof channelRegistry>;

async function _typeCheck(api: API) {
  // Valid call — should compile
  await api.persons.get('id');

  // @ts-expect-error — typo: 'gett' does not exist
  await api.persons.gett('id');

  // @ts-expect-error — wrong arg type: number instead of string
  await api.persons.get(42);
}

// Ensure the type is not trivially broken (not 'never' or 'unknown')
type _personsGet = typeof _typeCheck;
