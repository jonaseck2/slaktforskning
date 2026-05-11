import { describe, it, expect } from 'vitest';
import {
  narratePersonRow,
  narrateRelationshipRow,
  narrateSourceRow,
  narratePlaceRow,
  narrateEventRow,
  narrateTaskRow,
  narrateMediaRow,
  narrateQualityRow,
  narratePersonDetail,
  narrateChartNode,
  narrateChartBoundary,
  narratePageEntry,
  narrateModalOpen,
  narrateFieldFocus,
  narrateSearchResults,
  narrateAction,
} from '../../src/renderer/utils/screenReaderNarration';

// Mock t() that returns "key(param=value,...)" for easy assertion
function t(key: string, params?: Record<string, string | number>): string {
  if (!params || Object.keys(params).length === 0) return key;
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${key}(${paramStr})`;
}

describe('narratePersonRow', async () => {
  it('returns rowPerson key with full name and sex/summary', async () => {
    const result = narratePersonRow(
      { given_name: 'Erik', surname: 'Johansson', sex: 'M', event_count: 3, relationship_count: 2 },
      t
    );
    expect(result).toContain('screenReader.rowPerson');
    expect(result).toContain('name=Erik Johansson');
    expect(result).toContain('sex=');
  });

  it('handles empty given name', async () => {
    const result = narratePersonRow(
      { given_name: '', surname: 'Johansson', sex: 'F', event_count: 0, relationship_count: 0 },
      t
    );
    expect(result).toContain('name=Johansson');
  });

  it('handles empty surname', async () => {
    const result = narratePersonRow(
      { given_name: 'Erik', surname: '', sex: 'U', event_count: 1, relationship_count: 0 },
      t
    );
    expect(result).toContain('name=Erik');
  });

  it('handles both names empty', async () => {
    const result = narratePersonRow(
      { given_name: '', surname: '', sex: 'U', event_count: 0, relationship_count: 0 },
      t
    );
    expect(result).toContain('screenReader.rowPerson');
  });

  it('maps sex M to male label', async () => {
    const result = narratePersonRow(
      { given_name: 'A', surname: 'B', sex: 'M', event_count: 0, relationship_count: 0 },
      t
    );
    expect(result).toContain('sex=Male');
  });

  it('maps sex F to female label', async () => {
    const result = narratePersonRow(
      { given_name: 'A', surname: 'B', sex: 'F', event_count: 0, relationship_count: 0 },
      t
    );
    expect(result).toContain('sex=Female');
  });

  it('maps sex U to unknown label', async () => {
    const result = narratePersonRow(
      { given_name: 'A', surname: 'B', sex: 'U', event_count: 0, relationship_count: 0 },
      t
    );
    expect(result).toContain('sex=Unknown');
  });

  it('includes event and relationship counts in summary', async () => {
    const result = narratePersonRow(
      { given_name: 'A', surname: 'B', sex: 'M', event_count: 5, relationship_count: 3 },
      t
    );
    expect(result).toContain('5');
    expect(result).toContain('3');
  });
});

describe('narrateRelationshipRow', async () => {
  it('returns rowRelationship key with persons and summary', async () => {
    const result = narrateRelationshipRow(
      {
        type: 'couple',
        person1_given_name: 'Erik',
        person1_surname: 'Johansson',
        person2_given_name: 'Anna',
        person2_surname: 'Nilsson',
        event_summary: 'Married 1868',
      },
      t
    );
    expect(result).toContain('screenReader.rowRelationship');
    expect(result).toContain('person1=Erik Johansson');
    expect(result).toContain('person2=Anna Nilsson');
    expect(result).toContain('summary=Married 1868');
  });

  it('handles empty person names', async () => {
    const result = narrateRelationshipRow(
      {
        type: 'parent_child',
        person1_given_name: '',
        person1_surname: '',
        person2_given_name: '',
        person2_surname: '',
        event_summary: '',
      },
      t
    );
    expect(result).toContain('screenReader.rowRelationship');
  });
});

describe('narrateSourceRow', async () => {
  it('returns rowSource key with title, type, citation count', async () => {
    const result = narrateSourceRow(
      { title: 'Church records', source_type: 'church_record', citation_count: 5 },
      t
    );
    expect(result).toContain('screenReader.rowSource');
    expect(result).toContain('title=Church records');
    expect(result).toContain('citationCount=5');
  });

  it('handles zero citations', async () => {
    const result = narrateSourceRow(
      { title: 'Census 1880', source_type: 'census', citation_count: 0 },
      t
    );
    expect(result).toContain('citationCount=0');
  });
});

describe('narratePlaceRow', async () => {
  it('returns rowPlace key with name, type, path', async () => {
    const result = narratePlaceRow(
      { name: 'Stockholm', place_type: 'city', path: 'Sweden > Stockholm' },
      t
    );
    expect(result).toContain('screenReader.rowPlace');
    expect(result).toContain('name=Stockholm');
    expect(result).toContain('path=Sweden > Stockholm');
  });

  it('handles empty path', async () => {
    const result = narratePlaceRow(
      { name: 'Unknown', place_type: '', path: '' },
      t
    );
    expect(result).toContain('screenReader.rowPlace');
  });
});

describe('narrateEventRow', async () => {
  it('returns rowEvent key with type, date, place', async () => {
    const result = narrateEventRow(
      { event_type: 'birth', date_value: '1842-03-15', place_name: 'Göteborg' },
      t
    );
    expect(result).toContain('screenReader.rowEvent');
    expect(result).toContain('eventType=birth');
    expect(result).toContain('date=1842-03-15');
    expect(result).toContain('place=Göteborg');
  });

  it('handles empty date and place', async () => {
    const result = narrateEventRow(
      { event_type: 'other', date_value: '', place_name: '' },
      t
    );
    expect(result).toContain('screenReader.rowEvent');
  });
});

describe('narrateTaskRow', async () => {
  it('returns rowTask key with priority label, status, task', async () => {
    const result = narrateTaskRow(
      { priority: 1, status: 'open', task: 'Find birth record' },
      t
    );
    expect(result).toContain('screenReader.rowTask');
    expect(result).toContain('priority=high');
    expect(result).toContain('status=open');
    expect(result).toContain('task=Find birth record');
  });

  it('maps priority 2 to medium', async () => {
    const result = narrateTaskRow(
      { priority: 2, status: 'in_progress', task: 'Check census' },
      t
    );
    expect(result).toContain('priority=medium');
  });

  it('maps priority 3 to low', async () => {
    const result = narrateTaskRow(
      { priority: 3, status: 'done', task: 'Verify dates' },
      t
    );
    expect(result).toContain('priority=low');
  });

  it('handles unknown priority', async () => {
    const result = narrateTaskRow(
      { priority: 99, status: 'open', task: 'Some task' },
      t
    );
    expect(result).toContain('screenReader.rowTask');
  });
});

describe('narrateMediaRow', async () => {
  it('returns rowMedia key with title and format', async () => {
    const result = narrateMediaRow(
      { title: 'Portrait photo', format: 'jpg' },
      t
    );
    expect(result).toContain('screenReader.rowMedia');
    expect(result).toContain('title=Portrait photo');
    expect(result).toContain('format=jpg');
  });

  it('handles empty format', async () => {
    const result = narrateMediaRow(
      { title: 'Document', format: '' },
      t
    );
    expect(result).toContain('screenReader.rowMedia');
  });
});

describe('narrateQualityRow', async () => {
  it('returns rowQuality key with severity and message', async () => {
    const result = narrateQualityRow(
      { severity: 'warning', message: 'Missing birth date' },
      t
    );
    expect(result).toContain('screenReader.rowQuality');
    expect(result).toContain('severity=warning');
    expect(result).toContain('message=Missing birth date');
  });
});

describe('narratePersonDetail', async () => {
  it('returns navPersonDetail key with all fields', async () => {
    const result = narratePersonDetail(
      { name: 'Erik Johansson', sex: 'Male', summary: 'born 1842', sectionCount: 5 },
      t
    );
    expect(result).toContain('screenReader.navPersonDetail');
    expect(result).toContain('name=Erik Johansson');
    expect(result).toContain('sex=Male');
    expect(result).toContain('summary=born 1842');
    expect(result).toContain('sectionCount=5');
  });
});

describe('narrateChartNode', async () => {
  it('uses chartFocusPerson key for generation 1', async () => {
    const result = narrateChartNode(
      { name: 'Erik', summary: 'born 1842', relationship: '', generation: 1, childCount: 3 },
      t
    );
    expect(result).toContain('screenReader.chartFocusPerson');
    expect(result).toContain('name=Erik');
  });

  it('uses chartAncestor key for other generations', async () => {
    const result = narrateChartNode(
      { name: 'Lars', summary: 'born 1810', relationship: 'grandfather', generation: 3, childCount: 5 },
      t
    );
    expect(result).toContain('screenReader.chartAncestor');
    expect(result).toContain('name=Lars');
    expect(result).toContain('generation=3');
    expect(result).toContain('childCount=5');
  });

  it('uses chartAncestor for generation 2', async () => {
    const result = narrateChartNode(
      { name: 'Jan', summary: '', relationship: 'father', generation: 2, childCount: 0 },
      t
    );
    expect(result).toContain('screenReader.chartAncestor');
  });
});

describe('narrateChartBoundary', async () => {
  it('returns chartNoFather for direction father', async () => {
    const result = narrateChartBoundary('father', t);
    expect(result).toContain('screenReader.chartNoFather');
  });

  it('returns chartNoMother for direction mother', async () => {
    const result = narrateChartBoundary('mother', t);
    expect(result).toContain('screenReader.chartNoMother');
  });

  it('returns chartNoChildren for direction children', async () => {
    const result = narrateChartBoundary('children', t);
    expect(result).toContain('screenReader.chartNoChildren');
  });

  it('returns chartNoSpouse for direction spouse', async () => {
    const result = narrateChartBoundary('spouse', t);
    expect(result).toContain('screenReader.chartNoSpouse');
  });

  it('returns chartNoAncestors for direction ancestors', async () => {
    const result = narrateChartBoundary('ancestors', t);
    expect(result).toContain('screenReader.chartNoAncestors');
  });
});

describe('narratePageEntry', async () => {
  it('maps persons route to navPersonsList', async () => {
    const result = narratePageEntry('persons', 42, t);
    expect(result).toContain('screenReader.navPersonsList');
    expect(result).toContain('count=42');
  });

  it('maps relationships route to navRelationshipsList', async () => {
    const result = narratePageEntry('relationships', 10, t);
    expect(result).toContain('screenReader.navRelationshipsList');
    expect(result).toContain('count=10');
  });

  it('maps sources route to navSourcesList', async () => {
    const result = narratePageEntry('sources', 7, t);
    expect(result).toContain('screenReader.navSourcesList');
    expect(result).toContain('count=7');
  });

  it('maps places route to navPlacesList', async () => {
    const result = narratePageEntry('places', 3, t);
    expect(result).toContain('screenReader.navPlacesList');
    expect(result).toContain('count=3');
  });

  it('maps tasks route to navTasksList', async () => {
    const result = narratePageEntry('tasks', 1, t);
    expect(result).toContain('screenReader.navTasksList');
    expect(result).toContain('count=1');
  });

  it('maps visualization route to navVisualization', async () => {
    const result = narratePageEntry('visualization', undefined, t);
    expect(result).toContain('screenReader.navVisualization');
  });

  it('maps quality route to navQuality', async () => {
    const result = narratePageEntry('quality', undefined, t);
    expect(result).toContain('screenReader.navQuality');
  });

  it('maps database route to navDatabase', async () => {
    const result = narratePageEntry('database', undefined, t);
    expect(result).toContain('screenReader.navDatabase');
  });

  it('maps search route to navSearch', async () => {
    const result = narratePageEntry('search', undefined, t);
    expect(result).toContain('screenReader.navSearch');
  });

  it('handles undefined count with 0', async () => {
    const result = narratePageEntry('persons', undefined, t);
    expect(result).toContain('count=0');
  });
});

describe('narrateModalOpen', async () => {
  it('returns formOpen key with title and field count', async () => {
    const result = narrateModalOpen('Add Person', 5, t);
    expect(result).toContain('screenReader.formOpen');
    expect(result).toContain('title=Add Person');
    expect(result).toContain('count=5');
  });
});

describe('narrateFieldFocus', async () => {
  it('returns fieldText key for text type with value', async () => {
    const result = narrateFieldFocus('Given Name', 'text', 'Erik', t);
    expect(result).toContain('screenReader.fieldText');
    expect(result).toContain('label=Given Name');
    expect(result).toContain('value=Erik');
  });

  it('returns fieldTextEmpty key for text type with empty value', async () => {
    const result = narrateFieldFocus('Given Name', 'text', '', t);
    expect(result).toContain('screenReader.fieldTextEmpty');
    expect(result).toContain('label=Given Name');
  });

  it('returns fieldDropdown key for dropdown type with value', async () => {
    const result = narrateFieldFocus('Sex', 'dropdown', 'Male', t);
    expect(result).toContain('screenReader.fieldDropdown');
    expect(result).toContain('label=Sex');
    expect(result).toContain('value=Male');
  });

  it('returns fieldDropdown key for dropdown type with empty value', async () => {
    const result = narrateFieldFocus('Sex', 'dropdown', '', t);
    expect(result).toContain('screenReader.fieldDropdown');
  });

  it('returns fieldSearch key for search type with value', async () => {
    const result = narrateFieldFocus('Person', 'search', 'Erik', t);
    expect(result).toContain('screenReader.fieldSearch');
    expect(result).toContain('value=Erik');
  });

  it('returns fieldSearchEmpty key for search type with empty value', async () => {
    const result = narrateFieldFocus('Person', 'search', '', t);
    expect(result).toContain('screenReader.fieldSearchEmpty');
    expect(result).toContain('label=Person');
  });
});

describe('narrateSearchResults', async () => {
  it('returns searchMatches key with count when count > 0', async () => {
    const result = narrateSearchResults(5, t);
    expect(result).toContain('screenReader.searchMatches');
    expect(result).toContain('count=5');
  });

  it('returns searchNoMatches key when count is 0', async () => {
    const result = narrateSearchResults(0, t);
    expect(result).toContain('screenReader.searchNoMatches');
  });

  it('returns searchNoMatches for negative count', async () => {
    const result = narrateSearchResults(-1, t);
    expect(result).toContain('screenReader.searchNoMatches');
  });
});

describe('narrateAction', async () => {
  it('returns actionSaved key for saved action', async () => {
    const result = narrateAction('saved', undefined, t);
    expect(result).toContain('screenReader.actionSaved');
  });

  it('returns actionDeleted key with name for deleted action', async () => {
    const result = narrateAction('deleted', 'Erik Johansson', t);
    expect(result).toContain('screenReader.actionDeleted');
    expect(result).toContain('name=Erik Johansson');
  });

  it('returns actionModalClosed key for modalClosed action', async () => {
    const result = narrateAction('modalClosed', undefined, t);
    expect(result).toContain('screenReader.actionModalClosed');
  });

  it('returns actionEditing key with name for editing action', async () => {
    const result = narrateAction('editing', 'Erik Johansson', t);
    expect(result).toContain('screenReader.actionEditing');
    expect(result).toContain('name=Erik Johansson');
  });

  it('returns actionNew key with type for new action', async () => {
    const result = narrateAction('new', 'person', t);
    expect(result).toContain('screenReader.actionNew');
    expect(result).toContain('type=person');
  });

  it('returns actionError key with message for error action', async () => {
    const result = narrateAction('error', 'Network failure', t);
    expect(result).toContain('screenReader.actionError');
    expect(result).toContain('message=Network failure');
  });

  it('handles undefined target for deleted', async () => {
    const result = narrateAction('deleted', undefined, t);
    expect(result).toContain('screenReader.actionDeleted');
  });
});
