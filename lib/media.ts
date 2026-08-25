// Verified Unsplash imagery (all confirmed 200 / image/jpeg). Locale-independent
// URLs live here; locale-dependent alt text lives in the dictionaries.
// These are tasteful, swappable placeholders until the client supplies real
// film stills and photographs.

const photo = (id: string, w = 1280) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const media = {
  // Dusk mountain ranges — cinematic, techelet-harmonious film poster.
  heroPoster: "/images/hero-poster.webp",

  // Team portraits — order matches the photographed entries in `teamPage.members`.
  team: [
    "/images/team/odelia-kadmi.jpg",
    "/images/team/tzofnat-nordman.jpg",
  ],
  danielBodokh: "/images/team/daniel-bodokh.webp",
  eranBodokh: "/images/team/eran-bodokh.jpg",

  // Story moments — youth & togetherness, reflection.
  stories: [
    photo("1523325343676-4136d25d013b"),
    photo("1506869640319-fe1a24fd76dc"),
    photo("1502444330042-d1a1ddf9bb5b"),
  ],

  // Conversation in confidence — personal accompaniment & support.
  support: "/images/support.jpg",

  // A rooted tree against blue sky — values, roots, growth.
  roots: photo("1502082553048-f009c37129b9", 1400),
};
