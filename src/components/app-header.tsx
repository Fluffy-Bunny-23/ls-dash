"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function AppHeader({ active }: { active: "today" | "month" }) {
  const { signOutAll, user } = useAuth();
  return (
    <header className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <span className="text-lg font-bold tracking-tight">LS Dash</span>
        <div className="flex items-center gap-2">
          <nav aria-label="Views" className="flex rounded-md bg-white/10 p-1">
            <Link
              href="/"
              aria-current={active === "today" ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium",
                active === "today" ? "bg-secondary text-secondary-foreground" : "text-white hover:bg-white/10",
              )}
            >
              Today
            </Link>
            <Link
              href="/month"
              aria-current={active === "month" ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium",
                active === "month" ? "bg-secondary text-secondary-foreground" : "text-white hover:bg-white/10",
              )}
            >
              Month
            </Link>
          </nav>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => void signOutAll()}
            title={user?.email ?? ""}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
