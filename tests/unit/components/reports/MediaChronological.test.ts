import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaChronological from '../../../../src/renderer/components/reports/primitives/MediaChronological.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  media: {
    readAsDataUrl: vi.fn(async (id: string) => `data:image/jpeg;base64,${id}`),
  },
  mediaRegions: {
    getForMedia: vi.fn(async () => [] as unknown[]),
  },
  persons: {
    getNames: vi.fn(async () => [] as unknown[]),
  },
};

const globalOpts = { plugins: [i18n] };
const photoItem = { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.media.readAsDataUrl.mockResolvedValue(null);
  mockApi.mediaRegions.getForMedia.mockResolvedValue([]);
  mockApi.persons.getNames.mockResolvedValue([]);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('MediaChronological', () => {
  it('filters out documents by default', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(1);
  });

  it('includes documents when toggle on', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        includeDocuments: true,
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(2);
  });

  it('renders nothing when items empty', () => {
    const wrapper = mount(MediaChronological, { global: globalOpts, props: { items: [] } });
    expect(wrapper.find('.media-chronological').exists()).toBe(false);
  });

  it('hides captions when showCaptions false', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        showCaptions: false,
        items: [photoItem],
      },
    });
    expect(wrapper.find('.media-caption').exists()).toBe(false);
  });

  it('loads image data URLs via window.api.media.readAsDataUrl', async () => {
    mockApi.media.readAsDataUrl.mockResolvedValue('data:image/jpeg;base64,abc');
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        items: [
          { id: 'abc', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
        ],
      },
    });
    await flushPromises();
    expect(mockApi.media.readAsDataUrl).toHaveBeenCalledWith('abc');
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('data:image/jpeg;base64,abc');
  });

  it('face tag in linkedPersonIds renders as anchor link with #person-ID href', async () => {
    mockApi.mediaRegions.getForMedia.mockResolvedValue([
      { id: 'reg1', media_id: '1', person_id: 'p42', x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: null },
    ]);
    mockApi.persons.getNames.mockResolvedValue([
      { given_name: 'Maja', surname: 'Nilsson', preferred_name: null, sort_order: 0 },
    ]);
    mockApi.media.readAsDataUrl.mockResolvedValue('data:image/jpeg;base64,1');

    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: { items: [photoItem], linkedPersonIds: ['p42'] },
    });
    await flushPromises();

    const faceLinks = wrapper.findAll('a.face-link');
    expect(faceLinks.length).toBeGreaterThan(0);
    for (const link of faceLinks) {
      expect(link.attributes('href')).toBe('#person-p42');
    }
  });

  it('face tag not in linkedPersonIds renders as span without a link', async () => {
    mockApi.mediaRegions.getForMedia.mockResolvedValue([
      { id: 'reg1', media_id: '1', person_id: 'p99', x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: null },
    ]);
    mockApi.persons.getNames.mockResolvedValue([
      { given_name: 'Okänd', surname: null, preferred_name: null, sort_order: 0 },
    ]);
    mockApi.media.readAsDataUrl.mockResolvedValue('data:image/jpeg;base64,1');

    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: { items: [photoItem], linkedPersonIds: [] },
    });
    await flushPromises();

    expect(wrapper.find('a.face-link').exists()).toBe(false);
    expect(wrapper.find('.face-name').exists()).toBe(true);
  });

  it('all generated anchor hrefs stay within the report (start with #)', async () => {
    mockApi.mediaRegions.getForMedia.mockResolvedValue([
      { id: 'reg1', media_id: '1', person_id: 'p1', x: 0, y: 0, width: 0.5, height: 0.5, label: null },
    ]);
    mockApi.persons.getNames.mockResolvedValue([
      { given_name: 'Test', surname: null, preferred_name: null, sort_order: 0 },
    ]);
    mockApi.media.readAsDataUrl.mockResolvedValue('data:image/jpeg;base64,1');

    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: { items: [photoItem], linkedPersonIds: ['p1'] },
    });
    await flushPromises();

    for (const link of wrapper.findAll('a[href]')) {
      const href = link.attributes('href') ?? '';
      expect(href.startsWith('#'), `External link found: ${href}`).toBe(true);
    }
  });
});
