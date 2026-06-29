import type { Dictionary } from "./he";

// English — secondary language. Mirrors the Hebrew dictionary shape.
export const en: Dictionary = {
  meta: {
    title: "Service with Meaning — a nonprofit for meaningful service, values & identity",
    description:
      "Service with Meaning accompanies young people across Israel toward meaningful service — through heartfelt lectures, stories from the field, and personal guidance connecting values, identity and calling.",
    ogAlt: "Service with Meaning — dawn light over an Israeli landscape",
  },

  brand: {
    name: "Service with Meaning",
    short: "SwM",
    tagline: "Values · Identity · Calling",
  },

  a11y: {
    skip: "Skip to main content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menu: "Main menu",
    toTop: "Back to top",
    playFilm: "Play the film",
    langSwitch: "Switch to Hebrew",
  },

  nav: {
    home: "Home",
    about: "About",
    stories: "Films & Stories",
    field: "From the Field",
    events: "Talks & Events",
    partners: "Partners",
    support: "Support",
    contact: "Contact",
    donate: "Donate",
  },

  langName: "עברית",

  hero: {
    kicker: "Service with Meaning — a nonprofit",
    title: "A generation choosing\nto serve with meaning",
    lead: "Through heartfelt lectures, real stories from the field, and personal guidance — we help young people across Israel discover the values, identity and calling that turn service into a way of life.",
    ctaPrimary: "Invite a lecture",
    ctaSecondary: "Our story",
    watch: "Watch the film",
    watchNote: "Home film — coming soon",
    scroll: "Scroll to explore",
    values: ["Values", "Identity", "Calling", "Roots", "Responsibility", "Giving", "Fellowship"],
  },

  about: {
    kicker: "Who we are",
    title: "Lecturers who speak from the heart — and the field",
    lead: "Behind Service with Meaning stands a group of women lecturers and mentors who have walked the path themselves. They don't speak in theory — they bring personal story, honesty and simplicity, and create a conversation that reaches everyone in the room.",
    note: "Names, photos and biographies of the lecturers will be added here soon.",
    members: [
      {
        initials: "A",
        name: "Lecturer name",
        role: "Lecturer & mentor",
        bio: "Speaks on identity, belonging and the path to meaningful service — from lived experience.",
      },
      {
        initials: "B",
        name: "Lecturer name",
        role: "Lecturer • workshops",
        bio: "Leads sessions on values, resilience and giving — before and during service.",
      },
      {
        initials: "C",
        name: "Lecturer name",
        role: "Lecturer • mentoring",
        bio: "Accompanies young people at decision points, eye to eye.",
      },
      {
        initials: "D",
        name: "Lecturer name",
        role: "Lecturer • field",
        bio: "Brings the voice of the field — stories that return meaning to service.",
      },
    ],
  },

  manifesto: {
    kicker: "What we believe",
    lines: ["Service is not only a duty.", "It is a chance for a life of meaning."],
    body: "We believe every young person in Israel deserves to meet the values, roots and calling that turn the years of service into a turning point. Not slogans — a path.",
    pillars: [
      { title: "Values", text: "An honest conversation about what truly matters — before the uniform." },
      { title: "Identity", text: "Connecting to roots, to the family story, to where you come from." },
      { title: "Calling", text: "Understanding that service is not a stop — it is a choice and a path." },
      { title: "Fellowship", text: "No one walks alone. A community that accompanies all the way." },
    ],
  },

  stories: {
    kicker: "Films & Stories",
    title: "Real stories.\nReal people.",
    lead: "Moments from the lectures, the gatherings and the field. Each film is a small reminder of what we do — and why it matters.",
    cta: "All films",
    soon: "This film will be here soon. In the meantime, we'd love to talk and share.",
    items: [
      {
        tag: "Lecture",
        title: "The moment it all connects",
        excerpt: "A clip from a talk on identity and belonging before a full hall.",
        duration: "4:12",
      },
      {
        tag: "Field",
        title: "A letter from base",
        excerpt: "A soldier shares what meaning gave her in the first year.",
        duration: "2:38",
      },
      {
        tag: "Story",
        title: "From home to calling",
        excerpt: "Three young people, three paths, one connecting thread.",
        duration: "6:05",
      },
    ],
  },

  field: {
    kicker: "From the Field",
    title: "What's happening now",
    lead: "Where we meet young people — in halls, on bases and in communities across the country.",
    cta: "All updates",
    items: [
      {
        date: "21 Sivan",
        place: "Pre-military academy, North",
        title: "Opening gathering before enlistment",
        excerpt: "An evening of conversation on values and choice, with dozens of teens before service.",
      },
      {
        date: "14 Sivan",
        place: "Air Force base",
        title: "Resilience & meaning workshop",
        excerpt: "Meeting soldiers in the routine of service — bringing back the why.",
      },
      {
        date: "2 Sivan",
        place: "Community center, South",
        title: "Parents & young people gathering",
        excerpt: "A shared conversation about the path to service — eye to eye.",
      },
    ],
  },

  events: {
    kicker: "Talks & Conferences",
    title: "Come meet us",
    lead: "Conferences, inspiration evenings and open lectures — and an invitation to bring us to you, to your institution, community or unit.",
    cta: "Invite a lecture",
    register: "Register",
    items: [
      {
        day: "12",
        month: "Jul",
        title: "Service with Meaning Conference",
        location: "Jerusalem · Auditorium",
        excerpt: "A flagship evening with lecturers, stories from the field and community.",
      },
      {
        day: "04",
        month: "Aug",
        title: "Pre-enlistment inspiration evening",
        location: "Center · Free entry",
        excerpt: "Especially for those enlisting soon and their families.",
      },
    ],
  },

  support: {
    kicker: "Guidance & Support",
    title: "You're not alone on the path",
    lead: "Beyond the lectures, we're here to accompany you personally — at decision points, in complex moments, and throughout the service.",
    cta: "Reach out personally",
    items: [
      { title: "Personal mentoring", text: "A one-on-one conversation with a mentor who knows the path and truly listens." },
      { title: "Support for families", text: "Tools and conversation for parents guiding their young people toward service." },
      { title: "Community circles", text: "Group gatherings that create belonging, resilience and mutual support." },
    ],
  },

  partners: {
    kicker: "Partners",
    title: "We do this together",
    lead: "Academies, schools, units, municipalities and foundations — partners who believe service can be full of meaning.",
    cta: "Become a partner",
    note: "Partner logos will be added here.",
    logos: ["Harel Academy", "Nativ Fund", "City of Modiin", "Rabin School", "Youth Center", "Ofek Community"],
  },

  donate: {
    kicker: "Donate",
    title: "Every gift is another\nyoung person finding meaning",
    lead: "Your donation lets us reach another hall, another base, another young person — and turn their service into a way of life. Every amount, every gesture, counts.",
    amountsNote: "Amounts in multiples of Chai (18) — the symbol of life",
    amounts: ["36", "180", "360", "1,800"],
    currency: "₪",
    cta: "Give securely",
    other: "Other amount",
    otherWays: "Other ways to give",
  },

  contact: {
    kicker: "Contact",
    title: "Let's talk",
    lead: "Want to invite a lecture, become a partner, or simply hear more? We'd love to talk.",
    form: {
      name: "Full name",
      namePlaceholder: "What should we call you?",
      email: "Email",
      emailPlaceholder: "name@example.com",
      phone: "Phone",
      phonePlaceholder: "050-0000000",
      topic: "Subject",
      topics: ["Invite a lecture", "Partnership", "Guidance & support", "Donation", "Other"],
      message: "Your message",
      messagePlaceholder: "A few words about what you had in mind...",
      submit: "Send message",
      sending: "Sending...",
      successTitle: "Message sent!",
      success: "Thank you for reaching out. We'll get back to you soon.",
      again: "Send another message",
      errorRequired: "Please fill in this field",
      errorEmail: "Invalid email address",
    },
    details: {
      emailLabel: "Email",
      email: "hello@sherut-meaning.org.il",
      phoneLabel: "Phone",
      phone: "03-0000000",
      addressLabel: "Address",
      address: "Israel",
      hoursLabel: "Hours",
      hours: "Sun–Thu · 9:00–18:00",
    },
  },

  footer: {
    blurb: "An Israeli nonprofit accompanying young people toward meaningful service — through values, identity and calling.",
    navTitle: "Navigate",
    contactTitle: "Get in touch",
    followTitle: "Follow us",
    donate: "Donate",
    rights: "All rights reserved",
    madeWith: "Built with love for Service with Meaning",
    nonprofit: "Registered nonprofit",
  },
};
