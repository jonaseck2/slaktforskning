import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { ColorMode } from '../../api/chart-export';
import type { ArcSpan } from '../utils/fanLayout';
import { useFocusStore } from './focus';

export interface RelationshipOption { id: string; label: string; }

export const useReportConfigStore = defineStore('reportConfig', () => {
  const focusStore = useFocusStore();

  // Shared person subject: all person-based reports + chart prints.
  // Initialised once from focusStore; the panel picker controls it after that.
  const personId = ref<string | null>(focusStore.personId);

  // A Life
  const aLifeShowLifeMap        = ref(true);
  const aLifeShowMapCaption     = ref(true);
  const aLifeShowPhotos         = ref(true);
  const aLifeShowDocuments      = ref(false);
  const aLifeShowSources        = ref(false);
  const aLifeShowNotes          = ref(true);
  const aLifeShowMediaCaptions  = ref(true);
  const aLifeShowMediaNotes     = ref(true);

  // Life on One Page
  const onePageOrientation    = ref<'portrait' | 'landscape'>('portrait');
  const onePageShowLifeMap    = ref(true);
  const onePageShowMapCaption = ref(true);

  // Your Ancestors
  const yourAncestorsGenerations          = ref(4);
  const yourAncestorsColorMode            = ref<'bw' | 'branch' | 'sex'>('branch');
  const yourAncestorsDensity              = ref<'one' | 'two'>('one');
  const yourAncestorsShowEvents           = ref(true);
  const yourAncestorsShowLifeMap          = ref(true);
  const yourAncestorsShowMapCaption       = ref(true);
  const yourAncestorsShowExtraPhotos      = ref(false);
  const yourAncestorsShowMediaCaptions    = ref(true);
  const yourAncestorsShowMediaNotes       = ref(true);
  const yourAncestorsShowSources          = ref(false);

  // Family in Year X
  const familyInYearYear  = ref<number>(new Date().getFullYear() - 100);
  const familyInYearScope = ref<'all' | 'ancestors' | 'descendants'>('all');

  // Photo Album
  const photoAlbumSubjectType      = ref<'person' | 'relationship' | 'place' | 'all'>('person');
  const photoAlbumRelId            = ref('');
  const photoAlbumPlaceId          = ref('');
  const photoAlbumPerPage          = ref<1 | 2 | 4>(1);
  const photoAlbumShowCaptions     = ref(true);
  const photoAlbumShowNotes        = ref(true);
  const photoAlbumShowIndex        = ref(false);
  const photoAlbumIncludeDocuments = ref(false);

  const photoAlbumSubjectId = computed<string | null>(() => {
    if (photoAlbumSubjectType.value === 'person')       return personId.value;
    if (photoAlbumSubjectType.value === 'relationship') return photoAlbumRelId.value   || null;
    if (photoAlbumSubjectType.value === 'place')        return photoAlbumPlaceId.value || null;
    return null;
  });
  const photoAlbumCanRender = computed(() =>
    photoAlbumSubjectType.value === 'all' || !!photoAlbumSubjectId.value
  );

  // Place Chronicle
  const placeChroniclePlaceId           = ref('');
  const placeChronicleShowBoundary      = ref(true);
  const placeChronicleShowChildPlaces   = ref(false);
  const placeChronicleShowPhotos        = ref(true);
  const placeChronicleShowNotes         = ref(true);
  const placeChronicleShowSources       = ref(false);
  const placeChronicleShowMediaCaptions = ref(true);
  const placeChronicleShowMediaNotes    = ref(true);

  // A Marriage
  const aMarriageRelId             = ref('');
  const aMarriageShowLifeMap       = ref(true);
  const aMarriageShowMapCaption    = ref(true);
  const aMarriageShowPhotos        = ref(true);
  const aMarriageShowNotes         = ref(true);
  const aMarriageShowSources       = ref(false);
  const aMarriageShowMediaCaptions = ref(true);
  const aMarriageShowMediaNotes    = ref(true);

  // Shared privacy toggle (keepsake reports)
  const redactLiving = ref(false);

  // Fan chart (standalone print tab)
  const fanArcSpan   = ref<ArcSpan>(360);
  const fanColorMode = ref<'branch' | 'sex' | 'bw'>('bw');

  // Fan chart embedded in Your Ancestors report
  const yourAncestorsFanGenerations = ref(8);
  const yourAncestorsFanArcSpan     = ref<ArcSpan>(270);

  // Chart export: shared across chart-print tabs
  const chartColorMode = ref<ColorMode>('themed');

  // Couple relationships: populated by ReportsView.onMounted
  const coupleRelationships = ref<RelationshipOption[]>([]);

  return {
    personId,
    aLifeShowLifeMap, aLifeShowMapCaption, aLifeShowPhotos, aLifeShowDocuments, aLifeShowSources,
    aLifeShowNotes, aLifeShowMediaCaptions, aLifeShowMediaNotes,
    onePageOrientation, onePageShowLifeMap, onePageShowMapCaption,
    yourAncestorsGenerations, yourAncestorsColorMode, yourAncestorsDensity,
    yourAncestorsShowEvents, yourAncestorsShowLifeMap, yourAncestorsShowMapCaption, yourAncestorsShowExtraPhotos,
    yourAncestorsShowMediaCaptions, yourAncestorsShowMediaNotes, yourAncestorsShowSources,
    familyInYearYear, familyInYearScope,
    photoAlbumSubjectType, photoAlbumRelId, photoAlbumPlaceId, photoAlbumPerPage,
    photoAlbumShowCaptions, photoAlbumShowNotes, photoAlbumShowIndex, photoAlbumIncludeDocuments,
    photoAlbumSubjectId, photoAlbumCanRender,
    placeChroniclePlaceId, placeChronicleShowBoundary, placeChronicleShowChildPlaces,
    placeChronicleShowPhotos, placeChronicleShowNotes, placeChronicleShowSources,
    placeChronicleShowMediaCaptions, placeChronicleShowMediaNotes,
    aMarriageRelId, aMarriageShowLifeMap, aMarriageShowMapCaption, aMarriageShowPhotos, aMarriageShowNotes,
    aMarriageShowSources, aMarriageShowMediaCaptions, aMarriageShowMediaNotes,
    redactLiving,
    fanArcSpan, fanColorMode,
    yourAncestorsFanGenerations, yourAncestorsFanArcSpan,
    chartColorMode,
    coupleRelationships,
  };
});
