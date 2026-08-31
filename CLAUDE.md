# CLAUDE.md

**Interview Prep Notes** - static study site on GitHub Pages
(https://kalyan-pologi.github.io/Interview-Prep-Notes/). A multi-file SPA:
one URL, client-side `#hash` navigation. Plain HTML/CSS/vanilla JS, no build step.
Same template as the sibling site `System-Design-Notes`.

## Structure

- `index.html` - shell: sidebar nav + empty `#content`
- `assets/style.css` - all styling · `assets/app.js` - hash router (fetches notes, caches)
- `notes/<id>.html` - one note per file = its inner HTML only

## Sections

- **Intro** - self-introduction
- **Project Write-ups** - `proj-reidyai` (combined Reidy/CashFlowMW/ReidyAI write-up),
  `proj-citibank`, `proj-accenture`, `proj-fortis`, `proj-rag-chatbot`. These are content
  write-ups about past work, not live projects.
- **Java & Spring** - `java-topics`, `spring-topics`, `solid-patterns`
- **Behavioral** - `behavioral-01` through `behavioral-20`, STAR-format (Situation/Task/
  Action/Result), 2 stories per question, sourced from `interview-prep.md` in this same
  folder (the source of truth for behavioral content - keep both in sync when either changes)
- **Tooling** - `git-commands`, `junit-concepts`, `java-snippets`, `sql-snippets`
- **DevOps** - `devops-daily`, `devops-useful`, `docker`, `kubernetes`, `minikube`
- **Frontend** - `html`, `css`, `javascript`, `typescript`, `frontend-quickref`, `react`,
  `redux`, `angular`

## Add or fill in a note

1. `notes/<id>.html` with **only** the note body (no page wrapper / `.section` wrapper /
   `<style>` / `<script>`). Start with a `.section-header` (tag + h1 + summary), matching
   the pattern already in every stub file.
2. Sidebar link in `index.html`: `<a class="nav-sub" href="#<id>" data-note="<id>">Title</a>`.
3. `<id>` must match across filename, `href`, and `data-note`.
4. Write substantial content, not a skeleton, once a topic is being actively filled in - this
   is real study material, not a placeholder. Replace the `.coming-soon` block entirely.

## Note body conventions

- **Prose notes** (project write-ups, Java/Spring topic explanations): wrap the body in
  `.note-body` so headings/paragraphs/code use the scoped styles already in `style.css`.
- **Behavioral notes**: use `.story-block` per story, with `.star-row` +
  `<span class="star-label">Situation:</span>` etc. inside each, matching the STAR structure
  already used in `interview-prep.md`.
- **Cheat-sheet / reference notes** (Git commands, code snippets, DevOps commands): reuse the
  `.grid2`/`.grid3` + `.card` + `.row .k`/`.row .v` pattern from System-Design-Notes for
  tabular command references, or `.note-body pre code` for larger code blocks.

## Diagrams & images in a note

To pair prose with a diagram or a screenshot pulled from the source PDF/doc:

1. Wrap the note body's prose in `.note-body` and place the image in a
   `<figure class="note-figure">`:

   ```html
   <div class="note-body">
     <p>Explain the concept. Use <b>bold</b> for key terms and <code>code</code>.</p>
     <figure class="note-figure">
       <img src="assets/img/<name>.png" alt="Describe the diagram for accessibility">
       <figcaption>Short caption</figcaption>
     </figure>
   </div>
   ```

2. Image files go in `assets/img/`. Kalyan exports/screenshots them manually from source PDFs
   (no PDF image extraction available in this environment) and drops them there. Paths are
   relative to `index.html` (the root) - always `assets/img/...`, never `../assets/...`.

## Rules

- Notes are pure fragments; the router owns layout. Reuse existing CSS classes; new CSS
  goes in `style.css` (never inline). Keep paths relative. No CDNs/dependencies.
- Verify over a local server (`fetch` fails on `file://`): `python -m http.server 8000`.
- Commit/push only when asked. `git pull` first - `main` may be edited on GitHub directly.
- **Never use em dashes (—) or en dashes (–) anywhere** - in notes, in this file, in commit
  messages, in chat responses. Use a comma, a period, "and"/"but", parentheses, or a plain
  hyphen instead.

## Who I am

Kalyan. Preparing for backend/full-stack interviews. Building this site as personal study
notes, alongside a companion site `System-Design-Notes` for system design specifically.

## Source material

- `interview-prep.md` in this same folder - source of truth for the Intro and all 20
  behavioral Q&A, already written and reviewed. Port into `notes/behavioral-XX.html` without
  changing the wording.
- A 170-page revision doc (formerly `Screening.pdf` in this folder, since replaced by a
  Google Doc export) covering Java, Spring, SOLID/patterns, Git, JUnit, code snippets,
  DevOps, frontend frameworks, and the project write-ups. Source content for everything in
  this repo outside of Intro/Behavioral - extract and adapt into the matching note file per
  the section list above, don't paste verbatim.
