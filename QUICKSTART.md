# Your first family tree in 10 minutes

A guided walk-through that takes a brand-new install from empty to a small, sourced family. The full reference is in [MANUAL.md](MANUAL.md); this is the path-of-least-resistance for someone who has just downloaded the app.

1. **Install and open the app.** macOS: drag the `.app` to /Applications and right-click → Open the first time (unsigned). Windows: run the NSIS installer. Linux: `chmod +x` the `.AppImage` and double-click. The app opens to an empty Persons view.

   ![Empty Persons view on first launch](docs/quickstart/01-empty-state.png)

2. **Add yourself first.** Click **+ Person** in the top-right. Fill in your given name and surname. Pick your sex. Press **Save**. The new row appears in the Persons list on the left.

   ![New Person modal with the form](docs/quickstart/02-person-modal.png)

3. **Open your side panel.** Click your row. The right-hand panel shows your details. This is where every part of your record — events, names, sources, media, groups — lives.

   ![Side panel populated with the new person's details](docs/quickstart/03-side-panel.png)

4. **Add a birth event.** In the side panel, scroll to **Events** and press **+ Event**. Pick **birth**, type your birth date, and add your birthplace. The place auto-resolves against the bundled gazetteers — start typing "Stockholm" and pick the match. Press **Save**.

   ![Event modal with the Birth type selected](docs/quickstart/04-event-modal.png)

5. **Add a parent.** In **Add family member** at the top of the panel, click **+ Father** (or Mother). Fill the modal exactly like step 2. The parent appears in the Persons list AND as a related person in your side panel.

   ![+ Father modal asking whether the person is already in the tree or new](docs/quickstart/05-add-father.png)

6. **Add a sibling or child.** From your father's side panel (click his row), use **+ Son** or **+ Daughter** to add yourself's sibling, or use **+ Spouse/Partner** on yourself first and then **+ Son/+ Daughter** to add a child. Every new person gets a row in the list.

   ![+ Son modal opened on the father's panel for adding a sibling](docs/quickstart/06-add-son.png)

7. **Attach a source.** Click **+ Source** in the side panel's **Sources** section. Type the source title (e.g. your birth certificate, a church record, an Ancestry tree URL). Save. Then click **Cite** on any event to link the source to that event with a page reference and confidence level.

   ![New Source modal with the title field focused](docs/quickstart/07-add-source.png)

8. **Look at your tree.** Click the **Family tree** tab in the center. Pick **Pedigree** (ancestors-only) or **Hourglass** (ancestors + descendants). Your tree renders with portraits if you've attached any media. Click any person in the tree to refocus.

   ![Family tree pedigree view showing the daughter selected with her father visible](docs/quickstart/08-family-tree.png)

Next steps when you're ready:

- **Import an existing tree** via Settings → Import — GEDCOM 5.5.1 / 7.0, Genney, Holger, RootsMagic, or Gramps. Drop in your file; the importer reports what was modelled and what couldn't be (e.g. ASSO-without-event in 5.5.1).
- **Open a second window** with Cmd+N (macOS) / Ctrl+N (Windows / Linux) — useful for side-by-side person research.
- **Add face tags to media** — open any photo in the media viewer (double-click), press **+ Draw**, drag a rectangle around a face, assign a person. That cropped face becomes the person's profile picture everywhere in the app.
- **Export to a static keepsake site** via Settings → Website — bake your tree into a self-contained HTML site you can host anywhere.

See [MANUAL.md](MANUAL.md) for the full reference covering every panel, importer, report, and feature.
