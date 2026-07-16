import type { Dictionary, TestimonialSlot } from "./he";

// English — secondary language. Mirrors the Hebrew dictionary shape.
export const en: Dictionary = {
  meta: {
    title: "Service with Meaning | Values, Identity & Calling",
    description:
      "Service with Meaning accompanies young women across Israel toward meaningful service — through words from the heart, real stories from the field, and personal guidance connecting values, identity and calling.",
    ogAlt: "Service with Meaning — dawn light over an Israeli landscape",
  },

  seo: {
    home: {
      title: "Service with Meaning | Values, Identity & Calling",
      description:
        "Service with Meaning helps young women in Israel prepare for meaningful service through lectures, field stories and personal guidance rooted in values and identity.",
    },
    team: {
      title: "Our Team | Service with Meaning",
      description:
        "Meet the leaders, lecturers and mentors behind Service with Meaning, bringing personal experience, public action and honest field stories to every gathering.",
    },
    contact: {
      title: "Invite a Lecture or Contact Us | Service with Meaning",
      description:
        "Invite a Service with Meaning lecture, request personal guidance, or contact us about partnership, volunteering or donations. Leave details and we will respond.",
    },
    lectures: {
      title: "Meaningful Service Lectures | Service with Meaning",
      description:
        "Meaningful service lectures for young women, families, academies, communities and units, connecting identity, values, responsibility and real field stories.",
    },
    guidance: {
      title: "Meaningful Service Guidance | Service with Meaning",
      description:
        "Personal guidance for young women and families before and during service, with listening, practical direction, community and a connection to values and identity.",
    },
    getInvolved: {
      title: "Donate, Partner or Volunteer | Service with Meaning",
      description:
        "Support Service with Meaning through a donation, partnership or volunteering, and help bring lectures, personal guidance and community to more young women in Israel.",
    },
    faq: {
      title: "Meaningful Service FAQ | Service with Meaning",
      description:
        "Answers about Service with Meaning lectures, personal guidance, audiences, booking a gathering, donations, partnerships and volunteering in Israel.",
    },
  },

  routeLabels: {
    home: "Home",
    lectures: "Lectures",
    guidance: "Guidance",
    team: "Our team",
    getInvolved: "Donate & partner",
    faq: "Frequently asked questions",
    contact: "Contact",
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
    accessibilityMenu: "Open accessibility menu",
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
    testimonials: "What People Say",
    support: "Support",
    contact: "Contact",
    donate: "Donate",
    lectures: "Lectures",
    guidance: "Guidance",
    getInvolved: "Donate & Partner",
    faq: "FAQ",
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
        name: "Adv. Odelia Kadmi",
        role: "Founder",
        bio: "Founder of Service with Meaning. Mother of four, lawyer, member of the Zikhron Ya'akov council, entrepreneur, and activist for women's rights and civilian self-defense. Former squad commander and combat soldier in the CBRN unit of the Combat Engineering Corps.",
      },
      {
        name: "Adv. Tzofnat Nordman",
        role: "CEO, Liberty & Human Dignity Forum",
        bio: "Tzofnat Nordman is an independent attorney and CEO of the Liberty & Human Dignity Forum. She specializes in administrative and civil litigation. In High Court petitions, she represents concerns for the health of women participating in trials in the IDF.",
      },
      {
        name: "Lizzy HaMeiri",
        role: "Activist & publicist",
        bio: "8200 alumna; studied law at Tel Aviv University. Activist and publicist — Im Tirtzu, the IDF Resilience Forum, and Shovrot Shivyon.",
      },
    ],
  },

  reach: {
    kicker: "A nationwide community",
    title: "With you all the way",
    lead: "Our community of women veterans stretches from north to south — continuing to guide, connect and support at every point along the way.",
    mapLabel: "Map of Israel showing women veterans community locations",
    cities: [
      "Jerusalem",
      "Jordan Valley",
      "Judea & Samaria",
      "Be'er Sheva",
      "Mitzpe Ramon",
      "Tel Aviv",
      "Hadera",
      "Zikhron Ya'akov",
      "Golan Heights",
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
    cta: "Ask about donation options",
    other: "Other amount",
    otherWays: "Donate, partner or volunteer",
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
      errorSubmit: "We couldn't send your message. Please try again in a moment.",
    },
    details: {
      emailLabel: "Email",
      email: "support@imashmaut.co.il",
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
    kicker: "Contact",
    title: "Invite a lecture, a talk —\nor simply reach out",
    lead: "Fill in the details and we'll get back to you soon. You can also write to us directly by email, WhatsApp or phone — whatever works for you.",
    formTitle: "Tell us how we can help",
    detailsTitle: "Ways to contact us",
    backHome: "Back to home",
  },

  pageCommon: {
    breadcrumbsLabel: "Breadcrumbs",
    relatedTitle: "More ways to learn and take part",
  },

  lecturesPage: {
    kicker: "A gathering that starts a conversation",
    title: "Lectures for meaningful service",
    lead: "Service with Meaning lectures connect real stories from the field with questions of identity, values, responsibility and calling — in a direct, human and respectful voice.",
    answerTitle: "What does a lecture offer?",
    answer: "A gathering tailored to its audience, offering a practical and personal perspective on meaningful service, making room for questions and strengthening the connection between choice, identity and contribution.",
    sections: [
      {
        title: "Stories from the field",
        text: "Our lecturers share personal experience and real stories that let participants encounter service beyond slogans.",
      },
      {
        title: "Values and identity",
        text: "The conversation connects home, roots and identity with the choices and responsibilities that shape service.",
      },
      {
        title: "Tailored to the audience",
        text: "Content and emphasis are adapted for young women, parents, academies, communities, schools or units according to need.",
      },
    ],
    highlightsTitle: "Who is the lecture for?",
    highlights: ["Young women preparing to serve", "Parents and families", "Academies and schools", "Communities and units"],
    ctaTitle: "Want to invite a lecture?",
    ctaText: "Tell us about the audience and what you want the gathering to offer, and we will get back to coordinate.",
    cta: "Invite a lecture",
  },

  guidancePage: {
    kicker: "You are not alone on the path",
    title: "Guidance on the path to meaningful service",
    lead: "We offer young women and families a space for listening, direction and community — before service, at decision points and during complex moments along the way.",
    answerTitle: "What does our guidance include?",
    answer: "Human, needs-based support: a personal conversation, help for a family or a connection to community. The goal is to create clarity, identify strengths and choose the next step through values and meaning.",
    sections: [
      {
        title: "A personal conversation",
        text: "A gathering with a mentor who knows the path, listens closely and helps clarify questions, options and practical next steps.",
      },
      {
        title: "Support for families",
        text: "Conversation and tools for parents and relatives supporting a young woman before and throughout service.",
      },
      {
        title: "Connection to community",
        text: "Circles and relationships that build belonging, resilience and mutual support beyond a single conversation.",
      },
    ],
    highlightsTitle: "When can you reach out?",
    highlights: ["Before choosing a path", "Before recruitment or service", "At a decision point", "When you need someone to listen"],
    ctaTitle: "Want to speak with a mentor?",
    ctaText: "Leave a few details. We will get back to you and explore what could help right now.",
    cta: "Request personal guidance",
  },

  getInvolvedPage: {
    kicker: "Join the path",
    title: "Donate, partner or volunteer",
    lead: "Every supporter helps us reach another young woman, family, hall and community. You can take part through a donation, an organizational partnership or volunteering.",
    answerTitle: "How can you help?",
    answer: "Tell us how you would like to take part. We will respond personally with options suited to your capacity, experience and the kind of partnership you are seeking.",
    sections: [
      {
        title: "Donate",
        text: "Donations support lectures, guidance and community activity. Contact our team to receive the relevant information and coordinate your contribution.",
      },
      {
        title: "Partner",
        text: "Institutions, communities, organizations and donors can build a collaboration with us that expands reach and impact.",
      },
      {
        title: "Volunteer",
        text: "Tell us about the experience, skills and time you would like to offer, and we will explore where they can meet a real need.",
      },
    ],
    highlightsTitle: "What can we advance together?",
    highlights: ["Lectures and gatherings", "Personal guidance", "Community circles", "Connections to organizations and audiences"],
    ctaTitle: "Want to take part?",
    ctaText: "Contact us about donating, partnering or volunteering, and we will respond with the relevant details.",
    cta: "Contact us",
  },

  faqPage: {
    kicker: "Clear information in one place",
    title: "Frequently asked questions about Service with Meaning",
    lead: "Here are concise answers about our nonprofit, lectures, guidance and ways to take part. If your question is not covered, we would be glad to talk.",
    answerTitle: "In brief",
    answer: "Service with Meaning is an Israeli nonprofit that supports young women before and during meaningful service through lectures, personal guidance, support for families and community.",
    items: [
      {
        question: "Who is Service with Meaning for?",
        answer: "Our work is primarily for young women before and during service, as well as families, academies, schools, communities and units seeking a conversation about values, identity and calling.",
      },
      {
        question: "What lectures can we invite?",
        answer: "We tailor each gathering to its audience and purpose. Lectures combine personal field stories with a conversation about identity, responsibility, choice and meaningful service.",
      },
      {
        question: "How do we book a lecture or gathering?",
        answer: "Contact us through the form, WhatsApp, phone or email, tell us about the audience and need, and our team will respond to coordinate.",
      },
      {
        question: "Can I request personal guidance?",
        answer: "Yes. You can ask for a personal conversation, family support or a community connection. After you reach out, we will explore the response best suited to your needs.",
      },
      {
        question: "How can I donate or become a partner?",
        answer: "Contact us through the donate and partner page or the contact page. We will respond with information about donation, organizational partnership or volunteering options.",
      },
      {
        question: "Which languages are available on the site?",
        answer: "The site is available in Hebrew and English. You can switch language on any page using the language control in the header.",
      },
    ],
    ctaTitle: "Have another question?",
    ctaText: "Write to us and we will be glad to help, book a lecture or identify the right kind of support.",
    cta: "Contact us",
  },

  teamPage: {
    kicker: "Who we are",
    title: "Our team",
    lead: "The team behind Service with Meaning — leadership, lecturers and mentors bringing personal story, honesty and simplicity to every gathering.",
    daniel: {
      name: "Daniel Bodokh",
      role: "Chairman & founder",
      bio: "Married to Rivka and father of four. Chairman and founder of Service with Meaning, activist and publicist, and author of “Al Shtei HaSe'ipim.”",
    },
    eran: {
      name: "Eran Bodokh",
      role: "Chief Technology Officer",
      bioExperience:
        "Technology entrepreneur with more than a decade of experience building software and leading teams and AI products.",
      bioBeforeDevShift: "Co-founder and CEO of ",
      devshiftName: "DevShift",
      bioBetweenCompanies: ", CTO of ",
      aiCraftersName: "AI Crafters",
      bioAfterCompanies: ", and activist.",
    },
    talia: {
      name: "Talia Reuven",
      role: "Graphic designer",
      bio: "Graduate of Midreshet Danieli, part of the Bnei David institutions in Eli; activist and project leader.",
    },
    ctaTitle: "Want to bring us to you?",
    ctaText: "A lecture, a talk or a gathering — for your institution, community or unit.",
    cta: "Invite a lecture",
  },

  footer: {
    blurb: "An Israeli nonprofit accompanying young women toward meaningful service — through values, identity and calling.",
    navTitle: "Navigate",
    contactTitle: "Get in touch",
    followTitle: "Message us on WhatsApp",
    donate: "Donate",
    rights: "All rights reserved",
    madeWith: "Built with love for Service with Meaning",
    nonprofit: "Registered nonprofit",
  },
};
