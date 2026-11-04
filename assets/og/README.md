# Open Graph artwork

Twelve page-specific illustrations generated with the built-in image generation tool on 2026-11-04. Each final JPEG is 1200 × 630, optimized for the server-rendered covers at `/og?locale=he|en&route=<route>&v=2`. The original brand mark from `public/images/logo-mark.png` and the text are added by `app/og/route.tsx`; neither is redrawn by the image model. Hebrew and English copy lives in `lib/og-copy.ts`.

The Regular and Bold Heebo faces are static instances of the repository's existing `app/(staff)/fonts/Heebo-variable.ttf` at weights 400 and 700. Its original OFL license is included. Static faces avoid variable-font parsing differences in the social image renderer.

## Prompt set

Shared generation prompt (followed by the page-specific scene below):

```text
Use case: ads-marketing.
Asset type: text-free editorial artwork for a 1200x630 Open Graph cover, landscape 1.905:1.
Primary request: a beautiful premium art-directed cover illustration for Service with Meaning, an Israeli nonprofit helping young women find values, identity, community and meaningful service.
Style/medium: sophisticated tactile layered paper sculpture and matte ceramic architectural miniature, photographed as a real museum-quality set. Precise cut edges, rich physical depth, tiny paper fibers, soft directional studio light and delicate shadows, elegant atmospheric perspective. Quiet, poetic, optimistic, contemporary Israeli visual identity. Professional visual campaign, not stock clip art.
Color palette: deep midnight petrol #102d40 background, stone-white #f6f5ee, icy sky blue #b8e5f5, muted sage green #98baa8 and a tiny warm pale gold sun. Blue and white should dominate.
Composition: landscape 1.905:1. Sculptural subject and detail concentrated in LEFT 50 percent; RIGHT 45 percent is uninterrupted very dark petrol negative space for a large title to be added later. Subject occupies almost full height on the left with breathing space above and below. Rich shadows fade seamlessly into the dark right. Full bleed, no border, no frame, no card UI.
Constraints: absolutely no text, no lettering, no numbers, no logos, no watermark, no human figures, no military equipment. No glossy plastic, no cartoon aesthetic, no neon, no floating interface elements, no generic gradient blobs. Do not create a collage or contact sheet. Generate ONE finished landscape artwork.
Scene/subject: <page-specific scene>
```

The home artwork was generated first. All subsequent images used that artwork as a style reference with this additional instruction:

```text
Reference image role: style reference only. Match its tactile paper material, visual depth, blue-and-white palette, landscape aspect ratio and dark right-side negative space. Replace its entire subject with the subject specified above.
```

### home

`artwork/home.jpg`

A luminous white winding paper pathway flowing from the lower left foreground through sculpted blue Israeli desert hills toward a small warm sunrise on the upper left horizon. A delicate olive sprout grows beside the path. Landscape feels expansive, hopeful and inviting, a journey of purpose. Strong dimensional foreground curves.

### about

`artwork/about.jpg`

A single elegant young olive tree with five pale sage leaves, rooted in layered white and blue limestone terrain. Visible finely crafted paper roots below connect three terraced strata, suggesting values and identity. An architectural oval opening behind reveals pale sky. Tree occupies left-center and is beautifully lit.

### lectures

`artwork/lectures.jpg`

An intimate sculptural open-air amphitheatre carved from nested ivory paper semicircles in blue hills. At its center a simple pale lectern; three large delicate sculptural blue arcs carry a voice upward and outward. No audience or people. Beautiful editorial visualization of a conversation that resonates.

### guidance

`artwork/guidance.jpg`

Two beautifully sculpted parallel winding paths through deep blue limestone hills, one ivory and one sky blue, coming together toward a softly glowing circular opening on the upper left. A small sage olive branch nearby. Intimate supportive landscape suggesting a mentor accompanying someone.

### team

`artwork/team.jpg`

A grove of five graceful olive saplings of different heights made from ivory stems and pale sage paper leaves. They stand together on a single sculptural oval terraced island of pale limestone and blue paper, their roots subtly woven together along the front. Elegant collective growth and human connection, not a real staff portrait.

### getInvolved

`artwork/getInvolved.jpg`

Two elegant interlocking open palm forms sculpted from matte ivory paper, cradling a single lush sage olive sprout above blue terraced earth. Hands are abstract simple sculpture with natural anatomy and broad soft folds, no people. Giving, community, generosity; museum-quality public-interest campaign artwork.

### videos

`artwork/videos.jpg`

A beautiful freestanding ivory architectural screen or portal standing in layered deep blue hills, with a triangular play-shaped opening cut through its solid face. Through the triangular opening one sees a softly glowing pale golden horizon. Sculptural frame casts long physical shadow; restrained cinematic storytelling.

### faq

`artwork/faq.jpg`

Two dimensional speech bubble sculptures, one matte ivory and one ice blue, nested into flowing blue paper landscape terraces. Their interiors are blank and their rounded silhouette and cut-paper tail are clean and sophisticated. A narrow white path connects them, evoking thoughtful questions and clear conversation.

### contact

`artwork/contact.jpg`

Two folded ribbon-like arcs, one ivory and one pale blue, extend from opposite sides of a tiny sculpted blue valley and meet into a flowing bridge on the left. A single sage olive leaf rests at their meeting point. Sculptural warmth and openness, connection and a conversation starting. No electronics or UI.

### terms

`artwork/terms.jpg`

An open blank book sculpted from several elegant flowing ivory paper layers rests on a low stepped blue limestone plinth. Its blank pages gently fan upward in an architectural form. A tiny olive branch at its base. The book is the unmistakable main subject, suggesting clarity and transparent terms.

### privacy

`artwork/privacy.jpg`

A delicate young sage olive sprout safely sheltered underneath a beautifully sculpted thick ivory protective arch, with two nested pale blue arch layers behind. Ground is calm layered blue paper. Strong visual idea of care, privacy and safeguarding, not cyber-security or technology. Soft intimate light.

### accessibility

`artwork/accessibility.jpg`

An elegant wide continuous ivory ramp gently curves through three blue terraced landscape levels toward an open luminous architectural doorway on the upper left. No stairs on the ramp, no barriers, no figures. Small pale sage plant at base. Welcoming universal access, openness and independent movement, beautifully sculpted paper architecture.

## Validation

`npm run validate:seo` checks the metadata, localized alt text, and 24 distinct 1200 × 630 PNG covers under 1.5 MB. The route's font and artwork files are explicitly included in Next.js output tracing for deployment.

Review sheets are saved in `artifacts/og-preview-2026-11-04/`. Production build, repository ESLint, all 24 localized SEO checks against `next start`, fallback requests, and the 15 required traced assets passed on 2026-11-04. Visual review confirmed Hebrew order, line fit and English contrast.

The contrast overlay needs explicit `top`, `left`, `width` and `height`: this ImageResponse renderer ignores the `inset` shorthand. The cover's text area must remain dark even when pale artwork extends behind it.
