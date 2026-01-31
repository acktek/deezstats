import { db, users, alerts, games, players } from "@/lib/db";
import { count, eq, gte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Bell, Gamepad2, UserCheck, Activity } from "lucide-react";
import { SyncButton } from "@/components/admin/sync-button";

async function getStats() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsersToday,
    totalAlerts,
    alertsToday,
    totalGames,
    liveGames,
    totalPlayers,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.lastLogin, oneDayAgo)),
    db.select({ count: count() }).from(alerts),
    db
      .select({ count: count() })
      .from(alerts)
      .where(gte(alerts.createdAt, oneDayAgo)),
    db.select({ count: count() }).from(games),
    db
      .select({ count: count() })
      .from(games)
      .where(eq(games.status, "in_progress")),
    db.select({ count: count() }).from(players),
  ]);

  return {
    totalUsers: totalUsers[0]?.count || 0,
    activeUsersToday: activeUsersToday[0]?.count || 0,
    totalAlerts: totalAlerts[0]?.count || 0,
    alertsToday: alertsToday[0]?.count || 0,
    totalGames: totalGames[0]?.count || 0,
    liveGames: liveGames[0]?.count || 0,
    totalPlayers: totalPlayers[0]?.count || 0,
  };
}

export default async function AdminDashboard() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System overview and management
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-leather">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeUsersToday} active today
            </p>
          </CardContent>
        </Card>

        <Card className="card-leather">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alerts Generated
            </CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAlerts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.alertsToday} in last 24h
            </p>
          </CardContent>
        </Card>

        <Card className="card-leather">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Games Tracked
            </CardTitle>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGames}</div>
            <div className="flex items-center gap-2">
              {stats.liveGames > 0 && (
                <Badge variant="live" className="text-xs">
                  {stats.liveGames} Live
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="card-leather">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Players in DB
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPlayers}</div>
            <p className="text-xs text-muted-foreground">with lines tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="/admin/users"
              className="block p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <h3 className="font-semibold">Manage Users</h3>
              <p className="text-sm text-muted-foreground">
                Create, edit, or disable user accounts
              </p>
            </a>
            <a
              href="/admin/lines"
              className="block p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <h3 className="font-semibold">Enter Lines</h3>
              <p className="text-sm text-muted-foreground">
                Add or update pregame player lines
              </p>
            </a>
            <a
              href="/admin/players"
              className="block p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <h3 className="font-semibold">Player Database</h3>
              <p className="text-sm text-muted-foreground">
                Manage player records and stats
              </p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
