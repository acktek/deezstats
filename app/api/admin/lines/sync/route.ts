import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, players, playerLines, games } from "@/lib/db";
import { eq, and, or } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";

export async function POST() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let linesAdded = 0;
    let linesUpdated = 0;
    let gamesProcessed = 0;
    const errors: string[] = [];

    // Get all upcoming/live games from our DB
    const dbGames = await db.query.games.findMany({
      where: or(eq(games.status, "scheduled"), eq(games.status, "in_progress")),
    });

    // Process NBA games
    const nbaGames = dbGames.filter((g) => g.sport === "nba");
    for (const game of nbaGames) {
      try {
        const bdlGameId = parseInt(game.espnId);
        const props = await bdlClient.getNBAPlayerProps({ game_id: bdlGameId });

        for (const prop of props.data) {
          // Find or create player
          let player = await db.query.players.findFirst({
            where: eq(players.espnId, String(prop.player.id)),
          });

          if (!player) {
            const p = prop.player as any;
            const [newPlayer] = await db
              .insert(players)
              .values({
                espnId: String(prop.player.id),
                name: `${p.first_name} ${p.last_name}`,
                team: p.team?.full_name || "Unknown",
                position: p.position || "Unknown",
                sport: "nba",
                gamesPlayed: 1,
                isRookie: false,
              })
              .returning();
            player = newPlayer;
          }

          // Map prop type to our stat type
          const statTypeMap: Record<string, string> = {
            points: "points",
            rebounds: "rebounds",
            assists: "assists",
            threes: "three_pointers",
            steals: "steals",
            blocks: "blocks",
          };
          const statType = statTypeMap[prop.prop_type] || prop.prop_type;

          // Check if line already exists
          const existingLine = await db.query.playerLines.findFirst({
            where: and(
              eq(playerLines.playerId, player.id),
              eq(playerLines.gameId, game.id),
              eq(playerLines.statType, statType)
            ),
          });

          if (existingLine) {
            await db
              .update(playerLines)
              .set({
                pregameLine: prop.line,
                source: prop.vendor,
              })
              .where(eq(playerLines.id, existingLine.id));
            linesUpdated++;
          } else {
            await db.insert(playerLines).values({
              playerId: player.id,
              gameId: game.id,
              statType,
              pregameLine: prop.line,
              source: prop.vendor,
            });
            linesAdded++;
          }
        }
        gamesProcessed++;
      } catch (error: any) {
        errors.push(`NBA game ${game.id}: ${error.message}`);
      }
    }

    // Process NFL games
    const nflGames = dbGames.filter((g) => g.sport === "nfl");
    for (const game of nflGames) {
      try {
        const bdlGameId = parseInt(game.espnId.replace("nfl-", ""));
        const props = await bdlClient.getNFLPlayerProps({ game_ids: [bdlGameId] });

        for (const prop of props.data) {
          // Find or create player
          let player = await db.query.players.findFirst({
            where: eq(players.espnId, `nfl-${prop.player.id}`),
          });

          if (!player) {
            const p = prop.player as any;
            const [newPlayer] = await db
              .insert(players)
              .values({
                espnId: `nfl-${prop.player.id}`,
                name: `${p.first_name} ${p.last_name}`,
                team: p.team?.full_name || "Unknown",
                position: p.position_abbreviation || "Unknown",
                sport: "nfl",
                gamesPlayed: 1,
                isRookie: false,
              })
              .returning();
            player = newPlayer;
          }

          const statTypeMap: Record<string, string> = {
            passing_yards: "passing_yards",
            rushing_yards: "rushing_yards",
            receiving_yards: "receiving_yards",
            receptions: "receptions",
            passing_tds: "touchdowns",
            rushing_tds: "touchdowns",
            receiving_tds: "touchdowns",
          };
          const statType = statTypeMap[prop.prop_type] || prop.prop_type;

          const existingLine = await db.query.playerLines.findFirst({
            where: and(
              eq(playerLines.playerId, player.id),
              eq(playerLines.gameId, game.id),
              eq(playerLines.statType, statType)
            ),
          });

          if (existingLine) {
            await db
              .update(playerLines)
              .set({
                pregameLine: prop.line,
                source: prop.vendor,
              })
              .where(eq(playerLines.id, existingLine.id));
            linesUpdated++;
          } else {
            await db.insert(playerLines).values({
              playerId: player.id,
              gameId: game.id,
              statType,
              pregameLine: prop.line,
              source: prop.vendor,
            });
            linesAdded++;
          }
        }
        gamesProcessed++;
      } catch (error: any) {
        errors.push(`NFL game ${game.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      linesAdded,
      linesUpdated,
      gamesProcessed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error syncing lines:", error);
    return NextResponse.json(
      { error: "Failed to sync lines" },
      { status: 500 }
    );
  }
}
