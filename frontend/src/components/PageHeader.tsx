"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  currentPage: "dashboard" | "overview" | "settings";
  onLogout: () => void;
  rightSlot?: React.ReactNode;
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  dashboard: [
    { label: "Overview", href: "/overview" },
    { label: "Settings", href: "/settings" },
  ],
  overview: [
    { label: "Per Account", href: "/dashboard" },
    { label: "Settings", href: "/settings" },
  ],
  settings: [
    { label: "Overview", href: "/overview" },
    { label: "Dashboard", href: "/dashboard" },
  ],
};

export function PageHeader({ title, subtitle, currentPage, onLogout, rightSlot }: PageHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navItems = NAV_ITEMS[currentPage] || [];

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="space-y-2">
      {/* Row 1: Title + rightSlot (desktop) + nav/hamburger */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{title}</h1>
          {rightSlot && (
            <div className="hidden md:block shrink-0">{rightSlot}</div>
          )}
        </div>

        {/* Desktop nav buttons */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-4 py-2 transition-colors whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-4 py-2 transition-colors whitespace-nowrap"
          >
            Logout
          </button>
        </div>

        {/* Mobile hamburger */}
        <div className="relative md:hidden shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-400 hover:text-white border border-gray-700 rounded-lg p-2 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => { setMenuOpen(false); router.push(item.href); }}
                  className="w-full text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800 px-4 py-3 transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full text-left text-sm text-gray-300 hover:text-white hover:bg-gray-800 px-4 py-3 transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Subtitle (wraps freely) */}
      {subtitle && (
        <p className="text-xs sm:text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          {subtitle}
        </p>
      )}

      {/* Row 3: rightSlot on mobile (e.g. account selector) */}
      {rightSlot && (
        <div className="md:hidden">{rightSlot}</div>
      )}
    </div>
  );
}
