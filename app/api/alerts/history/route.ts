import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, alerts } from "@/lib/db";
import { desc, gte, and, ne, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get("range") || "7d";

  try {
    // Calculate date range
    const now = new Date();
    let startDate: Date | null = null;

    switch (range) {
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "all":
      default:
        startDate = null;
    }

    const whereConditions = [ne(alerts.status, "active")];
    if (startDate) {
      whereConditions.push(gte(alerts.createdAt, startDate));
    }

    const historicalAlerts = await db.query.alerts.findMany({
      where: and(...whereConditions),
      orderBy: [desc(alerts.createdAt)],
      with: {
        player: true,
        game: true,
      },
      limit: 100,
    });

    // Calculate stats
    const hits = historicalAlerts.filter((a) => a.status === "hit").length;
    const misses = historicalAlerts.filter((a) => a.status === "missed").length;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    const avgEdgeScore =
      historicalAlerts.length > 0
        ? historicalAlerts.reduce((sum, a) => sum + a.edgeScore, 0) /
          historicalAlerts.length
        : 0;

    return NextResponse.json({
      alerts: historicalAlerts.map((a) => ({
        id: a.id,
        playerName: a.player.name,
        statType: a.statType,
        edgeScore: a.edgeScore,
        pregameLine: 0, // Would need to join with playerLines
        finalValue: null, // Would need to track final stats
        status: a.status,
        gameName: `${a.game.awayTeam} @ ${a.game.homeTeam}`,
        createdAt: a.createdAt.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() || null,
      })),
      stats: {
        totalAlerts: historicalAlerts.length,
        hits,
        misses,
        pushes: historicalAlerts.filter((a) => a.status === "expired").length,
        hitRate,
        avgEdgeScore,
      },
    });
  } catch (error) {
    console.error("Error fetching alert history:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert history" },
      { status: 500 }
    );
  }
}
