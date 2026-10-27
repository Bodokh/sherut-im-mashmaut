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
    about: {
      title: "About the Organization, Mission & Registration | Service with Meaning",
      description:
        "Service with Meaning (SHERUT EM MASHMAUT, Charity ID 580843829) is a registered Israeli nonprofit supporting young women toward meaningful service. Mission, programs, registered purposes, address and official registration details.",
    },
    team: {
      title: "Leadership, Lecturers & Mentors | Service with Meaning",
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
    videos: {
      title: "Videos & Recorded Lectures | Service with Meaning",
      description:
        "Watch lectures, conversations and field stories from Service with Meaning: videos on values, identity and meaningful service for young women in Israel.",
    },
    terms: {
      title: "Terms of Use | Service with Meaning",
      description: "Terms for using the Service with Meaning website, including permitted use, content rights, enquiries, donations, external services and responsibility.",
    },
    privacy: {
      title: "Privacy Policy | Service with Meaning",
      description: "How Service with Meaning handles information from website enquiries and its mentoring workspace, including service providers, retention and your privacy rights.",
    },
    accessibility: {
      title: "Accessibility Statement | Service with Meaning",
      description: "Accessibility features on the Service with Meaning website, keyboard and accessibility menu guidance, limitations and ways to request assistance or report a barrier.",
    },
    faq: {
      title: "Meaningful Service FAQ | Service with Meaning",
      description:
        "Answers about Service with Meaning lectures, personal guidance, audiences, booking a gathering, donations, partnerships and volunteering in Israel.",
    },
  },

  routeLabels: {
    home: "Home",
    about: "About the organization",
    lectures: "Lectures",
    guidance: "Guidance",
    team: "Our team",
    getInvolved: "Donate & partner",
    videos: "Videos",
    faq: "Frequently asked questions",
    contact: "Contact",
    terms: "Terms of use",
    privacy: "Privacy policy",
    accessibility: "Accessibility statement",
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
    organization: "About the organization",
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
    videos: "Videos",
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
    watchNote: "29 seconds",
    player: {
      play: "Play",
      pause: "Pause",
      mute: "Mute",
      unmute: "Turn sound on",
      fullscreen: "Enter fullscreen",
      exitFullscreen: "Exit fullscreen",
      seek: "Film position",
    },
    scroll: "Scroll to explore",
    values: ["Values", "Identity", "Calling", "Roots", "Responsibility", "Giving", "Fellowship"],
  },

  about: {
    kicker: "Who we are",
    title: "Lecturers who speak from the heart — and the field",
    lead: "Behind Service with Meaning stands a group of women lecturers, mentors and activists who have walked the path themselves. They don't speak in theory — they bring personal story, honesty and simplicity, and create a conversation that reaches every woman in the room.",
    missionTitle: "Our mission",
    mission: "A registered nonprofit working to advance, empower and develop young women in Israel, personally, educationally, ethically and as leaders, in the period between finishing school and enlisting in the IDF, national service or civilian service.",
    programs: ["Lectures and gatherings", "Personal guidance", "Support for families", "Community and hotline"],
  },

  reach: {
    kicker: "A nationwide community",
    title: "With you all the way",
    lead: "Our community of service alumnae stretches from north to south — continuing to guide, connect and support at every point along the way.",
    mapLabel: "Map of Israel showing service alumnae community locations",
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
    body: "We believe in the strength of women and in their contribution to the people of Israel — by raising the nation's future, anchoring its values, and securing blessing for society. We believe that through a considered choice, a young woman in Israel can lead her life toward a life of meaning.",
    pillars: [
      { title: "Choice", text: "Everything begins with an honest, considered choice." },
      { title: "Meaning", text: "To look at the whole, and at our national story." },
      { title: "Womanhood", text: "Contributing to the people of Israel through the uniqueness in me." },
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
    girlsBlogCta: "Join the girls' blog WhatsApp group",
    hotlineCta: "Hotline",
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
    cta: "Donate now",
    other: "Other amount",
    otherWays: "Donate, partner or volunteer",
  },

  contact: {
    kicker: "Contact",
    title: "Talk to us",
    lead: "The simplest way — a WhatsApp message or a phone call. We're here for any question.",
    whatsappCta: "Message us on WhatsApp",
    callCta: "Give us a call",
    hotlineCta: "Hotline",
    groupsTitle: "Our WhatsApp groups",
    groups: {
      educators: "Educators group",
      parents: "Parents group",
      girlsBlog: "Girls' blog group",
    },
    copyEmail: "Copy address",
    copiedEmail: "Address copied",
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
      success: "Thank you for reaching out. Your message reached the team, and we will get back to you soon. If you left a valid email, you will also receive a confirmation.",
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
      hotline: "055-973-9365",
      whatsappLabel: "WhatsApp",
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
    processTitle: "How do we arrange a gathering?",
    process: [
      {
        title: "Define the audience and need",
        text: "In a short conversation, tell us who will attend, where they are on the path to service, and which questions or outcomes should be central to the gathering.",
      },
      {
        title: "Tailor the content",
        text: "Together, we choose the stories, subjects and emphasis that fit the setting, the participants' age and the time available for the gathering.",
      },
      {
        title: "Hold an open conversation",
        text: "The lecture combines story, ideas and audience questions, aiming to leave participants with practical reflection for the road ahead rather than a moment of inspiration alone.",
      },
    ],
    faqTitle: "Questions before inviting a lecture",
    faq: [
      {
        question: "Can the lecture be tailored to a specific audience?",
        answer: "Yes. Content is shaped around the setting, participants' age, their stage of service and the subjects the educational team or community wants to address.",
      },
      {
        question: "Who can invite a gathering?",
        answer: "Lectures are suitable for young women before and during service, parents, academies, schools, communities and units seeking a practical conversation grounded in values.",
      },
      {
        question: "What information should we include in our request?",
        answer: "Please include the audience, approximate number of participants, setting, preferred date and primary goal. Let us know about any accessibility needs as well.",
      },
      {
        question: "How does coordination begin?",
        answer: "Leave details through the form, WhatsApp, phone or email. Our team will respond to understand the need and explore the best fit and available options.",
      },
    ],
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
    processTitle: "How does guidance begin?",
    process: [
      {
        title: "Reach out in the way that suits you",
        text: "Write briefly through the form, WhatsApp, phone or email. You do not need to know in advance how to define the exact kind of support you need.",
      },
      {
        title: "Explore the need together",
        text: "In an initial conversation, we listen to what is on your mind, understand where you are on the path and consider whether personal, family or community support could help.",
      },
      {
        title: "Choose a practical next step",
        text: "We conclude by identifying a possible next step: another conversation, relevant information, a suitable connection or referral to a professional or official source when needed.",
      },
    ],
    faqTitle: "Questions about guidance and support",
    faq: [
      {
        question: "When is a good time to reach out?",
        answer: "You can contact us before choosing a path, ahead of service, during a dilemma or difficulty, or when a parent or relative wants to understand how to provide support.",
      },
      {
        question: "Can parents contact you too?",
        answer: "Yes. You may reach out for yourself or as a family member seeking tools, direction and a respectful conversation about how to support a young woman.",
      },
      {
        question: "Does guidance replace therapy or official information?",
        answer: "No. It is not medical or mental-health treatment, legal advice or a substitute for information from the IDF or national-service authorities. Contact the qualified authority when those are needed.",
      },
      {
        question: "What happens after I leave my details?",
        answer: "Our team returns for an initial conversation, listens to the need and considers the appropriate next step with you. Reaching out does not commit you to an ongoing process.",
      },
    ],
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
    processTitle: "How does an intention become a partnership?",
    process: [
      {
        title: "Tell us how you would like to help",
        text: "Let us know whether you are considering a donation, organizational partnership or volunteering, and what experience, resources or time you would like to offer.",
      },
      {
        title: "Match the offer to a real need",
        text: "Our team considers where the offer can support current work, which details are needed and what would be the most responsible and effective way to proceed.",
      },
      {
        title: "Agree on a clear course of action",
        text: "Before beginning, we clarify the goal, responsibilities and next steps so that the donation, partnership or volunteering creates practical and lasting value.",
      },
    ],
    faqTitle: "Questions about donating, partnering and volunteering",
    faq: [
      {
        question: "How do I receive current donation details?",
        answer: "Contact our team through the form, WhatsApp, phone or email. We will provide the current official details before you make a contribution.",
      },
      {
        question: "Which organizations can become partners?",
        answer: "Schools, academies, communities, units, companies and donors can approach us with a need or idea. Each proposal is considered against the nonprofit's mission and current work.",
      },
      {
        question: "How can I offer to volunteer?",
        answer: "Tell us about your experience, skills, availability and where you can help. Our team will check whether there is a suitable need and respond with a possible next step.",
      },
      {
        question: "Can I request official information and documents?",
        answer: "Yes. Before a donation or partnership, you can ask the team for the nonprofit's details and the information relevant to the engagement or contribution.",
      },
    ],
    ctaTitle: "Want to take part?",
    ctaText: "Contact us about donating, partnering or volunteering, and we will respond with the relevant details.",
    cta: "Contact us",
  },

  organization: {
    displayName: "Service with Meaning · SHERUT EM MASHMAUT (R.A.)",
    detailsCta: "About the organization and registration details",
    labels: {
      legalNameHebrew: "Registered name (Hebrew)",
      legalNameLatin: "Registered name (English)",
      registrationNumber: "Charity ID (Registrar of Associations no.)",
      registrationNumberShort: "Charity ID",
      registrationDate: "Registration date",
      registrar: "Registered with",
      activityField: "Field of activity",
      address: "Registered address",
      email: "Email",
      phone: "Phone",
      website: "Official website",
    },
    registrationDate: "10 July 2026",
    registrar: "Registrar of Associations, Israeli Corporations Authority, Ministry of Justice",
    activityField: "Education, higher education and vocational training · Educational programs",
    address: {
      street: "8 Ma'ale HaDekel St.",
      city: "Mitzpe Ramon",
      postalCode: "8060000",
      country: "Israel",
    },
  },

  aboutPage: {
    kicker: "Transparency and official information",
    title: "About Service with Meaning",
    lead: "Service with Meaning, registered in Israel as SHERUT EM MASHMAUT (R.A.), Charity ID 580843829, is a registered Israeli nonprofit that accompanies young women in Israel on the path to meaningful service, military, national or civilian, through lectures, personal guidance, support for families and community. Here you will find our mission, what we actually do, our purposes as registered with the Registrar of Associations, and our full registration details.",
    missionTitle: "Our mission",
    mission: "We work to advance, empower and develop, personally, educationally, ethically and as leaders, young women who are finishing their studies in the post-primary education system, in the period between the end of school and enlistment in the IDF, national service or civilian service. Our goal is for every young woman to choose service out of identity, values and calling, and to receive the tools, guidance and community that will accompany her all the way.",
    programsTitle: "What we actually do",
    programs: [
      {
        title: "Lectures and gatherings",
        text: "Women lecturers who have walked the path themselves visit schools, pre-military academies, seminaries, communities and units for an honest conversation about identity, values, responsibility and service, with real stories from the field.",
      },
      {
        title: "Personal guidance",
        text: "One-on-one conversations with a mentor who knows the path: before enlistment, at decision points and in complex moments during service.",
      },
      {
        title: "Support for families",
        text: "Tools and conversation for parents and relatives accompanying a young woman before and during her service.",
      },
      {
        title: "Community and support network",
        text: "WhatsApp groups for young women, parents and educators, a hotline, and a nationwide community of service alumnae that keeps guiding, connecting and supporting.",
      },
    ],
    purposesTitle: "Our purposes as registered",
    purposesNote: "The purposes below are an English translation of the purposes registered with the Israeli Registrar of Associations (Charity ID 580843829). The Hebrew registered text is authoritative; the certificate of registration shows the main purposes only.",
    purposes: [
      "The association shall act to advance, empower and develop, personally, educationally, ethically and as leaders, young women who complete their studies in the post-primary education system, in the period between the end of their studies and their enlistment in the IDF, national service or civilian service.",
      "To provide young women with tools, knowledge, skills and training that will assist them in the transition to adult life and to frameworks of service and action.",
      "To promote the values of personal responsibility, leadership, social involvement, giving, volunteering, excellence, personal resilience and active citizenship.",
      "To initiate, operate and maintain educational, social, values-based, cultural and enrichment programs, including workshops, courses, lectures, conferences, study days, camps, seminars, gatherings and group and individual activities.",
      "To provide guidance, counseling, direction, mentoring and a support framework for young women and their families, as required.",
      "To encourage integration into national service or civilian service, as well as contribution to the community and society in Israel, and to assist as needed in the decision-making process.",
      "To maintain collaborations with educational institutions, local authorities, public bodies, nonprofits, foundations and other entities in Israel and abroad, in order to advance the association's purposes.",
      "To initiate, develop, operate and support any educational, social, community or public activity that is consistent with the association's purposes and contributes to their advancement.",
    ],
    detailsTitle: "Organization details",
    certificateCta: "Certificate of registration (PDF, Hebrew)",
    registryCta: "Our record in the Registrar of Associations database",
    domainTitle: "Official domain and channels",
    domainText: "The website www.imashmaut.co.il and the domain imashmaut.co.il are owned and operated by the nonprofit Service with Meaning, registered as SHERUT EM MASHMAUT (R.A.), Charity ID 580843829. The organization's official email addresses end in @imashmaut.co.il, and the social channels linked from this site are our official channels.",
    leadershipTitle: "Who leads the organization",
    leadershipText: "The organization was founded and is led by Daniel Bodokh (chairman and founder) and Adv. Odelia Kadmi (founder, speaker and lecturer), together with a leadership team, lecturers and mentors. About 30 young women volunteer in answering questions and personal accompaniment.",
    leadershipCta: "Meet the team",
    ctaTitle: "Have a question about the organization?",
    ctaText: "We are glad to answer any question about our work, our registration and ways to take part.",
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
        question: "What is the difference between a lecture and personal guidance?",
        answer: "A lecture is a group gathering tailored to its audience and purpose. Guidance begins with a personal or family request and focuses on a specific need and a practical next step.",
      },
      {
        question: "Is the work only for people before service begins?",
        answer: "No. You can contact us before or during service, particularly at decision points, in complex periods or when a family needs tools to provide support.",
      },
      {
        question: "What information should I include when contacting you?",
        answer: "For a gathering, include the audience, setting and goal. For a personal request, briefly describe what is on your mind and how you prefer us to contact you.",
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
    title: "Our leadership, lecturers and mentors",
    lead: "The team behind Service with Meaning — leadership, lecturers and mentors bringing personal story, honesty and simplicity to every gathering.",
    members: [
      {
        name: "Adv. Odelia Kadmi",
        role: "Founder · Speaker and lecturer",
        bio: "Founder of Service with Meaning. Mother of four, lawyer, member of the Zikhron Ya'akov council, entrepreneur, and activist for women's rights and civilian self-defense. Former squad commander and combat soldier in the CBRN unit of the Combat Engineering Corps. She is a speaker and lecturer who leads talks.",
      },
      {
        name: "Adv. Tzofnat Nordman",
        role: "CEO, Liberty & Human Dignity Forum",
        bio: "Tzofnat Nordman is an independent attorney and CEO of the Liberty & Human Dignity Forum. She specializes in administrative and civil litigation. In High Court petitions, she represents concerns for the health of women participating in trials in the IDF.",
      },
      {
        name: "Hillel Cohen",
        role: "Activist & social advocate",
        bio: "Graduate of Midreshet Danieli, part of the Bnei David institutions; studies and works in social media, and volunteers in national service.",
      },
      {
        name: "Roi Kfir",
        role: "Content & Research Lead",
        bio: "26, from Ma'ale Efrayim. A student of philosophy, economics and political science. Activist.",
        anonymousAvatar: true,
      },
    ],
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
    volunteersNote: "About 30 young women volunteer under an umbrella of answering questions and personal accompaniment.",
    ctaTitle: "Want to bring us to you?",
    ctaText: "A lecture, a talk or a gathering — for your institution, community or unit.",
    cta: "Invite a lecture",
  },

  videosPage: {
    kicker: "Videos",
    title: "Our videos",
    lead: "Lectures, conversations and real stories from the field, straight from the Service with Meaning YouTube channel.",
    latest: "Latest video",
    allVideos: "All videos",
    videoCount: "{count} videos",
    play: "Play video",
    close: "Close player",
    watchOnYoutube: "Watch on YouTube",
    subscribe: "Subscribe to the channel",
    emptyTitle: "Videos are on the way",
    emptyText: "Lectures and field stories are coming to the channel soon. Subscribe to hear about every new video.",
    ctaTitle: "Want to hear us in person?",
    ctaText: "A lecture, conversation or gathering for your institution, community or unit.",
    cta: "Book a lecture",
  },

  comments: {
    kicker: "Comments",
    title: "Leave a comment",
    lead: "We would be glad to hear from you. Comments appear on the site only after the team approves them, so the conversation stays respectful.",
    name: "Name",
    namePlaceholder: "How should we sign it?",
    email: "Email",
    emailPlaceholder: "name@example.com",
    message: "Comment",
    messagePlaceholder: "What would you like to share?",
    submit: "Send comment",
    sending: "Sending...",
    successTitle: "Comment received",
    success: "Thank you. We will review it, and if approved it will appear on the site.",
    again: "Send another comment",
    validationSummary: "Correct the highlighted fields before sending your comment.",
    errorRequired: "Please fill in this field",
    errorEmail: "Invalid email address",
    errorSubmit: "We couldn't send your comment. Please try again in a moment.",
    topic: "Website comment",
  },

  notFound: {
    documentTitle: "Page not found",
    title: "This page isn't here",
    lead: "That address doesn't lead to a page on this site. You can go back home, or continue somewhere that does.",
    home: "Back to the home page",
    contact: "Contact",
    continue: "Continue from here",
    staffTitle: "This page isn't in the workspace",
    staffLead: "That address doesn't lead to a page in the mentoring workspace. You can return to the workspace, or visit the public site.",
    staffHome: "Back to the workspace",
    staffSite: "Public site",
  },

  footer: {
    legalTitle: "Legal information and accessibility",
    blurb: "An Israeli nonprofit accompanying young women toward meaningful service — through values, identity and calling.",
    navTitle: "Navigate",
    contactTitle: "Get in touch",
    followTitle: "Social",
    social: {
      facebook: "Facebook",
      instagram: "Instagram",
      youtube: "YouTube",
      x: "X",
      whatsapp: "WhatsApp",
    },
    donate: "Donate",
    rights: "All rights reserved",
    madeWith: "Built with love for Service with Meaning",
    nonprofit: "Registered nonprofit",
  },
};
