import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { ColorMode } from '../../api/chart-export';
import type { ArcSpan } from '../utils/fanLayout';
import { usePersonNameOptions } from './personNameOptions';

export interface RelationshipOption { id: string; label: string; }

export const useReportConfigStore = defineStore('reportConfig', () => {
  // Shared person subject: all person-based reports + chart prints.
  // Seeded by ReportsView.onMounted from the selected person (or
  // default_person_id setting); the panel picker controls it after that.
  const personId = ref<string | null>(null);

  // Birth-name parenthetical: each report has its own toggle, seeded once
  // from the global personNameOptions setting at store creation. Per-report
  // refs do NOT auto-track future changes to the global setting — opening a
  // report inherits the current default; later Settings changes don't
  // retroactively change the open report. See plan birth-name-display.
  const personNameOptions = usePersonNameOptions();
  const initBirthName = (): boolean => personNameOptions.showBirthNameParenthetical;

  // A Life
  const aLifeShowLifeMap                = ref(true);
  const aLifeShowMapCaption             = ref(true);
  const aLifeShowPhotos                 = ref(true);
  const aLifeShowDocuments              = ref(false);
  const aLifeShowSources                = ref(false);
  const aLifeShowNotes                  = ref(true);
  const aLifeShowMediaCaptions          = ref(true);
  const aLifeShowMediaNotes             = ref(true);
  const aLifeIncludeChildrenMarriages   = ref(false);
  const aLifeIncludeSiblingDeaths       = ref(false);
  const aLifeShowBirthNameParenthetical = ref(initBirthName());

  // Life on One Page
  const onePageOrientation                  = ref<'portrait' | 'landscape'>('portrait');
  const onePageShowLifeMap                  = ref(true);
  const onePageShowMapCaption               = ref(true);
  const lifeOnOnePageShowBirthNameParenthetical = ref(initBirthName());

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
  const yourAncestorsShowBirthNameParenthetical = ref(initBirthName());

  // Family in Year X
  const familyInYearYear                       = ref<number>(new Date().getFullYear() - 100);
  const familyInYearScope                      = ref<'all' | 'ancestors' | 'descendants'>('all');
  const familyInYearShowBirthNameParenthetical = ref(initBirthName());

  // Photo Album
  const photoAlbumSubjectType                = ref<'person' | 'relationship' | 'place' | 'all'>('person');
  const photoAlbumRelId                      = ref('');
  const photoAlbumPlaceId                    = ref('');
  const photoAlbumPerPage                    = ref<1 | 2 | 4>(1);
  const photoAlbumShowCaptions               = ref(true);
  const photoAlbumShowNotes                  = ref(true);
  const photoAlbumShowIndex                  = ref(false);
  const photoAlbumIncludeDocuments           = ref(false);
  const photoAlbumShowBirthNameParenthetical = ref(initBirthName());

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
  const placeChroniclePlaceId                  = ref('');
  const placeChronicleShowBoundary             = ref(true);
  const placeChronicleShowChildPlaces          = ref(false);
  const placeChronicleShowPhotos               = ref(true);
  const placeChronicleShowNotes                = ref(true);
  const placeChronicleShowSources              = ref(false);
  const placeChronicleShowMediaCaptions        = ref(true);
  const placeChronicleShowMediaNotes           = ref(true);
  const placeChronicleShowBirthNameParenthetical = ref(initBirthName());

  // A Marriage
  const aMarriageRelId                       = ref('');
  const aMarriageShowLifeMap                 = ref(true);
  const aMarriageShowMapCaption              = ref(true);
  const aMarriageShowPhotos                  = ref(true);
  const aMarriageShowNotes                   = ref(true);
  const aMarriageShowSources                 = ref(false);
  const aMarriageShowMediaCaptions           = ref(true);
  const aMarriageShowMediaNotes              = ref(true);
  const aMarriageShowBirthNameParenthetical  = ref(initBirthName());

  // Shared privacy toggle (keepsake reports)
  const redactLiving = ref(false);

  // Shared header/footer toggle (keepsake reports)
  // Page numbers are independent of this — always rendered when printing.
  const showHeaderFooter = ref(true);

  // Shared link-rule rendering toggle (keepsake reports). Default off:
  // dotted underlines clash with print typography, but PDF and website
  // export pick the rendered <a> through. Off-by-default keeps printed
  // pages clean.
  const linkifyNotes = ref(false);

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
    aLifeIncludeChildrenMarriages, aLifeIncludeSiblingDeaths,
    aLifeShowBirthNameParenthetical,
    onePageOrientation, onePageShowLifeMap, onePageShowMapCaption,
    lifeOnOnePageShowBirthNameParenthetical,
    yourAncestorsGenerations, yourAncestorsColorMode, yourAncestorsDensity,
    yourAncestorsShowEvents, yourAncestorsShowLifeMap, yourAncestorsShowMapCaption, yourAncestorsShowExtraPhotos,
    yourAncestorsShowMediaCaptions, yourAncestorsShowMediaNotes, yourAncestorsShowSources,
    yourAncestorsShowBirthNameParenthetical,
    familyInYearYear, familyInYearScope,
    familyInYearShowBirthNameParenthetical,
    photoAlbumSubjectType, photoAlbumRelId, photoAlbumPlaceId, photoAlbumPerPage,
    photoAlbumShowCaptions, photoAlbumShowNotes, photoAlbumShowIndex, photoAlbumIncludeDocuments,
    photoAlbumShowBirthNameParenthetical,
    photoAlbumSubjectId, photoAlbumCanRender,
    placeChroniclePlaceId, placeChronicleShowBoundary, placeChronicleShowChildPlaces,
    placeChronicleShowPhotos, placeChronicleShowNotes, placeChronicleShowSources,
    placeChronicleShowMediaCaptions, placeChronicleShowMediaNotes,
    placeChronicleShowBirthNameParenthetical,
    aMarriageRelId, aMarriageShowLifeMap, aMarriageShowMapCaption, aMarriageShowPhotos, aMarriageShowNotes,
    aMarriageShowSources, aMarriageShowMediaCaptions, aMarriageShowMediaNotes,
    aMarriageShowBirthNameParenthetical,
    redactLiving,
    showHeaderFooter,
    linkifyNotes,
    fanArcSpan, fanColorMode,
    yourAncestorsFanGenerations, yourAncestorsFanArcSpan,
    chartColorMode,
    coupleRelationships,
  };
});
