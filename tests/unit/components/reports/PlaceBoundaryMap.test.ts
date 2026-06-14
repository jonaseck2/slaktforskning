import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlaceBoundaryMap from '../../../../src/renderer/components/reports/primitives/PlaceBoundaryMap.vue';

// --- Leaflet mock: records the view-setting calls so we can assert the map is
// never left without a view (the "dead blank box" bug). ---
const mapCalls = { setView: [] as unknown[][], fitBounds: [] as unknown[][] };

vi.mock('leaflet', () => {
  function makeBounds() {
    let count = 0;
    return {
      extend() { count++; return this; },
      isValid() { return count > 0; },
      getBounds() { return makeBounds(); },
    };
  }
  const fakeMap = {
    remove: vi.fn(),
    setView: vi.fn((...args: unknown[]) => { mapCalls.setView.push(args); }),
    fitBounds: vi.fn((...args: unknown[]) => { mapCalls.fitBounds.push(args); }),
  };
  const chainable = () => {
    const obj: Record<string, unknown> = {};
    obj.addTo = () => obj;
    obj.bindTooltip = () => obj;
    obj.getBounds = () => makeBounds();
    return obj;
  };
  const L = {
    map: vi.fn(() => fakeMap),
    tileLayer: vi.fn(() => chainable()),
    circleMarker: vi.fn(() => chainable()),
    geoJSON: vi.fn(() => chainable()),
    latLngBounds: vi.fn(() => makeBounds()),
  };
  return { default: L };
});

// --- Resolver mock: per-test control over whether a place resolves. ---
const resolverMock = {
  ready: { value: true },
  ensureLoaded: vi.fn().mockResolvedValue(undefined),
  resolveCoordinates: vi.fn().mockReturnValue(null),
  resolve: vi.fn().mockReturnValue(null),
  resolveBoundary: vi.fn().mockResolvedValue(null),
  invalidate: vi.fn(),
  getGazetteers: vi.fn().mockReturnValue([]),
};
vi.mock('../../../../src/renderer/composables/usePlaceResolver', () => ({
  usePlaceResolver: () => resolverMock,
}));

function setApi(place: Record<string, unknown> | null, path = 'Sweden > Värmland') {
  (window as unknown as { api: unknown }).api = {
    places: {
      get: vi.fn().mockResolvedValue(place),
      getPath: vi.fn().mockResolvedValue(path),
    },
  };
}

describe('PlaceBoundaryMap', () => {
  beforeEach(() => {
    mapCalls.setView = [];
    mapCalls.fitBounds = [];
    resolverMock.resolveCoordinates.mockReturnValue(null);
    resolverMock.resolveBoundary.mockResolvedValue(null);
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('mounts with null placeId without error', async () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null } });
    expect(wrapper.find('.place-boundary-map').exists()).toBe(true);
  });

  it('renders at the given height', async () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null, height: 600 } });
    const el = wrapper.find('.place-boundary-map').element as HTMLElement;
    expect(el.style.height).toBe('600px');
  });

  it('uses a default aria-label', async () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null } });
    expect(wrapper.find('.place-boundary-map').attributes('aria-label')).toBe('Place map');
  });

  it('honors a custom aria-label', async () => {
    const wrapper = mount(PlaceBoundaryMap, {
      props: { placeId: null, ariaLabel: 'Boundary of Uppsala' },
    });
    expect(wrapper.find('.place-boundary-map').attributes('aria-label')).toBe('Boundary of Uppsala');
  });

  // --- Root-cause regression: a place with no persisted coords whose location
  // comes from the render-time resolver must still center the map. ---
  it('centers on resolver coordinates when the DB row has no lat/lon', async () => {
    setApi({ id: 'p1', name: 'Bryckjegården, Karlskoga', latitude: null, longitude: null });
    resolverMock.resolveCoordinates.mockReturnValue({ lat: 59.32, lon: 14.52, resolved: true });

    mount(PlaceBoundaryMap, { props: { placeId: 'p1', showBoundary: false } });
    await flushPromises();

    expect(resolverMock.resolveCoordinates).toHaveBeenCalled();
    // A single resolved point centers at a town-level zoom rather than
    // fitBounds-ing a zero-area bounds (which would zoom to max).
    expect(mapCalls.fitBounds.length).toBe(0);
    expect(mapCalls.setView.length).toBe(1);
    expect(mapCalls.setView[0]).toEqual([[59.32, 14.52], 10, { animate: false }]);
  });

  // --- The map must never be left viewless (the blank-box symptom), even when
  // nothing about the place can be located. ---
  it('falls back to a default view when the place cannot be located at all', async () => {
    setApi({ id: 'p2', name: 'Unresolvable farm', latitude: null, longitude: null });
    // resolveCoordinates + resolveBoundary both return null (defaults).

    mount(PlaceBoundaryMap, { props: { placeId: 'p2', showBoundary: true } });
    await flushPromises();

    expect(mapCalls.fitBounds.length).toBe(0);
    expect(mapCalls.setView.length).toBe(1);
    expect(mapCalls.setView[0][0]).toEqual([55, 15]);
  });
});
