import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, alerts } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allAlerts = await db.query.alerts.findMany({
      orderBy: [desc(alerts.createdAt)],
      with: {
        player: true,
        game: true,
      },
      limit: 50,
    });

    return NextResponse.json({
      alerts: allAlerts.map((a) => ({
        id: a.id,
        playerName: a.player.name,
        statType: a.statType,
        edgeScore: a.edgeScore,
        message: a.message,
        status: a.status,
        gameName: `${a.game.awayTeam} @ ${a.game.homeTeam}`,
        createdAt: a.createdAt.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}
