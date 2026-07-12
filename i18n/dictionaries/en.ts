import type { Dictionary, TestimonialSlot } from "./he";

// English — secondary language. Mirrors the Hebrew dictionary shape.
export const en: Dictionary = {
  meta: {
    title: "Service with Meaning — a nonprofit for meaningful service, values & identity",
    description:
      "Service with Meaning accompanies young women across Israel toward meaningful service — through words from the heart, real stories from the field, and personal guidance connecting values, identity and calling.",
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
    aboutMenu: "About menu",
    toTop: "Back to top",
    playFilm: "Play the film",
    langSwitch: "Switch to Hebrew",
  },

  nav: {
    home: "Home",
    about: "About",
    team: "Team",
    vision: "Our Vision",
    partners: "Partners",
    volunteer: "Volunteer",
    leadership: "Leadership",
    stories: "Films & Stories",
    field: "From the Field",
    testimonials: "What People Say",
    support: "Support",
    contact: "Contact",
    donate: "Donate",
  },

  langName: "עברית",

  hero: {
    kicker: "Service with Meaning — a nonprofit",
    title: "A generation choosing\nto serve with meaning",
    lead: "Through words that come from the heart — real stories from the field and personal guidance — we help young women across Israel find their own contribution to the people of Israel, and seek a calling rooted in identity: the kind that makes service meaningful.",
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
    lead: "Behind Service with Meaning stands a group of women lecturers, mentors and activists who have walked the path themselves. They don't speak in theory — they bring personal story, honesty and simplicity, and create a conversation that reaches every woman in the room.",
    allTeam: "Meet the full team",
    members: [
      {
        name: "Dr. Michal Kramer-Asaf",
        role: "Lecturer & decision-making consultant",
        bio: "Doctor of decision-making in leadership, consultant and lecturer at leading Israeli organizations, specializing in coaching for decision-making in complex situations. Developer of the 'Productivity Language for Managers' method, taught as a standard for commanders in the security forces and for managers in healthcare and hi-tech.",
      },
      {
        name: "Adv. Odelia Kadmi",
        role: "Founder",
        bio: "Founder of Service with Meaning. Mother of four, lawyer, member of the Zikhron Ya'akov council, entrepreneur, and activist for women's rights and civilian self-defense. Former squad commander and combat soldier in the CBRN unit of the Combat Engineering Corps.",
      },
      {
        name: "Adv. Tzofnat Nordman",
        role: "CEO, Liberty & Human Dignity Forum",
        bio: "Independent lawyer, CEO of the Liberty & Human Dignity Forum, representing the true interests of women. Mother of seven. Served in the State Attorney's Office and the civil service.",
      },
      {
        name: "Lizzy HaMeiri",
        role: "Activist & publicist",
        bio: "8200 alumna; studied law at Tel Aviv University. Activist and publicist — Im Tirtzu, the IDF Resilience Forum, and Shovrot Shivyon.",
      },
    ],
  },

  manifesto: {
    kicker: "What we believe",
    lines: ["Service is not only a duty.", "It is a chance for a life of meaning."],
    body: "We believe every young woman in Israel deserves to meet the values, roots and calling that turn the years of service into a turning point. Not slogans — a path.",
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
        excerpt: "Three young women, three paths, one connecting thread.",
        duration: "6:05",
      },
    ],
  },

  field: {
    kicker: "From the Field",
    title: "What's happening now",
    lead: "Where we meet young women — in halls, on bases and in communities across the country.",
    cta: "All updates",
    items: [
      {
        date: "21 Sivan",
        place: "Pre-military academy, North",
        title: "Opening gathering before enlistment",
        excerpt: "An evening of conversation on values and choice, with dozens of girls before service.",
      },
      {
        date: "14 Sivan",
        place: "Air Force base",
        title: "Resilience & meaning workshop",
        excerpt: "Meeting women soldiers in the routine of service — bringing back the why.",
      },
      {
        date: "2 Sivan",
        place: "Community center, South",
        title: "Parents & young women gathering",
        excerpt: "A shared conversation about the path to service — eye to eye.",
      },
    ],
  },

  support: {
    kicker: "Guidance & Support",
    title: "You're not alone on the path",
    lead: "Beyond the lectures, we're here to accompany you personally — at decision points, in complex moments, and throughout the service.",
    cta: "Reach out personally",
    items: [
      {
        title: "Personal mentoring",
        text: "A one-on-one conversation with a mentor who knows the path and truly listens — real, face-to-face accompaniment, all the way.",
      },
      {
        title: "Support for families",
        text: "Tools and conversation for parents guiding their daughters toward service.",
      },
      {
        title: "Community circles",
        text: "Group gatherings that create belonging, resilience and mutual support.",
      },
    ],
  },

  partners: {
    kicker: "Partners",
    title: "Our partners",
    lead: "The donors, organizations and people who believe in the path — and help us reach another hall, another base, another community.",
    cta: "Become a partner",
    note: "Donor and partner logos will be added here soon.",
    slotLabel: "Logo coming soon",
  },

  testimonials: {
    kicker: "From the field",
    title: "What people say about us",
    lead: "Short films and kind words from the people we've met along the way — soldiers, parents, academy directors and partners.",
    videoTag: "Film",
    soonVideo: "This film will be here soon",
    soonQuote: "This quote will be added soon",
    note: "We're gathering these moments from the field — they're on their way.",
    slots: [
      { kind: "video", title: "Moments from a lecture" },
      { kind: "quote", role: "Soldier in service" },
      { kind: "video", title: "What participants say" },
      { kind: "quote", role: "Mother of a recruit" },
      { kind: "quote", role: "Pre-military academy director" },
    ] as TestimonialSlot[],
  },

  donate: {
    kicker: "Donate",
    title: "Every gift is another\nyoung woman finding meaning",
    lead: "Your donation lets us reach another hall, another base, another young woman — and turn her service into a way of life. Every amount, every gesture, counts.",
    amountsNote: "Amounts in multiples of Chai (18) — the symbol of life",
    amounts: ["36", "180", "360", "1,800"],
    currency: "₪",
    cta: "Give securely",
    other: "Other amount",
    otherWays: "Other ways to give",
  },

  contact: {
    kicker: "Contact",
    title: "Talk to us",
    lead: "The simplest way — a WhatsApp message or a phone call. We're here for any question.",
    whatsappCta: "Message us on WhatsApp",
    callCta: "Give us a call",
    orWrite: "Or by email:",
    inviteTitle: "Want to invite a lecture or a talk?",
    inviteText: "Leave your details in a dedicated form and we'll get back to you soon.",
    inviteCta: "Open the form",
    form: {
      name: "Full name",
      namePlaceholder: "What should we call you?",
      email: "Email",
      emailPlaceholder: "name@example.com",
      phone: "Phone",
      phonePlaceholder: "050-0000000",
      topic: "Subject",
      topics: ["Invite a lecture", "Invite a talk", "Partnership", "Volunteering", "Guidance & support", "Donation", "Other"],
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
      email: "sherut.em.mashmaut@gmail.com",
      phoneLabel: "Phone",
      phone: "052-7575-290",
      whatsappLabel: "WhatsApp",
      addressLabel: "Address",
      address: "Israel",
      hoursLabel: "Hours",
      hours: "Sun–Thu · 9:00–18:00",
    },
  },

  contactPage: {
    metaTitle: "Invite a lecture & contact — Service with Meaning",
    metaDescription:
      "Want to invite a Service with Meaning lecture, talk or gathering? Leave your details and we'll get back to you soon.",
    kicker: "Contact",
    title: "Invite a lecture, a talk —\nor simply reach out",
    lead: "Fill in the details and we'll get back to you soon. You can also write to us directly by email, WhatsApp or phone — whatever works for you.",
    backHome: "Back to home",
  },

  teamPage: {
    metaTitle: "Our team — Service with Meaning",
    metaDescription:
      "Meet the women leading Service with Meaning — lecturers, mentors and activists who have walked the path themselves.",
    kicker: "Who we are",
    title: "Our team",
    lead: "The women behind Service with Meaning — lecturers, mentors and activists who bring personal story, honesty and simplicity to every gathering.",
    leadershipTitle: "Leadership",
    leadershipLead: "The nonprofit is led by its founder, together with the team of lecturers and mentors.",
    ctaTitle: "Want to bring us to you?",
    ctaText: "A lecture, a talk or a gathering — for your institution, community or unit.",
    cta: "Invite a lecture",
  },

  footer: {
    blurb: "An Israeli nonprofit accompanying young women toward meaningful service — through values, identity and calling.",
    navTitle: "Navigate",
    contactTitle: "Get in touch",
    followTitle: "Follow us",
    donate: "Donate",
    rights: "All rights reserved",
    madeWith: "Built with love for Service with Meaning",
    nonprofit: "Registered nonprofit",
  },
};
