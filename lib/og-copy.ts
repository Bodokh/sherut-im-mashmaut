import type { Locale } from "@/i18n/config";
import type { SiteRouteKey } from "@/lib/routes";

type CoverCopy = {
  title: readonly string[];
  subtitle: readonly string[];
};

// Explicit lines keep the covers legible at link-preview sizes and let the
// image renderer paint each Hebrew line in its correct visual order.
export const ogCopy: Record<Locale, Record<SiteRouteKey, CoverCopy>> = {
  he: {
    home: {
      title: ["דור שלם בוחר", "לשרת עם משמעות"],
      subtitle: ["ערכים, זהות ושליחות. בדרך שלך."],
    },
    about: {
      title: ["לדרך שלנו", "יש שורשים"],
      subtitle: ["החזון, הערכים והעשייה שמניעים אותנו"],
    },
    lectures: {
      title: ["שיחה אחת.", "מבט חדש."],
      subtitle: ["הרצאות שמחברות בין זהות, ערכים ושליחות"],
    },
    guidance: {
      title: ["את לא לבד", "בדרך שלך"],
      subtitle: ["ליווי אישי והכוונה", "לקראת השירות ובמהלכו"],
    },
    team: {
      title: ["אנשים עם", "תחושת שליחות"],
      subtitle: ["הכירו את הצוות, המרצות והמלווים שלנו"],
    },
    getInvolved: {
      title: ["יחד, נותנים", "למשמעות לצמוח"],
      subtitle: ["תרומה, שותפות והתנדבות"],
    },
    videos: {
      title: ["סיפורים מהשטח.", "השראה לדרך."],
      subtitle: ["הרצאות, שיחות ורגעים שכדאי לראות"],
    },
    gallery: {
      title: ["רגעים מהעשייה", "שלנו"],
      subtitle: ["תמונות מהרצאות, מפגשים ופעילויות"],
    },
    faq: {
      title: ["שאלות טובות.", "תשובות ברורות."],
      subtitle: ["כל מה שרציתם לדעת על שירות עם משמעות"],
    },
    contact: {
      title: ["כל דרך מתחילה", "בשיחה"],
      subtitle: ["להזמנת הרצאה, ליווי אישי או פשוט לדבר"],
    },
    terms: {
      title: ["תנאי שימוש"],
      subtitle: ["מידע ברור לשימוש באתר שלנו"],
    },
    privacy: {
      title: ["הפרטיות שלכם", "חשובה לנו"],
      subtitle: ["מדיניות הפרטיות והטיפול במידע שלכם"],
    },
    accessibility: {
      title: ["מקום נגיש.", "לכולם."],
      subtitle: ["המחויבות שלנו לנגישות", "ולשימוש שוויוני באתר"],
    },
  },
  en: {
    home: {
      title: ["A generation", "finding meaning."],
      subtitle: ["Values, identity and purpose. Your own path."],
    },
    about: {
      title: ["Rooted in values.", "Driven by purpose."],
      subtitle: ["The vision and values behind our work."],
    },
    lectures: {
      title: ["One conversation.", "A new perspective."],
      subtitle: ["Lectures on identity, values and purpose."],
    },
    guidance: {
      title: ["Your path.", "Someone beside you."],
      subtitle: ["Personal guidance before and during service."],
    },
    team: {
      title: ["People with", "a sense of purpose."],
      subtitle: ["Meet our leaders, lecturers and mentors."],
    },
    getInvolved: {
      title: ["Help meaning", "take root."],
      subtitle: ["Donate, partner or volunteer."],
    },
    videos: {
      title: ["Real stories.", "Lasting inspiration."],
      subtitle: ["Lectures, conversations and stories to watch."],
    },
    gallery: {
      title: ["Moments from", "our work."],
      subtitle: ["Photos from lectures, gatherings and activities."],
    },
    faq: {
      title: ["Good questions.", "Clear answers."],
      subtitle: ["Get to know Service with Meaning."],
    },
    contact: {
      title: ["It starts with", "a conversation."],
      subtitle: ["Invite a lecture, find guidance or get in touch."],
    },
    terms: {
      title: ["Terms of use"],
      subtitle: ["Clear information about using our website."],
    },
    privacy: {
      title: ["Your privacy", "matters."],
      subtitle: ["Our privacy policy and how we handle your data."],
    },
    accessibility: {
      title: ["An open path.", "For everyone."],
      subtitle: ["Our commitment to an accessible website."],
    },
  },
};
