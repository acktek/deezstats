import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, playerLines, players, games } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lines = await db.query.playerLines.findMany({
      orderBy: [desc(playerLines.createdAt)],
      with: {
        player: true,
        game: true,
      },
    });

    return NextResponse.json({
      lines: lines.map((l) => ({
        id: l.id,
        playerName: l.player.name,
        team: l.player.team,
        gameName: `${l.game.awayTeam} @ ${l.game.homeTeam}`,
        statType: l.statType,
        pregameLine: l.pregameLine,
        currentLine: l.currentLine,
        source: l.source,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching lines:", error);
    return NextResponse.json(
      { error: "Failed to fetch lines" },
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
    const { gameId, playerId, espnPlayerId, playerName, playerTeam, statType, pregameLine, source } = body;

    if (!gameId || !statType || pregameLine === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get game to know the sport
    const game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    let finalPlayerId = playerId;

    // If playerId starts with "espn-", we need to create the player first
    if (playerId?.startsWith("espn-") || espnPlayerId) {
      const espnId = espnPlayerId || playerId.replace("espn-", "");

      // Check if player already exists
      let existingPlayer = await db.query.players.findFirst({
        where: eq(players.espnId, espnId),
      });

      if (!existingPlayer) {
        // Create the player
        const [newPlayer] = await db
          .insert(players)
          .values({
            espnId,
            name: playerName || "Unknown Player",
            team: playerTeam || "Unknown",
            position: "Unknown",
            sport: game.sport,
            gamesPlayed: 1,
            isRookie: false,
          })
          .returning();
        existingPlayer = newPlayer;
      }

      finalPlayerId = existingPlayer.id;
    }

    if (!finalPlayerId) {
      return NextResponse.json(
        { error: "Player ID required" },
        { status: 400 }
      );
    }

    const [newLine] = await db
      .insert(playerLines)
      .values({
        gameId,
        playerId: finalPlayerId,
        statType,
        pregameLine,
        source: source || "manual",
      })
      .returning();

    return NextResponse.json({ line: newLine });
  } catch (error) {
    console.error("Error creating line:", error);
    return NextResponse.json(
      { error: "Failed to create line" },
      { status: 500 }
    );
  }
}
