"use client";

import type { ReactNode } from "react";
import { DirectionProvider } from "@/components/staff/ui/direction";
import { TooltipProvider } from "@/components/staff/ui/tooltip";
import { Toaster } from "@/components/staff/ui/sonner";

export function StaffProviders({ children }: { children: ReactNode }) {
  return (
    <DirectionProvider direction="rtl">
      <TooltipProvider delay={350}>
        {children}
        <Toaster dir="rtl" theme="light" position="bottom-left" closeButton />
      </TooltipProvider>
    </DirectionProvider>
  );
}
