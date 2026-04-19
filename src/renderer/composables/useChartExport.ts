export function buildExportSvgString(el: SVGElement): string {
  const clone = el.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return new XMLSerializer().serializeToString(clone);
}

export function wrapWithTitle(svgString: string, title: string): string {
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\u2014/g, '&#8212;');
  const titleNode = `<text x="50%" y="32" text-anchor="middle" font-size="24" font-family="system-ui, sans-serif" fill="currentColor">${escaped}</text>`;
  return svgString.replace(/(<svg[^>]*>)/, `$1${titleNode}`);
}
