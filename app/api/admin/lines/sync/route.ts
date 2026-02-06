import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db, players, playerLines, games } from "@/lib/db";
import { eq, and, or } from "drizzle-orm";
import { bdlClient, extractPropLine, extractPropPlayerId } from "@/lib/balldontlie";

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

        // Batch-fetch NBA player details (V2 props don't include player object)
        const propPlayerIds = [...new Set(props.data.map(p => extractPropPlayerId(p)).filter(id => id > 0))];
        const bdlPlayerMap = new Map<number, any>();
        if (propPlayerIds.length > 0) {
          try {
            const bdlPlayers = await bdlClient.getNBAPlayers({ player_ids: propPlayerIds, per_page: 100 });
            for (const p of bdlPlayers.data) {
              bdlPlayerMap.set(p.id, p);
            }
          } catch {
            // Silently fail - will use prop.player or fallback
          }
        }

        for (const prop of props.data) {
          const propPlayerId = extractPropPlayerId(prop);
          const propLineValue = extractPropLine(prop);
          if (!propPlayerId) continue;

          // Find or create player
          let player = await db.query.players.findFirst({
            where: eq(players.espnId, String(propPlayerId)),
          });

          const bdlPlayer = bdlPlayerMap.get(propPlayerId);
          const p = bdlPlayer || prop.player as any;

          if (!player) {
            const currentSeason = new Date().getFullYear();
            const [newPlayer] = await db
              .insert(players)
              .values({
                espnId: String(propPlayerId),
                name: p ? `${p.first_name} ${p.last_name}` : `Player #${propPlayerId}`,
                team: p?.team?.full_name || "Unknown",
                position: p?.position || "Unknown",
                sport: "nba",
                gamesPlayed: 1,
                isRookie: p?.draft_year === currentSeason,
              })
              .returning();
            player = newPlayer;
          } else if (player.name.startsWith("Player #") && p) {
            await db.update(players).set({
              name: `${p.first_name} ${p.last_name}`,
              team: p.team?.full_name || player.team,
              position: p.position || player.position,
              updatedAt: new Date(),
            }).where(eq(players.id, player.id));
          }

          // Map prop type to our stat type (NBA: points, assists, 3PT only)
          type StatType = "receiving_yards" | "rushing_yards" | "receptions" | "passing_yards" | "touchdowns" | "points" | "assists" | "three_pointers";
          const statTypeMap: Record<string, StatType> = {
            points: "points",
            assists: "assists",
            threes: "three_pointers",
          };
          const statType = statTypeMap[prop.prop_type];
          if (!statType) continue; // Skip unknown stat types

          // Check if line already exists (keyed by vendor for multi-sportsbook)
          const propVendor = prop.vendor || "unknown";
          const existingLine = await db.query.playerLines.findFirst({
            where: and(
              eq(playerLines.playerId, player.id),
              eq(playerLines.gameId, game.id),
              eq(playerLines.statType, statType),
              eq(playerLines.vendor, propVendor)
            ),
          });

          if (existingLine) {
            await db
              .update(playerLines)
              .set({
                pregameLine: propLineValue,
                source: prop.vendor,
              })
              .where(eq(playerLines.id, existingLine.id));
            linesUpdated++;
          } else {
            await db.insert(playerLines).values({
              playerId: player.id,
              gameId: game.id,
              statType,
              pregameLine: propLineValue,
              vendor: propVendor,
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
          const nflPropPlayerId = extractPropPlayerId(prop);
          const nflPropLineValue = extractPropLine(prop);
          if (!nflPropPlayerId) continue;

          // Find or create player
          let player = await db.query.players.findFirst({
            where: eq(players.espnId, `nfl-${nflPropPlayerId}`),
          });

          const p = prop.player as any;

          if (!player) {
            const nflIsRookie = p?.experience === "Rookie" || p?.experience === "1" || p?.experience === "";
            const [newPlayer] = await db
              .insert(players)
              .values({
                espnId: `nfl-${nflPropPlayerId}`,
                name: p ? `${p.first_name} ${p.last_name}` : `Player #${nflPropPlayerId}`,
                team: p?.team?.full_name || "Unknown",
                position: p?.position_abbreviation || "Unknown",
                sport: "nfl",
                gamesPlayed: 1,
                isRookie: nflIsRookie,
              })
              .returning();
            player = newPlayer;
          } else if (player.name.startsWith("Player #") && p) {
            await db.update(players).set({
              name: `${p.first_name} ${p.last_name}`,
              team: p.team?.full_name || player.team,
              position: p.position_abbreviation || player.position,
              updatedAt: new Date(),
            }).where(eq(players.id, player.id));
          }

          const statTypeMap: Record<string, string> = {
            passing_yards: "passing_yards",
            rushing_yards: "rushing_yards",
            receiving_yards: "receiving_yards",
            receptions: "receptions",
            passing_tds: "touchdowns",
            rushing_tds: "touchdowns",
            receiving_tds: "touchdowns",
          } as const;
          type NFLStatType = "receiving_yards" | "rushing_yards" | "receptions" | "passing_yards" | "touchdowns";
          const statType = statTypeMap[prop.prop_type as keyof typeof statTypeMap] as NFLStatType | undefined;
          if (!statType) continue; // Skip unknown stat types

          // Keyed by vendor for multi-sportsbook support
          const propVendor = prop.vendor || "unknown";
          const existingLine = await db.query.playerLines.findFirst({
            where: and(
              eq(playerLines.playerId, player.id),
              eq(playerLines.gameId, game.id),
              eq(playerLines.statType, statType),
              eq(playerLines.vendor, propVendor)
            ),
          });

          if (existingLine) {
            await db
              .update(playerLines)
              .set({
                pregameLine: nflPropLineValue,
                source: prop.vendor,
              })
              .where(eq(playerLines.id, existingLine.id));
            linesUpdated++;
          } else {
            await db.insert(playerLines).values({
              playerId: player.id,
              gameId: game.id,
              statType,
              pregameLine: nflPropLineValue,
              vendor: propVendor,
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
