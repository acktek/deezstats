import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, players } from "@/lib/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allPlayers = await db.query.players.findMany({
      orderBy: [desc(players.updatedAt)],
    });

    return NextResponse.json({
      players: allPlayers.map((p) => ({
        id: p.id,
        espnId: p.espnId,
        name: p.name,
        team: p.team,
        position: p.position,
        sport: p.sport,
        gamesPlayed: p.gamesPlayed,
        seasonAvg: p.seasonAvg,
        historicalStddev: p.historicalStddev,
        isRookie: p.isRookie,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, team, position, sport, gamesPlayed, seasonAvg, isRookie, espnId } = body;

    if (!name || !team || !position || !sport) {
      return NextResponse.json(
        { error: "Name, team, position, and sport are required" },
        { status: 400 }
      );
    }

    // Generate a unique espnId if not provided (for manually created players)
    const playerEspnId = espnId || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const [newPlayer] = await db
      .insert(players)
      .values({
        espnId: playerEspnId,
        name,
        team,
        position,
        sport,
        gamesPlayed: gamesPlayed || 0,
        seasonAvg: seasonAvg || null,
        isRookie: isRookie || false,
      })
      .returning();

    return NextResponse.json({ player: newPlayer });
  } catch (error) {
    console.error("Error creating player:", error);
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}
