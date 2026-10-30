"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LogIn, UserPlus } from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { navLinksForRole, type NavLinkItem } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  compact = false,
}: NavLinkItem & { pathname: string; compact?: boolean }) {
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href ||
        (href.length > 1 && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 font-medium transition-colors",
        compact
          ? "shrink-0 gap-1.5 rounded-lg px-2.5 py-2 text-xs"
          : "rounded-lg px-3 py-2 text-sm",
        active
          ? "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
          : compact
            ? "text-slate-600 dark:text-slate-300"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
      )}
    >
      <Icon
        className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
        strokeWidth={2.25}
        absoluteStrokeWidth
        aria-hidden
      />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { isLoading, isAuthenticated, user } = useAuth();

  const navLinks = isAuthenticated
    ? navLinksForRole(user?.role)
    : navLinksForRole(undefined);

  const isAuthPage = pathname === "/login" || pathname === "/register";
  // Guests: show Home in desktop nav. Logged-in: app links only (no Home).
  const showDesktopNav = !isAuthPage && (isAuthenticated || navLinks.length > 0);
  const showMobileNav = !isAuthPage && isAuthenticated && navLinks.length > 0;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/90">
      <div className="relative flex h-16 w-full items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="XRaySense AI — go to landing page"
          title="Go to landing page"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-600/25 ring-1 ring-teal-400/30">
            <Activity className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              XRaySense AI
            </span>
            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              Chest X-Ray Analysis
            </span>
          </div>
        </Link>

        {showDesktopNav ? (
          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex"
            aria-label="Main"
          >
            {navLinks.map((link) => (
              <NavLink key={link.href} {...link} pathname={pathname} />
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />

          {!isLoading && isAuthenticated && <UserMenu />}

          {!isLoading && !isAuthenticated && !isAuthPage && (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
              >
                <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 sm:px-3 sm:text-sm"
              >
                <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                <span className="hidden sm:inline">Register</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {showMobileNav ? (
        <nav
          className="flex items-center gap-0.5 overflow-x-auto border-t border-slate-100 px-4 pb-2 dark:border-slate-800 md:hidden"
          aria-label="Main mobile"
        >
          {navLinks.map((link) => (
            <NavLink key={link.href} {...link} pathname={pathname} compact />
          ))}
        </nav>
      ) : null}
    </header>
  );
}
