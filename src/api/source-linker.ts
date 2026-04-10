export interface LinkRule {
  id: string;
  name: string;
  pattern: string;
  urlTemplate: string;
  locale: string;
  enabled: boolean;
  priority: number;
  example?: string;
}

export interface LinkedSegment {
  text: string;
  url?: string;
  ruleName?: string;
}

export interface LinkRuleOverrides {
  enabledLocales: string[];
  overrides: Record<string, Partial<LinkRule> & { enabled?: boolean }>;
}

function substituteCaptures(template: string, match: RegExpMatchArray): string {
  return template.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10);
    if (idx === 0) return match[0];
    return match[idx] ?? '';
  });
}

export function linkify(text: string, rules: LinkRule[]): LinkedSegment[] {
  if (!text) return [];

  const enabledRules = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  if (enabledRules.length === 0) return [{ text }];

  interface Match {
    start: number;
    end: number;
    text: string;
    url: string;
    ruleName: string;
    priority: number;
  }

  const matches: Match[] = [];

  for (const rule of enabledRules) {
    const regex = new RegExp(rule.pattern, 'g');
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const url = substituteCaptures(rule.urlTemplate, m);
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        url,
        ruleName: rule.name,
        priority: rule.priority,
      });
    }
  }

  if (matches.length === 0) return [{ text }];

  matches.sort((a, b) => a.start - b.start || a.priority - b.priority);

  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  const segments: LinkedSegment[] = [];
  let pos = 0;
  for (const m of filtered) {
    if (m.start > pos) {
      segments.push({ text: text.slice(pos, m.start) });
    }
    segments.push({ text: m.text, url: m.url, ruleName: m.ruleName });
    pos = m.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos) });
  }

  return segments;
}

export function resolveRules(
  allDefaults: LinkRule[],
  config: LinkRuleOverrides
): LinkRule[] {
  const { enabledLocales, overrides } = config;

  const activeLocales = new Set([...enabledLocales, '*']);
  const rules = allDefaults
    .filter((r) => activeLocales.has(r.locale))
    .map((r) => {
      const override = overrides[r.id];
      if (!override) return r;
      return { ...r, ...override };
    });

  const defaultIds = new Set(allDefaults.map((r) => r.id));
  for (const [id, override] of Object.entries(overrides)) {
    if (!defaultIds.has(id) && override.pattern && override.urlTemplate && override.name) {
      rules.push({
        id,
        name: override.name!,
        pattern: override.pattern!,
        urlTemplate: override.urlTemplate!,
        locale: override.locale ?? '*',
        enabled: override.enabled ?? true,
        priority: override.priority ?? 50,
      });
    }
  }

  return rules.sort((a, b) => a.priority - b.priority);
}
