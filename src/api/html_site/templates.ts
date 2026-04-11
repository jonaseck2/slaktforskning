/**
 * HTML template functions for static site export.
 * All functions return HTML strings — no DOM or JSDOM needed.
 *
 * Security note: All user-supplied text goes through esc() which escapes
 * HTML entities. The search page uses textContent for safe DOM insertion.
 * The innerHTML usage in search results only inserts sanitized anchor elements
 * created via createElement — no raw user input is set as innerHTML.
 */

import type { Person, PersonName, GenealogyEvent, Relationship, Source, Citation, Place } from '../types';

// ── Helpers ──────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(event: { date_type: string; date_value: string | null; date_value_end: string | null; date_original: string }): string {
  if (event.date_original) return esc(event.date_original);
  if (!event.date_value) return '';
  const prefix: Record<string, string> = {
    about: 'c. ', before: 'bef. ', after: 'aft. ', calculated: 'calc. ',
  };
  const p = prefix[event.date_type] ?? '';
  if (event.date_type === 'between' && event.date_value_end) {
    return `${esc(event.date_value)} - ${esc(event.date_value_end)}`;
  }
  return p + esc(event.date_value);
}

function formatEventType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

function personDisplayName(names: PersonName[]): string {
  if (!names.length) return '(unknown)';
  const primary = names.find(n => n.sort_order === 0) ?? names[0];
  const parts: string[] = [];
  if (primary.given_name) parts.push(primary.given_name);
  if (primary.surname) parts.push(primary.surname);
  return parts.join(' ') || '(unknown)';
}

// ── Page wrapper ─────────────────────────────────────────

export interface PageOptions {
  title: string;
  bodyHtml: string;
  breadcrumb?: { label: string; href: string }[];
  siteTitle?: string;
}

export function pageTemplate(opts: PageOptions): string {
  const { title, bodyHtml, breadcrumb, siteTitle } = opts;
  const siteName = siteTitle ?? 'Family Tree';

  const breadcrumbHtml = breadcrumb?.length
    ? `<div class="breadcrumb">${breadcrumb.map(b => `<a href="${esc(b.href)}">${esc(b.label)}</a>`).join(' &rsaquo; ')} &rsaquo; ${esc(title)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} - ${esc(siteName)}</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <header class="site-header">
    <h1>${esc(siteName)}</h1>
    <nav>
      <a href="../index.html">Persons</a>
      <a href="../places.html">Places</a>
      <a href="../sources.html">Sources</a>
      <a href="../search.html">Search</a>
    </nav>
  </header>
  <main class="content">
    ${breadcrumbHtml}
    ${bodyHtml}
  </main>
  <footer class="site-footer">Generated from Slaktforskning</footer>
</body>
</html>`;
}

export function rootPageTemplate(opts: { title: string; bodyHtml: string; siteTitle?: string }): string {
  const { title, bodyHtml, siteTitle } = opts;
  const siteName = siteTitle ?? 'Family Tree';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} - ${esc(siteName)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <h1>${esc(siteName)}</h1>
    <nav>
      <a href="index.html">Persons</a>
      <a href="places.html">Places</a>
      <a href="sources.html">Sources</a>
      <a href="search.html">Search</a>
    </nav>
  </header>
  <main class="content">
    ${bodyHtml}
  </main>
  <footer class="site-footer">Generated from Slaktforskning</footer>
</body>
</html>`;
}

// ── Index page ───────────────────────────────────────────

export interface PersonSummary {
  id: string;
  given_name: string;
  surname: string;
  birthDate?: string;
  deathDate?: string;
}

export function indexPage(persons: PersonSummary[], siteTitle?: string): string {
  // Group by first letter of surname, then given_name
  const sorted = [...persons].sort((a, b) => {
    const sA = (a.surname || '').toLowerCase();
    const sB = (b.surname || '').toLowerCase();
    if (sA !== sB) return sA.localeCompare(sB);
    return (a.given_name || '').toLowerCase().localeCompare((b.given_name || '').toLowerCase());
  });

  const groups = new Map<string, PersonSummary[]>();
  for (const p of sorted) {
    const letter = (p.surname || p.given_name || '?').charAt(0).toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(p);
  }

  let body = `<h2>Persons (${persons.length})</h2>`;
  for (const [letter, members] of groups) {
    body += `<div class="letter-group"><h3>${esc(letter)}</h3><ul class="person-list">`;
    for (const p of members) {
      const name = [p.surname, p.given_name].filter(Boolean).join(', ') || '(unknown)';
      const dates = [p.birthDate, p.deathDate].filter(Boolean).join(' - ');
      body += `<li><a href="persons/${esc(p.id)}.html">${esc(name)}</a>${dates ? `<span class="dates">(${esc(dates)})</span>` : ''}</li>`;
    }
    body += `</ul></div>`;
  }

  return rootPageTemplate({ title: 'Persons', bodyHtml: body, siteTitle });
}

// ── Person page ──────────────────────────────────────────

export interface PersonPageData {
  person: Person;
  names: PersonName[];
  events: (GenealogyEvent & { place_name?: string })[];
  relationships: (Relationship & {
    other_person_id: string | null;
    other_person_name: string;
  })[];
  citations: (Citation & { source_title?: string })[];
}

export function personPage(data: PersonPageData, siteTitle?: string): string {
  const { person, names, events, relationships, citations } = data;
  const displayName = personDisplayName(names);

  let body = `<div class="person-header"><h2>${esc(displayName)}</h2><span class="sex-badge ${person.sex}">${person.sex}</span></div>`;

  // Life dates subtitle
  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');
  if (birth || death) {
    const parts: string[] = [];
    if (birth) parts.push(formatDate(birth));
    if (death) parts.push(formatDate(death));
    body += `<p class="subtitle">${parts.join(' - ')}</p>`;
  }

  // Names
  if (names.length > 1) {
    body += `<div class="detail-section"><h3>Names</h3><table><thead><tr><th>Given name</th><th>Surname</th><th>Type</th></tr></thead><tbody>`;
    for (const n of names) {
      body += `<tr><td>${esc(n.given_name)}</td><td>${esc(n.surname)}</td><td>${esc(n.name_type)}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  // Events
  if (events.length) {
    body += `<div class="detail-section"><h3>Events</h3><table><thead><tr><th>Date</th><th>Type</th><th>Place</th><th>Description</th></tr></thead><tbody>`;
    for (const e of events) {
      const placeName = e.place_name || e.place_address || '';
      const placeLink = e.place_id ? `<a href="../places/${esc(e.place_id)}.html">${esc(placeName)}</a>` : esc(placeName);
      body += `<tr><td>${formatDate(e)}</td><td>${formatEventType(e.event_type)}</td><td>${placeLink}</td><td>${esc(e.description)}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  // Relationships
  if (relationships.length) {
    body += `<div class="detail-section"><h3>Relationships</h3><table><thead><tr><th>Type</th><th>Person</th></tr></thead><tbody>`;
    for (const r of relationships) {
      const typeLabel = r.subtype ? `${formatEventType(r.type)} (${r.subtype})` : formatEventType(r.type);
      const personLink = r.other_person_id
        ? `<a href="../persons/${esc(r.other_person_id)}.html">${esc(r.other_person_name)}</a>`
        : esc(r.other_person_name);
      body += `<tr><td><span class="rel-type">${esc(typeLabel)}</span></td><td>${personLink}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  // Citations
  if (citations.length) {
    body += `<div class="detail-section"><h3>Sources</h3><table><thead><tr><th>Source</th><th>Page</th><th>Notes</th></tr></thead><tbody>`;
    for (const c of citations) {
      const sourceLink = `<a href="../sources/${esc(c.source_id)}.html">${esc(c.source_title || '(untitled)')}</a>`;
      body += `<tr><td>${sourceLink}</td><td>${esc(c.page)}</td><td>${esc(c.notes)}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  // Notes
  if (person.notes) {
    body += `<div class="detail-section"><h3>Notes</h3><div class="notes">${esc(person.notes)}</div></div>`;
  }

  return pageTemplate({
    title: displayName,
    bodyHtml: body,
    breadcrumb: [{ label: 'Persons', href: '../index.html' }],
    siteTitle,
  });
}

// ── Place page ───────────────────────────────────────────

export interface PlacePageData {
  place: Place;
  placePath: string;
  events: (GenealogyEvent & { participant_names?: string })[];
}

export function placePage(data: PlacePageData, siteTitle?: string): string {
  const { place, placePath, events } = data;

  let body = `<h2>${esc(place.name)}</h2>`;
  if (place.place_type) body += `<p class="subtitle">${formatEventType(place.place_type)}</p>`;
  if (placePath && placePath !== place.name) {
    body += `<p class="subtitle">${esc(placePath)}</p>`;
  }

  if (events.length) {
    body += `<div class="detail-section"><h3>Events at this place</h3><table><thead><tr><th>Date</th><th>Type</th><th>Participants</th></tr></thead><tbody>`;
    for (const e of events) {
      body += `<tr><td>${formatDate(e)}</td><td>${formatEventType(e.event_type)}</td><td>${esc(e.participant_names || '')}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  if (place.notes) {
    body += `<div class="detail-section"><h3>Notes</h3><div class="notes">${esc(place.notes)}</div></div>`;
  }

  return pageTemplate({
    title: place.name,
    bodyHtml: body,
    breadcrumb: [{ label: 'Places', href: '../places.html' }],
    siteTitle,
  });
}

// ── Source page ──────────────────────────────────────────

export interface SourcePageData {
  source: Source;
  citations: (Citation & { person_name?: string; person_id?: string | null; event_type?: string })[];
}

export function sourcePage(data: SourcePageData, siteTitle?: string): string {
  const { source, citations } = data;

  let body = `<h2>${esc(source.title || '(untitled)')}</h2>`;

  // Source details
  const details: [string, string][] = [];
  if (source.author) details.push(['Author', source.author]);
  if (source.publication_info) details.push(['Publication', source.publication_info]);
  if (source.repository) details.push(['Repository', source.repository]);
  if (source.source_type) details.push(['Type', formatEventType(source.source_type)]);
  if (source.call_number) details.push(['Call number', source.call_number]);
  if (source.url) details.push(['URL', source.url]);

  if (details.length) {
    body += `<div class="detail-section"><table><tbody>`;
    for (const [label, value] of details) {
      const displayValue = label === 'URL' ? `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a>` : esc(value);
      body += `<tr><th>${esc(label)}</th><td>${displayValue}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  if (source.abstract) {
    body += `<div class="detail-section"><h3>Abstract</h3><div class="notes">${esc(source.abstract)}</div></div>`;
  }

  // Citations
  if (citations.length) {
    body += `<div class="detail-section"><h3>Citations</h3><table><thead><tr><th>Person</th><th>Event</th><th>Page</th><th>Notes</th></tr></thead><tbody>`;
    for (const c of citations) {
      const personLink = c.person_id
        ? `<a href="../persons/${esc(c.person_id)}.html">${esc(c.person_name || '(unknown)')}</a>`
        : esc(c.person_name || '');
      body += `<tr><td>${personLink}</td><td>${c.event_type ? formatEventType(c.event_type) : ''}</td><td>${esc(c.page)}</td><td>${esc(c.notes)}</td></tr>`;
    }
    body += `</tbody></table></div>`;
  }

  return pageTemplate({
    title: source.title || '(untitled)',
    bodyHtml: body,
    breadcrumb: [{ label: 'Sources', href: '../sources.html' }],
    siteTitle,
  });
}

// ── Places index ─────────────────────────────────────────

export function placesIndexPage(placesList: { id: string; name: string; place_type: string | null; event_count: number }[], siteTitle?: string): string {
  let body = `<h2>Places (${placesList.length})</h2>`;
  if (placesList.length) {
    body += `<table><thead><tr><th>Name</th><th>Type</th><th>Events</th></tr></thead><tbody>`;
    for (const p of placesList) {
      body += `<tr><td><a href="places/${esc(p.id)}.html">${esc(p.name)}</a></td><td>${p.place_type ? formatEventType(p.place_type) : ''}</td><td>${p.event_count}</td></tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += `<p>No places.</p>`;
  }
  return rootPageTemplate({ title: 'Places', bodyHtml: body, siteTitle });
}

// ── Sources index ────────────────────────────────────────

export function sourcesIndexPage(sourcesList: { id: string; title: string; author: string; citation_count: number }[], siteTitle?: string): string {
  let body = `<h2>Sources (${sourcesList.length})</h2>`;
  if (sourcesList.length) {
    body += `<table><thead><tr><th>Title</th><th>Author</th><th>Citations</th></tr></thead><tbody>`;
    for (const s of sourcesList) {
      body += `<tr><td><a href="sources/${esc(s.id)}.html">${esc(s.title || '(untitled)')}</a></td><td>${esc(s.author)}</td><td>${s.citation_count}</td></tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += `<p>No sources.</p>`;
  }
  return rootPageTemplate({ title: 'Sources', bodyHtml: body, siteTitle });
}

// ── Search page ──────────────────────────────────────────

export function searchPage(siteTitle?: string): string {
  // The search page uses safe DOM methods (createElement, textContent)
  // for inserting search results. No raw user input is set as HTML.
  const body = `
    <h2>Search</h2>
    <input type="text" class="search-input" id="searchInput" placeholder="Type to search persons, places, sources..." autofocus>
    <ul class="search-results" id="searchResults"></ul>
    <p class="no-results" id="noResults" style="display:none">No results found.</p>
    <script>
      (function() {
        var data = [];
        var input = document.getElementById('searchInput');
        var resultsList = document.getElementById('searchResults');
        var noResults = document.getElementById('noResults');

        fetch('search.json')
          .then(function(r) { return r.json(); })
          .then(function(d) { data = d; })
          .catch(function() {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'search.json', true);
            xhr.onload = function() {
              if (xhr.status === 200 || xhr.status === 0) {
                data = JSON.parse(xhr.responseText);
              }
            };
            xhr.send();
          });

        input.addEventListener('input', function() {
          var q = input.value.toLowerCase().trim();
          while (resultsList.firstChild) resultsList.removeChild(resultsList.firstChild);
          noResults.style.display = 'none';
          if (!q) return;
          var matches = data.filter(function(item) {
            return item.text.toLowerCase().indexOf(q) !== -1;
          }).slice(0, 50);
          if (!matches.length) {
            noResults.style.display = 'block';
            return;
          }
          matches.forEach(function(item) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = item.url;
            a.textContent = item.text;
            li.appendChild(a);
            var badge = document.createElement('span');
            badge.className = 'type-badge';
            badge.textContent = item.type;
            li.appendChild(badge);
            resultsList.appendChild(li);
          });
        });
      })();
    </script>`;

  return rootPageTemplate({ title: 'Search', bodyHtml: body, siteTitle });
}

// Re-export helpers for use in generator
export { personDisplayName, esc };
