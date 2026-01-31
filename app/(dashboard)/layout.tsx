import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
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
    <div className="min-h-screen bg-background">
      {isAdmin && <AutoSync />}
      <Sidebar isAdmin={isAdmin} />
      <div className="lg:pl-64">
        <Header user={session.user} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
