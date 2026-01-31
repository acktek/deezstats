import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, watchlist, players } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userWatchlist = await db.query.watchlist.findMany({
      where: eq(watchlist.userId, session.user.id),
      orderBy: [desc(watchlist.createdAt)],
      with: {
        player: true,
      },
    });

    return NextResponse.json({
      players: userWatchlist.map((w) => ({
        id: w.playerId,
        playerId: w.playerId,
        playerName: w.player.name,
        team: w.player.team || "",
        position: w.player.position || "",
        sport: w.player.sport,
        gamesPlayed: w.player.gamesPlayed,
        seasonAvg: w.player.seasonAvg,
        isRookie: w.player.isRookie,
        customThreshold: w.customThreshold,
      })),
    });
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { playerId, customThreshold } = await request.json();

    if (!playerId) {
      return NextResponse.json(
        { error: "Player ID is required" },
        { status: 400 }
      );
    }

    // Check if already on watchlist
    const existing = await db.query.watchlist.findFirst({
      where: and(
        eq(watchlist.userId, session.user.id),
        eq(watchlist.playerId, playerId)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Player already on watchlist" },
        { status: 400 }
      );
    }

    await db.insert(watchlist).values({
      userId: session.user.id,
      playerId,
      customThreshold,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    );
  }
}
