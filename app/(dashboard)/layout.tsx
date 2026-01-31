import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AutoSync } from "@/components/admin/auto-sync";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";

  return (
    <>
      {isAdmin && <AutoSync />}
      <DashboardShell user={session.user} isAdmin={isAdmin}>
        {children}
      </DashboardShell>
    </>
  );
}
