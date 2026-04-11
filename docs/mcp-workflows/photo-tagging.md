# Workflow: Photo Tagging with AI

Use Claude's vision capabilities to help identify and tag people in your genealogy photos.

## When to Use

- You have scanned family photos that need to be linked to persons in your tree
- You want to organize inherited photo collections
- You want to cross-reference known photos with unidentified ones

## Prerequisites

- Photos must be registered as media records in Slaktforskning (via the app UI or `create_media`)
- The `file_ref` field on each media record must point to the actual image file on disk

## Step-by-Step

### 1. Find unlinked media

> "List all media records in my tree. Which ones have no links to any persons?"

Claude calls `list_media` to get all media records, then `get_media_for_entity` with entity_type "person" for each to find which media items are not linked to anyone.

### 2. Gather context about a photo

Before asking Claude to analyze a photo, provide context:

> "This photo (media ID: [id]) is from a family gathering around 1920 in Gothenburg. The people in my tree who were living in Gothenburg around that time are..."

Claude can help narrow candidates by calling:
- `search_persons` with family names
- `get_events_for_person` to check residence and census events near the photo's date
- `get_relationships_of_person` to identify family groups likely to be photographed together

### 3. Link identified photos to persons

Once you know who is in a photo:

> "Link this photo (media ID: [id]) to person [person_id] as a portrait."

Claude calls `add_media_link` with:
- `media_id`: the photo's ID
- `entity_type`: "person"
- `entity_id`: the person's ID
- `link_type`: "portrait" (or "photo", "document", etc.)

### 4. Link photos to events

Photos often correspond to specific events:

> "Link this wedding photo to the marriage event between Erik and Maria."

Claude finds the marriage event via `get_events_for_relationship`, then calls `add_media_link` with entity_type "event".

### 5. Organize with sort order

If a person has multiple photos, set the order:

> "Make the portrait photo the first image for this person."

Claude calls `reorder_media_links` with the link IDs in the desired order. The first media item serves as the profile image.

## Working with Groups of Photos

For a batch of photos from the same event or family:

> "I have 15 photos from my grandmother's photo album. They're all registered as media records with titles starting with 'Album-'. Help me go through them and link them to the right persons. Start by listing all media with 'Album' in the title, then for each one, I'll tell you who's in it."

Claude calls `list_media` and filters by title, then you can work through them one at a time with `add_media_link`.

## Tips

- Always provide context about the photo's date and location -- this helps narrow the candidate list dramatically
- Link photos to both persons AND events when applicable (a wedding photo links to the people and the marriage event)
- Use the `link_type` field to distinguish portraits from group photos, documents, and other media types
- The first media link for a person (lowest sort_order) is used as their profile image in the app
- For document images (church records, certificates), link them to the relevant source with entity_type "source"
