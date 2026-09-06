import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { SyncMetaProvider } from "@/components/sync-meta-provider";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  // Generic while logged out (login wall reveals nothing school-specific).
  title: "Please sign in to continue",
  description: "Please sign in to continue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <AuthProvider>
          <SyncMetaProvider>{children}</SyncMetaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
