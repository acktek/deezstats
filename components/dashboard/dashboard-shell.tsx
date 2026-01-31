"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email: string;
    image?: string | null;
  };
  isAdmin: boolean;
}

export function DashboardShell({ children, user, isAdmin }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleOpenMobileNav = useCallback(() => {
    setMobileNavOpen(true);
  }, []);

  const handleCloseMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isAdmin={isAdmin} />
      <MobileNav
        isOpen={mobileNavOpen}
        onClose={handleCloseMobileNav}
        isAdmin={isAdmin}
      />
      <div className="lg:pl-64">
        <Header user={user} onMenuClick={handleOpenMobileNav} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
