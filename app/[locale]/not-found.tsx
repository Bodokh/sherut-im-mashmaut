import { NotFoundScreen } from "@/components/site/NotFoundScreen";
import { localeFromPathname } from "@/lib/pathname-locale";
import { requestPathname } from "@/lib/request-pathname";

export default async function LocaleNotFound() {
  const pathname = await requestPathname();
  return <NotFoundScreen locale={localeFromPathname(pathname)} />;
}
