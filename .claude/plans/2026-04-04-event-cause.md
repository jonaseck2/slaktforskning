# Investigation: EVENT.cause field

## Background
Genney stores a CAUSE column on events. In GEDCOM 5.5.1, CAUS is a sub-tag of individual events (BIRT, DEAT, MARR, etc.). The most common use case is cause of death (DEAT.CAUS = "Stroke"). But GEDCOM allows CAUS on any event type.

The `cause` column is already added to our `events` table (v0.7.0) and populated from Genney import. The GenealogyEvent type has `cause: string | null`. This plan tracks the design investigation before exposing it in the UI.

## Questions to resolve

### 1. Is CAUS applicable to all event types, or just DEAT?

GEDCOM 5.5.1 spec: CAUS is listed under "Individual Event Detail" which applies to all individual events. Common uses:
- DEAT: cause of death (very common, genealogically significant)
- BIRT: birth complications (rare but documented)
- MARR: reason for marriage record (extremely rare)
- EMIG: push factor for emigration (sometimes documented as cause)
- RESI: reason for residence change (e.g., "work relocation")

**Conclusion**: CAUS is formally applicable to any event, but genealogically meaningful primarily for DEAT, and occasionally for EMIG, BIRT (complications), PROB (reason for probate).

### 2. GEDCOM-X data model comparison

In GEDCOM-X, there is no direct "cause" field on events. Instead, cause-of-death information is represented as:
- A `Fact` with `type` = `http://gedcomx.org/CauseOfDeath` attached to a `Person`
- Or as a `Note` attached to the death `Event`

The GEDCOM-X approach treats cause-of-death as a separate claim about the person, not a property of the event. This aligns with their evidence/assertion model.

**Tradeoff**:
- Our current model (cause on event): Simple, matches GEDCOM 5.5.1 and common genealogy software expectations. Good for import/export roundtrip. Easy to display next to the event.
- GEDCOM-X approach (cause as a person fact/assertion): More principled — enables tracking the source of the cause claim separately from the event. But more complex to implement and explain to users.

### 3. Recommendation

**Keep `cause TEXT` on events.** Rationale:
- All data we import (Genney, GEDCOM) stores it as an event property.
- The primary use case (cause of death) is clearly tied to the death event — showing them together is natural UX.
- If we later add assertion tracking, `cause` can be promoted to an assertion alongside `description` without breaking the schema.
- GEDCOM export roundtrip is cleaner with cause on the event.

## UI implementation (when ready)

- In EventForm: show "Orsak" (Cause) text field only for event types where it is meaningful: `death`, `birth`, `emigration`, `probate`, `will`, `other`
- In EventList row: if cause is set on a death event, show it in the description column as "(Orsak: stroke)" or similar
- In PersonDetailView: the death event row should display cause prominently
- i18n key: `events.cause` / `events.causePlaceholder`

## GEDCOM export
The existing GEDCOM exporter should emit `2 CAUS <value>` under the event when `cause` is non-null. Track this as a separate task when the GEDCOM exporter is updated.
