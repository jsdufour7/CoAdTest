"use client";

import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import type { ElementType, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { Logo } from "./logo";

export interface NavItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  /** Ex. "Sprint 2", "Bientôt" — rend l'item non cliquable. */
  badge?: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface AppShellProps {
  /** Chemin courant (détermine l'item actif). */
  currentPath: string;
  nav: NavSection[];
  user: { name: string; email: string; roleLabel: string };
  tenantName?: string;
  planLabel?: string;
  /** Injection du routeur de l'app hôte (ex. next/link) — ui reste agnostique. */
  linkComponent: ElementType;
  /** Server action de déconnexion fournie par l'app hôte. */
  logoutAction: () => Promise<void>;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Coquille applicative standard (sidebar + topbar + contenu).
 * Responsive : sidebar escamotable sous lg.
 */
export function AppShell({
  currentPath,
  nav,
  user,
  tenantName,
  planLabel,
  linkComponent: LinkLink,
  logoutAction,
  title,
  subtitle,
  actions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
        <Logo size={34} />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 lg:hidden"
          aria-label="Fermer le menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {nav.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label ? (
              <p className="px-2.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                {section.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href !== undefined && item.href === currentPath;
                const clickable = item.href !== undefined && !item.badge;
                const itemClass = cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-brand-50 font-medium text-brand-700"
                    : clickable
                      ? "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      : "cursor-not-allowed text-slate-400",
                );
                const content = (
                  <>
                    {item.icon}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <Badge variant="neutral" className="text-[10px]">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </>
                );
                return (
                  <li key={item.label}>
                    {clickable ? (
                      <LinkLink
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={itemClass}
                      >
                        {content}
                      </LinkLink>
                    ) : (
                      <span className={itemClass}>{content}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {tenantName ? (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="truncate text-sm font-medium text-slate-800">
            {tenantName}
          </p>
          {planLabel ? (
            <Badge variant="brand" className="mt-1.5">
              {planLabel}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.roleLabel}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Sidebar mobile + voile */}
      {mobileOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-popover lg:hidden">
            {sidebar}
          </aside>
        </>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
