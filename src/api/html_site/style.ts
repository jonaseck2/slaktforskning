/**
 * Shared CSS for the static HTML site export.
 * Returns a self-contained CSS string with responsive, print-friendly styling.
 * No external dependencies.
 */
export function getSiteCSS(): string {
  return `
/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  background: #fafafa;
  padding: 0;
  margin: 0;
}

a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.site-header {
  background: #1e293b;
  color: white;
  padding: 16px 24px;
}
.site-header h1 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 20px;
  font-weight: 600;
}
.site-header nav {
  margin-top: 8px;
  display: flex;
  gap: 16px;
}
.site-header nav a {
  color: #93c5fd;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}
.site-header nav a:hover { color: white; }

.breadcrumb {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 16px;
}
.breadcrumb a { color: #64748b; }
.breadcrumb a:hover { color: #2563eb; }

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

h2 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 16px;
}

h3 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #334155;
  margin-top: 24px;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 15px;
  color: #64748b;
  margin-top: -12px;
  margin-bottom: 16px;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 14px;
}
th, td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
}
th {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  background: #f8fafc;
}
tr:hover { background: #f8fafc; }

/* Person list */
.letter-group { margin-bottom: 24px; }
.letter-group h3 {
  font-size: 20px;
  color: #1e293b;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 4px;
  margin-top: 16px;
}
.person-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.person-list li { padding: 4px 0; }
.person-list .dates {
  color: #64748b;
  font-size: 14px;
  margin-left: 8px;
}

/* Detail sections */
.detail-section { margin-bottom: 24px; }

.person-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
}

.sex-badge {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
}
.sex-badge.M { background: #dbeafe; color: #1d4ed8; }
.sex-badge.F { background: #fce7f3; color: #be185d; }
.sex-badge.U { background: #f1f5f9; color: #64748b; }

.rel-type {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f0fdf4;
  color: #15803d;
}

.notes {
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  padding: 12px 16px;
  margin: 8px 0;
  font-size: 14px;
  white-space: pre-wrap;
}

/* Footer */
.site-footer {
  text-align: center;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  color: #94a3b8;
  border-top: 1px solid #e2e8f0;
  margin-top: 32px;
}

/* Search page */
.search-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-family: inherit;
  margin-bottom: 16px;
}
.search-input:focus {
  outline: none;
  border-color: #2563eb;
}
.search-results { list-style: none; }
.search-results li {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}
.search-results .type-badge {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #64748b;
  margin-left: 8px;
}
.no-results {
  color: #94a3b8;
  font-style: italic;
  padding: 16px 0;
}

/* Responsive */
@media (max-width: 600px) {
  .content { padding: 16px; }
  table { font-size: 13px; }
  th, td { padding: 6px 8px; }
}

/* Print */
@media print {
  body { background: white; }
  .site-header { background: #333; }
  .site-header nav { display: none; }
  .content { max-width: none; padding: 0; }
  a { color: #333; }
  table { page-break-inside: avoid; }
}
`.trim();
}
