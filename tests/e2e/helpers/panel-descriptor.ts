import type { AppDriver } from '../fixture';

export type SurfaceCheck =
  | 'host-flows-in'
  | 'fulfills-label'
  | 'lifecycle-parity'
  | 'no-degradation';

export interface PanelSectionCheck {
  /** Visible section title (English; Swedish UI text resolved via setLocale('en')). */
  title: string;
  /** Primary CTA button visible label. */
  primaryCtaLabel: string;
  /** Which Surface Contract checks this section participates in. */
  checks: SurfaceCheck[];
}

export interface PanelDescriptor {
  /** Display name in test reports — matches the `*Panel.vue` filename. */
  name: string;
  /** Route to navigate to after seeding host. Receives the seeded entity id. */
  route: (id: string) => string;
  /** Seed the host entity via MCP and return its id. */
  seed: (driver: AppDriver) => Promise<{ id: string }>;
  /** Sections to verify. Read-only panels (Report/Website/Export) may pass []. */
  sections: PanelSectionCheck[];
  /** Whether the panel itself must offer a Danger-zone delete affordance. */
  hostDeletable: boolean;
}
