import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, players } from "@/lib/db";
import { desc, like, eq } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";

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

// Fix all "Player #" entries by fetching real names from BDL API
export async function PATCH() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const unknownPlayers = await db.query.players.findMany({
      where: like(players.name, "Player #%"),
    });

    if (unknownPlayers.length === 0) {
      return NextResponse.json({ fixed: 0, message: "No Player # entries found" });
    }

    let fixed = 0;
    const errors: string[] = [];

    // Split into NBA and NFL players
    const nbaPlayers = unknownPlayers.filter(p => p.sport === "nba");
    const nflPlayers = unknownPlayers.filter(p => p.sport === "nfl");

    // Batch-fetch NBA players
    if (nbaPlayers.length > 0) {
      const nbaIds = nbaPlayers
        .map(p => parseInt(p.espnId))
        .filter(id => !isNaN(id));

      if (nbaIds.length > 0) {
        try {
          const bdlPlayers = await bdlClient.getNBAPlayers({ player_ids: nbaIds, per_page: 100 });
          const bdlMap = new Map(bdlPlayers.data.map(p => [String(p.id), p]));

          for (const dbPlayer of nbaPlayers) {
            const bdl = bdlMap.get(dbPlayer.espnId);
            if (bdl) {
              await db.update(players).set({
                name: `${bdl.first_name} ${bdl.last_name}`,
                team: bdl.team?.full_name || dbPlayer.team,
                position: bdl.position || dbPlayer.position,
                updatedAt: new Date(),
              }).where(eq(players.id, dbPlayer.id));
              fixed++;
            }
          }
        } catch (err: any) {
          errors.push(`NBA batch fetch: ${err.message}`);
        }
      }
    }

    // Batch-fetch NFL players
    if (nflPlayers.length > 0) {
      const nflIds = nflPlayers
        .map(p => parseInt(p.espnId.replace("nfl-", "")))
        .filter(id => !isNaN(id));

      if (nflIds.length > 0) {
        try {
          const bdlPlayers = await bdlClient.getNFLPlayers({ player_ids: nflIds, per_page: 100 });
          const bdlMap = new Map(bdlPlayers.data.map(p => [String(p.id), p]));

          for (const dbPlayer of nflPlayers) {
            const nflId = dbPlayer.espnId.replace("nfl-", "");
            const bdl = bdlMap.get(nflId);
            if (bdl) {
              await db.update(players).set({
                name: `${bdl.first_name} ${bdl.last_name}`,
                team: bdl.team?.full_name || dbPlayer.team,
                position: bdl.position_abbreviation || dbPlayer.position,
                updatedAt: new Date(),
              }).where(eq(players.id, dbPlayer.id));
              fixed++;
            }
          }
        } catch (err: any) {
          errors.push(`NFL batch fetch: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      fixed,
      total: unknownPlayers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error fixing player names:", error);
    return NextResponse.json(
      { error: "Failed to fix player names" },
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
