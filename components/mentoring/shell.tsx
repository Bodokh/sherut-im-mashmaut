"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarCheck2Icon,
  BellRingIcon,
  ClipboardCheckIcon,
  CheckCheckIcon,
  CloudOffIcon,
  HomeIcon,
  LogOutIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Avatar, AvatarFallback } from "@/components/staff/ui/avatar";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Separator } from "@/components/staff/ui/separator";
import { Skeleton } from "@/components/staff/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/staff/ui/sidebar";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { initials } from "./format";
import { readableError, roleNames } from "./common";

const navigation = [
  { href: "/staff", label: "המעקב שלי", icon: HomeIcon },
  { href: "/staff/participants", label: "החניכות", icon: UsersRoundIcon },
  { href: "/staff/contacts/new", label: "תיעוד קשר", icon: CalendarCheck2Icon },
  { href: "/staff/reminders", label: "התזכורות שלי", icon: BellRingIcon },
];
const management = [
  { href: "/staff/reviews", label: "בקרה ואישורים", icon: CheckCheckIcon },
  { href: "/staff/oversight", label: "בקרה חודשית", icon: ClipboardCheckIcon },
  { href: "/staff/team", label: "הצוות", icon: ShieldCheckIcon },
];

function NavigationItems({
  entries,
  pathname,
}: {
  entries: typeof navigation;
  pathname: string;
}) {
  return (
    <SidebarMenu>
      {entries.map(({ href, label, icon: Icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            size="lg"
            isActive={
              href === pathname ||
              (href !== "/staff" && pathname.startsWith(`${href}/`))
            }
            render={<Link href={href} />}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function MentoringShell({ children }: { children: ReactNode }) {
  const { snapshot, loading, error, connection, pendingCount, refresh } =
    useWorkspace();
  const pathname = usePathname();

  if (!snapshot) {
    const locked = error?.code === "not_authenticated" || error?.code === "expired" || error?.code === "account_changed";
    const denied = error?.code === "not_staff" || error?.code === "forbidden";
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-12">
        <Link href="/staff" className="flex items-center gap-3 font-semibold">
          <Image src="/images/logo-mark.png" alt="" width={44} height={44} />
          שירות עם משמעות
          <span className="text-sm font-normal text-muted-foreground">
            סביבת הליווי
          </span>
        </Link>
        {loading ? (
          <div
            className="flex flex-col gap-5"
            aria-label="טעינת סביבת הליווי"
            role="status"
          >
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>{denied ? "החשבון אינו מורשה לפתוח את סביבת הליווי" : locked ? "סביבת הליווי נעולה עד לאימות מחדש" : "סביבת הליווי אינה זמינה כרגע"}</AlertTitle>
            <AlertDescription>
              <p>{readableError(error)}</p>
              {(locked || denied) && <p>עבודה מקומית שלא הושלמה נשמרת נעולה. לאחר כניסה לאותו חשבון ואימות ההרשאות, אפשר לבדוק את אפשרויות השחזור במסך העדכונים לבדיקה.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void refresh()}>
                  <RefreshCwIcon data-icon="inline-start" />
                  ניסיון נוסף
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/staff/login" />}
                >
                  <ArrowRightIcon data-icon="inline-start" />
                  לכניסה למערכת
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const actor = snapshot.actor;
  const isManagement = actor.role !== "mentor";
  const items = [
    ...navigation,
    ...(isManagement ? management : []),
    { href: "/staff/conflicts", label: "עדכונים לבדיקה", icon: ActivityIcon },
  ];
  const current = items.find(
    (item) =>
      item.href === pathname ||
      (item.href !== "/staff" && pathname.startsWith(`${item.href}/`)),
  );
  const connectionText =
    connection === "offline"
      ? "Offline"
      : connection === "syncing"
        ? "מעדכנת את המערכת"
        : connection === "conflict"
          ? "יש עדכון לבדיקה"
          : "Online";

  return (
    <SidebarProvider style={{ "--sidebar-width": "16.5rem" } as CSSProperties}>
      <a href="#mentoring-content" className="sr-only focus:not-sr-only">
        דילוג לתוכן
      </a>
      <Sidebar side="right" collapsible="offcanvas">
        <SidebarHeader className="px-5 py-7">
          <Link href="/staff" className="flex items-center gap-3">
            <Image src="/images/logo-mark.png" alt="" width={44} height={44} />
            <span className="flex flex-col gap-1">
              <strong className="text-base font-semibold">
                שירות עם משמעות
              </strong>
              <span className="text-xs text-muted-foreground">
                נוכחות לאורך הדרך
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>הליווי האישי</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavigationItems entries={navigation} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
          {isManagement && (
            <SidebarGroup>
              <SidebarGroupLabel>ניהול ובקרה</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavigationItems entries={management} pathname={pathname} />
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    isActive={pathname === "/staff/conflicts"}
                    render={<Link href="/staff/conflicts" />}
                  >
                    <ActivityIcon />
                    <span>עדכונים לבדיקה</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    isActive={pathname === "/staff/settings"}
                    render={<Link href="/staff/settings" />}
                  >
                    <Settings2Icon />
                    <span>הגדרות</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-4 p-5">
          <Separator />
          <div className="flex items-center gap-3">
            <Avatar className="size-11">
              <AvatarFallback>{initials(actor.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {actor.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {roleNames[actor.role]}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="יציאה מהמערכת"
              nativeButton={false}
              render={<Link href="/staff/logout" />}
            >
              <LogOutIcon />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-4 border-b bg-background px-5 md:px-9">
          <div className="flex h-11 min-w-0 items-center gap-2">
            <SidebarTrigger aria-label="פתיחת תפריט ניווט" />
            <Separator
              orientation="vertical"
              aria-hidden="true"
              className="mx-1 data-vertical:h-5 data-vertical:self-center"
            />
            <p className="truncate text-sm font-medium">
              {current?.label ?? "סביבת הליווי"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <Badge
              variant="outline"
              dir="auto"
              data-connection={connection}
              className="h-7 gap-1.5 px-2.5"
              aria-live="polite"
            >
              {connection === "offline" ? (
                <CloudOffIcon data-icon="inline-start" />
              ) : (
                <ActivityIcon data-icon="inline-start" />
              )}
              {connectionText}
            </Badge>
            {pendingCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {pendingCount} ממתינות לעדכון
              </span>
            )}
          </div>
        </header>
        <div
          id="mentoring-content"
          tabIndex={-1}
          className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-5 py-7 md:px-9 md:py-9"
        >
          {connection === "offline" && (
            <Alert>
              <CloudOffIcon />
              <AlertTitle>אפשר להמשיך גם ללא חיבור</AlertTitle>
              <AlertDescription>
                השינויים הממתינים מוצגים בנפרד. הם יעודכנו במערכת רק לאחר חידוש
                החיבור ובדיקת ההרשאות.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <ActivityIcon />
              <AlertTitle>יש עדכון שדורש תשומת לב</AlertTitle>
              <AlertDescription>{readableError(error)}</AlertDescription>
            </Alert>
          )}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
