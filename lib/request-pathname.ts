import "server-only";
import { headers } from "next/headers";
import { PATHNAME_HEADER } from "@/lib/pathname-locale";

export async function requestPathname(): Promise<string> {
  const headerList = await headers();
  return headerList.get(PATHNAME_HEADER) ?? headerList.get("next-url") ?? "/";
}
