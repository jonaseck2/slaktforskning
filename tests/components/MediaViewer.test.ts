import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaViewer from '../../src/renderer/components/MediaViewer.vue';
import { i18n } from './setup';

const mockApi = {
  media: {
    readAsDataUrl: vi.fn().mockResolvedValue(null),
  },
  mediaRegions: {
    getForMedia: vi.fn().mockResolvedValue([]),
  },
  persons: {
    getNames: vi.fn().mockResolvedValue([]),
  },
};

const baseItem = {
  id: 'm1',
  title: 'photo.jpg',
  file_ref: '/path/photo.jpg',
  format: 'jpg',
  notes: '',
};

function mountViewer(overrides: Partial<{
  mediaItems: typeof baseItem[];
  initialIndex: number;
  thumbnails: Record<string, string>;
  drawMode: boolean;
  highlightedRegionId: string | null;
}> = {}) {
  return mount(MediaViewer, {
    global: {
      plugins: [i18n],
      stubs: {
        FaceTagOverlay: true,
        MediaCaption: true,
        ZoomControls: true,
        'router-link': true,
      },
      mocks: {
        $router: { push: vi.fn() },
      },
    },
    props: {
      mediaItems: [baseItem],
      initialIndex: 0,
      thumbnails: {},
      drawMode: false,
      highlightedRegionId: null,
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('MediaViewer', () => {
  it('renders counter as "1 / 1" for single item', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(wrapper.find('.viewer-counter').text()).toBe('1 / 1');
  });

  it('does not render filmstrip for single item', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(wrapper.find('.viewer-filmstrip').exists()).toBe(false);
  });

  it('renders filmstrip when multiple items', async () => {
    const item2 = { ...baseItem, id: 'm2', title: 'other.jpg', file_ref: '/path/other.jpg' };
    const wrapper = mountViewer({ mediaItems: [baseItem, item2] });
    await flushPromises();
    expect(wrapper.find('.viewer-filmstrip').exists()).toBe(true);
    expect(wrapper.findAll('.filmstrip-thumb')).toHaveLength(2);
  });

  it('emits close on Escape keydown', async () => {
    const wrapper = mountViewer();
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('navigates to next item on ArrowRight', async () => {
    const item2 = { ...baseItem, id: 'm2', title: 'other.jpg', file_ref: '/path/other.jpg' };
    const wrapper = mountViewer({ mediaItems: [baseItem, item2] });
    await flushPromises();
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    const emitted = wrapper.emitted('update:currentIndex');
    expect(emitted).toBeTruthy();
    expect(emitted![emitted!.length - 1][0]).toBe(1);
  });

  it('navigates to prev item on ArrowLeft', async () => {
    const item2 = { ...baseItem, id: 'm2', title: 'other.jpg', file_ref: '/path/other.jpg' };
    const wrapper = mountViewer({ mediaItems: [baseItem, item2], initialIndex: 1 });
    await flushPromises();
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    const emitted = wrapper.emitted('update:currentIndex');
    expect(emitted).toBeTruthy();
    expect(emitted![emitted!.length - 1][0]).toBe(0);
  });

  it('does not navigate past first item on ArrowLeft', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:currentIndex')).toBeFalsy();
  });

  it('does not navigate past last item on ArrowRight', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:currentIndex')).toBeFalsy();
  });

  it('calls readAsDataUrl for image formats', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(mockApi.media.readAsDataUrl).toHaveBeenCalledWith('m1');
    // suppress unused warning
    void wrapper;
  });

  it('does not call readAsDataUrl for non-image formats', async () => {
    const pdfItem = { ...baseItem, id: 'm3', format: 'pdf', file_ref: '/path/doc.pdf' };
    const wrapper = mountViewer({ mediaItems: [pdfItem] });
    await flushPromises();
    expect(mockApi.media.readAsDataUrl).not.toHaveBeenCalled();
    void wrapper;
  });

  it('shows fallback for non-image item', async () => {
    const pdfItem = { ...baseItem, id: 'm3', format: 'pdf', file_ref: '/path/doc.pdf' };
    const wrapper = mountViewer({ mediaItems: [pdfItem] });
    await flushPromises();
    expect(wrapper.find('.viewer-fallback').exists()).toBe(true);
  });

  it('active filmstrip thumb has active class', async () => {
    const item2 = { ...baseItem, id: 'm2', title: 'other.jpg', file_ref: '/path/other.jpg' };
    const wrapper = mountViewer({ mediaItems: [baseItem, item2] });
    await flushPromises();
    const thumbs = wrapper.findAll('.filmstrip-thumb');
    expect(thumbs[0].classes()).toContain('active');
    expect(thumbs[1].classes()).not.toContain('active');
  });

  it('viewer-canvas element is present in DOM', async () => {
    const wrapper = mountViewer();
    await flushPromises();
    expect(wrapper.find('.viewer-canvas').exists()).toBe(true);
  });
});
