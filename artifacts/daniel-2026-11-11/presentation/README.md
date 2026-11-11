# Daniel's existing presentation

The latest 21-slide presentation is preserved in two files under `output/`:

- `sherut-im-mashmaut-offline.pptx` — opens offline in PowerPoint. Each slide is a faithful full-slide image, with the original source notes retained. Individual slide text is not editable.
- `sherut-im-mashmaut-offline.html` — the original interactive presentation with embedded images and font. Save the attachment to the computer and open the downloaded file in a browser. It works offline; opening the external source links still needs internet. The HTML source remains editable.

Both attachments are below 8 MiB. Only three symbolic illustrations were recompressed for delivery. Original photographs, supplied screenshots, Hebrew copy, slide order, notes, navigation, and branding remain unchanged.

## Source and verification

The exact source was recovered from the November 6 presentation task, subsequently updated on November 8:

`/Users/bodokh/.codex/visualizations/2026/11/06/01a1b013-c7ee-7351-83ce-e6a11a2051b8/daniel-presentation`

Slide 19 matches Daniel's screenshot: תוכנית צופיה, שירות לאומי בשב״ס. Its original supplied image is `sources/daniel-tzofia-20261108.jpg` and is embedded unchanged in the HTML. No substitute photograph was used. The originals outside this folder were not changed.

The archived full HTML and delivered version 7 already render every image offline in local Chrome, including slide 19. Daniel's reported blank-image failure was not reproduced, so its cause remains unconfirmed. The fresh PowerPoint rendition provides a separate offline viewing path.

Verified locally:

- All 21 HTML slides render with zero broken images, JavaScript errors, or network requests.
- Keyboard navigation, slide overview, source dialog, and mobile viewport fit pass.
- All 21 HTML and PowerPoint slides were visually inspected.
- The PPTX passes package integrity, slide geometry, and first-party import checks, then renders all 21 slides using bundled LibreOffice. The rendered pages match the source images.
- Independent code review has no remaining findings.

PowerPoint desktop and Daniel's device have not been tested. Daniel was asked to confirm the images on his device; that confirmation remains pending.

## Private delivery

After local artifact verification, the root agent uploaded the raw files as new private Google Drive copies, verified MIME type and byte size, and granted only Daniel's existing verified Google account individual reader access. No public/domain permission was added, and existing files were unchanged. Download the files before using them offline; opening Drive's web viewer still needs internet.

- [PowerPoint copy](https://docs.google.com/presentation/d/18guHj6YVwJjhUXNjkfUo9wMyS75b9aZx/edit?usp=drivesdk&ouid=105827384160702885760&rtpof=true&sd=true)
- [HTML copy](https://drive.google.com/file/d/1ELzrtNAawcgV5zkPMOeQ9afgx_TRY08j/view?usp=drivesdk)

WhatsApp accepted the download-link message at `2026-11-11T17:43:41Z`, request `daniel-offline-presentation-links-20261111-1`. This is service acknowledgement, not delivery/read or device confirmation. A direct PowerPoint attachment attempt and its same-ID retry failed with HTTP 413 `RequestEntityTooLarge`; send-status lookup found no request, so no attachment delivery is claimed. [Delivery metadata](delivery.json) preserves the verified copy details and send evidence.

## Rebuilding

Build inputs and temporary review images are retained locally at `/tmp/daniel-whatsapp-2026-11-11/presentation-build`, outside the repository. The original source folder above remains the durable source of the slide content. Use the installed primary runtime's Node executable. The scripts use the verified existing runtime modules and do not install packages.

1. Run `/tmp/daniel-whatsapp-2026-11-11/presentation-build/build-offline.mjs` to repackage the archived version 7 HTML.
2. Run `render-offline.mjs` in the same build folder to check offline operation and capture the slides.
3. Run `export-pptx.mjs` there to create and validate the slide-image PPTX. The finalizer intentionally refuses to overwrite an existing final file; choose a fresh final filename for a new revision.

The temporary build folder preserves copied `web/`, `sources/`, and `research/` inputs and the full review evidence. This repository folder retains only the deliverables, compact verification reports, and a slide 19 proof image. No build inputs or review files are required to open the two deliverables.
