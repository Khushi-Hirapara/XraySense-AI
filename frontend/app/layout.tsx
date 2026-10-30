import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RoleRouteGuard } from "@/components/auth/RoleRouteGuard";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "XRaySense AI",
    template: "%s | XRaySense AI",
  },
  description:
    "AI-assisted chest X-ray analysis for pneumonia detection with explainable insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthProvider>
            <RoleRouteGuard>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </RoleRouteGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
