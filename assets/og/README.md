# Open Graph artwork

Version 3: twelve distinct illustrations generated with the built-in image-generation tool on 2026-11-04. This revision uses recognizable Israeli flags, Negev and Galilee landscapes, local plants, modern Tel Aviv architecture and Jerusalem limestone. The generic historic-village backdrop from version 2 has been replaced throughout the set.

Each optimized JPEG is 1200 × 630. `app/og/route.tsx` adds the unchanged original logo from `public/images/logo-mark.png` and the Heebo typography. No generated logo or AI lettering is used. Hebrew and English copy lives in `lib/og-copy.ts`, producing 24 localized covers.

Social-image URLs include `&v=3` so social crawlers fetch the revised artwork. Preview metadata uses the branch URL; production uses the official domain. SEO canonicals and language alternates stay on the official domain.

The Regular and Bold Heebo faces are static instances of the existing `app/(staff)/fonts/Heebo-variable.ttf` at weights 400 and 700, with its original OFL license included.

## Prompt set

Shared prompt, followed by the page-specific scene:

```text
Use case: ads-marketing.
Asset type: text-free editorial background for a 1200x630 Open Graph cover, landscape 1.905:1.
Primary request: sophisticated, unmistakably contemporary ISRAELI visual identity for Service with Meaning, an Israeli nonprofit preparing young women for meaningful service, values, belonging and community.
Style/medium: premium tactile layered paper sculpture and matte ceramic miniatures photographed as a real art-directed studio set. Precise cut paper edges, physical depth, restrained paper fibers, graceful dimensional curves, soft directional light, delicate realistic shadows. Calm, hopeful, designed for an Israeli educational nonprofit.
Color palette: midnight petrol #102d40, stone-white #f6f5ee, ice blue #b8e5f5, Israeli flag royal blue #1c61ad, muted sage olive green #98baa8 and a little warm sunrise gold.
Composition: landscape 1.905:1. Main scene and all meaningful objects concentrated in LEFT 43 percent, with dimensional foreground forms. RIGHT 52 percent must be clean uninterrupted midnight petrol negative space for separately rendered typography. Leave the upper right empty. Full bleed; no frame or collage.
Israeli identity: include a clearly recognizable, beautifully folded ISRAELI NATIONAL FLAG on a fine flagpole within the LEFT part of the scene. It must be big enough to recognize at thumbnail scale: WHITE field with exactly TWO horizontal royal-blue stripes and ONE centered BLUE SIX-POINTED STAR OF DAVID made from two overlapping triangles. Accurate national flag, never a five-point star, never a crescent. Flag should look like fine folded paper. Use modern Israeli places and local natural textures described in the subject.
Architectural constraints: no domes, no minarets, no crescent motifs, no generic medieval walled village, no clustered old-town houses or palace architecture. If architecture is requested it must be specifically contemporary Israeli modernism. Do not substitute an old Mediterranean village for a modern Israeli place.
Constraints: no lettering, no words, no numbers, no brand logos, no watermark, no human figures or military equipment. The real brand logo and Hebrew/English text will be added later by code. No neon, glossy plastic, clip-art icons, or floating interface UI. Generate ONE finished landscape artwork.
Scene/subject: <page-specific scene>
```

The home illustration was generated first, without a reference image. The other eleven used the new home artwork as a material and layout reference, with this added instruction:

```text
Reference image role: material, palette, Israeli flag accuracy and left-subject/right-negative-space layout reference ONLY. Replace the entire subject with the page-specific subject above. Do not copy the reference's Negev desert, cactus or winding trail unless the scene explicitly asks for them. The subject requested for this page must be the clear primary visual.
```

### home

`artwork/home.jpg`

An unmistakable MAKHTESH RAMON / NEGEV landscape: broad layered sandstone escarpments with flat mesa tops, a deep open desert basin and a luminous winding white path leading from lower-left foreground toward the dawn horizon. A modest Israeli flag on a pole stands beside the trail on the left ridge, silhouetted clearly against pale sky. A sculptural olive sprig and a small sabra prickly-pear plant grow beside the foreground path. No buildings at all. Distinctive Israeli desert geology, not rolling fantasy hills.

### about

`artwork/about.jpg`

A graceful olive tree with visible interconnected paper roots growing from sculptural strata of Jerusalem limestone. Behind the tree, a simple upright limestone panel carries an elegant shallow relief of a SEVEN-BRANCHED MENORAH (central stem plus three curved branches on each side), evoking the Israeli state emblem without text. An Israeli flag on a fine pole beside the panel. Modern civic sculpture and rooted Israeli identity; no buildings or arches.

### lectures

`artwork/lectures.jpg`

A contemporary Israeli open-air amphitheatre built from layered ivory paper semicircles, inspired by modern campus and kibbutz cultural spaces, with a simple square podium and three sculptural sky-blue arcs suggesting a voice spreading outward. An Israeli flag stands prominently beside the podium. A few sculptural Aleppo pines and a modern flat-roofed white campus structure at far left rear; no historical architecture.

### guidance

`artwork/guidance.jpg`

Two parallel winding trails, ivory and light blue, crossing the rounded green-blue GALILEE hills toward a glimpse of the SEA OF GALILEE in the left background. An Israeli flag marks a safe meeting point on a left ridge. In the foreground a small stone trail marker has the simple orange-blue-white Israel National Trail color bands with NO text, plus a delicate olive branch. Welcoming landscape of accompaniment and finding one's own Israeli path. No buildings, portals or arches.

### team

`artwork/team.jpg`

Five graceful olive saplings of different heights with interwoven roots on a shared oval terraced island of pale limestone. Behind them, neat agricultural orchard rows and one clean cylindrical modern kibbutz water tower, with an Israeli flag on a pole to the left of the grove. A rooted Israeli community and shared purpose. No houses or domes.

### getInvolved

`artwork/getInvolved.jpg`

Two elegant abstract open palm sculptures made from layered ivory paper gently cradle a sage olive sapling growing from a small lump of Israeli limestone soil. An Israeli flag is planted in the soil to the left of the sapling, visibly recognizable but subordinate to the plant. Behind the hands are quiet geometric agricultural terraces suggesting an Israeli community garden. Generosity and local community, not a place of worship. No buildings.

### videos

`artwork/videos.jpg`

A freestanding clean ivory sculptural screen with a triangular PLAY-shaped opening, standing on a modern TEL AVIV seaside promenade with Mediterranean paper-blue sea layers and two restrained palm trees. On the far left behind the screen, a simplified Tel Aviv Bauhaus building has crisp white FLAT ROOFS, rectangular windows and a rounded horizontal balcony, plus a clearly recognizable Israeli flag. Modern Israeli culture and storytelling, not a historic town.

### faq

`artwork/faq.jpg`

Two large dimensional sculptural speech bubbles, one ivory and one ice blue, resting above clean Jerusalem limestone steps and a winding connection between them. An Israeli flag stands behind the bubbles at far left. A modern quiet civic plaza with a sparse olive sapling, broad rectangular cut stones and crisp square edges. The bubbles are blank inside. No arches, no buildings and no old-town silhouette.

### contact

`artwork/contact.jpg`

Two sculptural ribbon-like arcs, one ivory and one ice blue, meet to form a flowing bridge on the left. Behind them a miniature contemporary TEL AVIV skyline has three unmistakable simplified AZRIELI shapes: a circular tower, a triangular tower, and a square tower, with subtle clean horizontal floor lines. An Israeli flag on a slim pole and a little Mediterranean waterfront. Clear modern Israeli connection and openness, never historic village architecture.

### terms

`artwork/terms.jpg`

An open blank book sculpted from elegant ivory paper layers on a low Jerusalem limestone plinth. In the left rear background, a restrained modern KNESSET-inspired building: one VERY BROAD FLAT horizontal roof supported by a row of straight slim rectangular columns, modern 1960s civic architecture, never a classical temple. A clearly recognizable Israeli flag stands beside the building. Transparency and clear public information, no lettering anywhere.

### privacy

`artwork/privacy.jpg`

A young sage olive sprout sheltered inside a crisp angular hexagonal white paper enclosure, with nested pale-blue protective angular layers behind. Beside it on the left, a carefully folded recognizable Israeli flag on a fine pole. The enclosure rests on broad Jerusalem limestone strata. Quiet care and privacy in an Israeli civic design language. NO rounded arches, no domes, no computers, no locks or cyber imagery.

### accessibility

`artwork/accessibility.jpg`

A wide continuous ivory accessible ramp gently curves through blue and pale Jerusalem-limestone landscape terraces toward a LARGE OPEN RECTANGULAR DOORWAY in a crisp contemporary Israeli white campus wall. Thin flat roof canopy, clear square geometry, no arches. An Israeli flag beside the entrance and a small native olive plant near the ramp. No stairs along the ramp or barriers. Welcoming modern Israeli public space and equal access.

## Validation

Run `npm run test:seo`, `npm run lint`, and `npm run build`. For a hosted deployment, run `SEO_BASE_URL=<branch-or-production-origin> npm run validate:seo`. The validator follows each page's advertised image URL and checks 24 distinct 1200 × 630 PNG covers below 1.5 MB. If validating an immutable deployment URL, set `SEO_SOCIAL_ORIGIN` to its branch alias. For local checks the image origin is substituted with the local server.

Review sheets are in `artifacts/og-preview-2026-11-04/`. The route's 12 artwork files, two fonts and original logo are explicitly included in Next.js output tracing.

The contrast overlay needs explicit `top`, `left`, `width` and `height`: this ImageResponse renderer ignores the `inset` shorthand. Text must remain legible when artwork reaches the text area.
