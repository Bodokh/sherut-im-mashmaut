import type { Locale } from "@/i18n/config";

export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  alt: Record<Locale, string>;
};

export const galleryPhotos: readonly GalleryPhoto[] = [
  {
    src: "/images/gallery/01.webp", width: 1800, height: 1350,
    alt: {
      he: "מרצה מדברת בפני קהל היושב באולם",
      en: "A speaker addressing a seated auditorium audience",
    },
  },
  {
    src: "/images/gallery/02.webp", width: 1800, height: 979,
    alt: {
      he: "מבט מצדי האולם על קהל ומרצה על הבמה",
      en: "A view across an auditorium audience toward a speaker on stage",
    },
  },
  {
    src: "/images/gallery/03.webp", width: 1800, height: 1350,
    alt: {
      he: "קבוצת נשים בפעילות במעגל באולם עם דלתות ירוקות",
      en: "A group of women taking part in a circle activity in a hall with green doors",
    },
  },
  {
    src: "/images/gallery/04.webp", width: 1800, height: 1350,
    alt: {
      he: "נשים עומדות עם מנחה ליד במה ומושבי אולם אדומים",
      en: "Women standing with a presenter near a stage and red auditorium seats",
    },
  },
  {
    src: "/images/gallery/05.webp", width: 1350, height: 1800,
    alt: {
      he: "מרצה על במה לפני וילון כהה ושלט של העמותה",
      en: "A woman speaking on stage in front of a dark curtain and an organization banner",
    },
  },
  {
    src: "/images/gallery/06.webp", width: 1200, height: 1600,
    alt: {
      he: "מרצה בחדר הרצאות לצד מצגת מוקרנת",
      en: "A woman presenting in a lecture room beside a projected slide",
    },
  },
  {
    src: "/images/gallery/07.webp", width: 1600, height: 1200,
    alt: {
      he: "קהל יושב באולם הרצאות מול מרצה ומסך הקרנה",
      en: "A seated lecture hall audience facing a presenter and projection screen",
    },
  },
  {
    src: "/images/gallery/08.webp", width: 1200, height: 1600,
    alt: {
      he: "מבט מהצד על מרצה ליד דוכן באולם הרצאות",
      en: "A side view of a woman speaking beside a lecture hall podium",
    },
  },
];
