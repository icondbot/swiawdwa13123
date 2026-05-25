import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, CalendarPlus, Settings as SettingsIcon, Antenna } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/book", label: "Book", icon: CalendarPlus },
    { href: "/bookings", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <nav className="border-b md:border-b-0 md:border-r border-border bg-card md:w-56 flex-shrink-0 flex md:flex-col md:h-[100dvh] sticky top-0 z-10">
        {/* Logo */}
        <div className="hidden md:flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Antenna className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground">iCondo Booker</span>
        </div>

        {/* Mobile logo */}
        <div className="md:hidden flex items-center gap-2 px-4 py-3">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Antenna className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground">iCondo Booker</span>
        </div>

        {/* Nav items */}
        <div className="flex md:flex-col gap-1 p-2 md:pt-3 overflow-x-auto md:overflow-x-visible w-full">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm font-medium whitespace-nowrap
                  ${isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
