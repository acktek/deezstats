import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, players, playerLines, liveStats, alerts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";
import { calculateEdgeScore, shouldAlert, generateAlertMessage } from "@/lib/algorithm";
import { getDateRangeUTC, getCurrentSeasonUTC } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    // Get game from DB (try by ID first, then by ESPN ID)
    let game = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!game) {
      game = await db.query.games.findFirst({
        where: eq(games.espnId, gameId),
      });
    }

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    let gameStatus = game.status;
    let gameElapsed = game.gameElapsedPercent || 0;
    let playersUpdated = 0;
    let edgesCalculated = 0;
    let alertsCreated = 0;

    // Fetch fresh data from BALLDONTLIE
    if (game.sport === "nba") {
      const bdlGameId = parseInt(game.espnId);

      try {
        // Get game info - use UTC date range to handle timezone differences
        const dates = getDateRangeUTC();
        const nbaGames = await bdlClient.getNBAGames({ dates, per_page: 100 });
        const bdlGame = nbaGames.data.find(g => g.id === bdlGameId);

        if (bdlGame) {
          gameStatus = bdlGame.status === "Final" ? "final" :
            bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

          gameElapsed = gameStatus === "final" ? 100 :
            gameStatus === "in_progress" ? ((bdlGame.period - 1) * 25 + (12 - parseFloat(bdlGame.time || "12")) / 12 * 25) : 0;

          await db.update(games).set({
            status: gameStatus,
            homeScore: bdlGame.home_team_score,
            awayScore: bdlGame.visitor_team_score,
            period: bdlGame.period,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
            updatedAt: new Date(),
          }).where(eq(games.id, game.id));
        }

        // Get box score if game is live or completed
        if (gameStatus !== "scheduled") {
          const boxScore = await bdlClient.getNBAGameBoxScore(bdlGameId);
          const allPlayerStats = [
            ...boxScore.data.home_team.players,
            ...boxScore.data.visitor_team.players,
          ];

          for (const ps of allPlayerStats) {
            if (!ps.min || ps.min === "00:00") continue;

            // Get or create player
            let player = await db.query.players.findFirst({
              where: eq(players.espnId, String(ps.player.id)),
            });

            if (!player) {
              const currentSeason = getCurrentSeasonUTC();
              const [newPlayer] = await db.insert(players).values({
                espnId: String(ps.player.id),
                name: `${ps.player.first_name} ${ps.player.last_name}`,
                team: ps.team.full_name,
                position: ps.player.position || "Unknown",
                sport: "nba",
                gamesPlayed: 1,
                isRookie: ps.player.draft_year === currentSeason,
              }).returning();
              player = newPlayer;
            } else {
              const currentSeason = getCurrentSeasonUTC();
              await db.update(players).set({
                team: ps.team.full_name,
                position: ps.player.position || player.position,
                isRookie: ps.player.draft_year === currentSeason,
                updatedAt: new Date(),
              }).where(eq(players.id, player.id));
            }

            playersUpdated++;

            // Get lines for this player
            const lines = await db.query.playerLines.findMany({
              where: and(
                eq(playerLines.playerId, player.id),
                eq(playerLines.gameId, game.id)
              ),
            });

            const statValues: Record<string, number> = {
              points: ps.pts,
              assists: ps.ast,
              three_pointers: ps.fg3m,
            };

            // Calculate edges for each line
            for (const line of lines) {
              const currentValue = statValues[line.statType] || 0;
              if (currentValue === 0) continue;

              const result = calculateEdgeScore({
                currentValue,
                gameElapsedPercent: gameElapsed,
                pregameLine: line.pregameLine,
                gamesPlayed: player.gamesPlayed,
                historicalStddev: player.historicalStddev || 0,
                isRookie: player.isRookie,
                statType: line.statType,
                scoreDifferential: bdlGame ? Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score) : undefined,
                period: bdlGame?.period,
                personalFouls: ps.pf || 0,
                sport: "nba",
              });

              await db.insert(liveStats).values({
                playerId: player.id,
                gameId: game.id,
                statType: line.statType,
                currentValue,
                pace: result.pace,
                edgeScore: result.edgeScore,
              });

              edgesCalculated++;

              // Check for alerts
              if (result.edgeScore >= 1.5) {
                const existingAlert = await db.query.alerts.findFirst({
                  where: and(
                    eq(alerts.playerId, player.id),
                    eq(alerts.gameId, game.id),
                    eq(alerts.statType, line.statType),
                    eq(alerts.status, "active")
                  ),
                });

                const previousScore = existingAlert?.edgeScore;

                if (shouldAlert(result.edgeScore, previousScore)) {
                  await db.insert(alerts).values({
                    playerId: player.id,
                    gameId: game.id,
                    statType: line.statType,
                    edgeScore: result.edgeScore,
                    message: generateAlertMessage(
                      player.name,
                      line.statType,
                      result,
                      line.pregameLine
                    ),
                    status: "active",
                  });
                  alertsCreated++;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error syncing NBA game:", error);
      }
    } else if (game.sport === "nfl") {
      const bdlGameId = parseInt(game.espnId.replace("nfl-", ""));

      try {
        // Get game info - use UTC date range to handle timezone differences
        const dates = getDateRangeUTC();
        const nflGames = await bdlClient.getNFLGames({ dates, per_page: 100 });
        const bdlGame = nflGames.data.find(g => g.id === bdlGameId);

        if (bdlGame) {
          gameStatus = bdlGame.status === "Final" ? "final" :
            bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

          gameElapsed = gameStatus === "final" ? 100 :
            gameStatus === "in_progress" ? ((bdlGame.quarter - 1) * 25 + (15 - parseFloat(bdlGame.time || "15")) / 15 * 25) : 0;

          await db.update(games).set({
            status: gameStatus,
            homeScore: bdlGame.home_team_score,
            awayScore: bdlGame.visitor_team_score,
            period: bdlGame.quarter,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
            updatedAt: new Date(),
          }).where(eq(games.id, game.id));
        }

        // Get stats if game is live or completed
        if (gameStatus !== "scheduled") {
          const stats = await bdlClient.getNFLStats({ game_ids: [bdlGameId] });

          for (const ps of stats.data) {
            // Get or create player
            let player = await db.query.players.findFirst({
              where: eq(players.espnId, `nfl-${ps.player.id}`),
            });

            if (!player) {
              const nflExp = ps.player.experience;
              const nflIsRookie = nflExp === "Rookie" || nflExp === "1" || nflExp === "";
              const [newPlayer] = await db.insert(players).values({
                espnId: `nfl-${ps.player.id}`,
                name: `${ps.player.first_name} ${ps.player.last_name}`,
                team: ps.team.full_name,
                position: ps.player.position_abbreviation || "Unknown",
                sport: "nfl",
                gamesPlayed: 1,
                isRookie: nflIsRookie,
              }).returning();
              player = newPlayer;
            }

            playersUpdated++;

            // Get lines for this player
            const lines = await db.query.playerLines.findMany({
              where: and(
                eq(playerLines.playerId, player.id),
                eq(playerLines.gameId, game.id)
              ),
            });

            const statValues: Record<string, number> = {
              passing_yards: ps.passing_yards,
              rushing_yards: ps.rushing_yards,
              receiving_yards: ps.receiving_yards,
              receptions: ps.receptions,
              touchdowns: ps.passing_tds + ps.rushing_tds + ps.receiving_tds,
            };

            for (const line of lines) {
              const currentValue = statValues[line.statType] || 0;
              if (currentValue === 0) continue;

              const result = calculateEdgeScore({
                currentValue,
                gameElapsedPercent: gameElapsed,
                pregameLine: line.pregameLine,
                gamesPlayed: player.gamesPlayed,
                historicalStddev: player.historicalStddev || 0,
                isRookie: player.isRookie,
                statType: line.statType,
                scoreDifferential: bdlGame ? Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score) : undefined,
                period: bdlGame?.quarter,
                sport: "nfl",
              });

              await db.insert(liveStats).values({
                playerId: player.id,
                gameId: game.id,
                statType: line.statType,
                currentValue,
                pace: result.pace,
                edgeScore: result.edgeScore,
              });

              edgesCalculated++;

              if (result.edgeScore >= 1.5) {
                const existingAlert = await db.query.alerts.findFirst({
                  where: and(
                    eq(alerts.playerId, player.id),
                    eq(alerts.gameId, game.id),
                    eq(alerts.statType, line.statType),
                    eq(alerts.status, "active")
                  ),
                });

                const previousScore = existingAlert?.edgeScore;

                if (shouldAlert(result.edgeScore, previousScore)) {
                  await db.insert(alerts).values({
                    playerId: player.id,
                    gameId: game.id,
                    statType: line.statType,
                    edgeScore: result.edgeScore,
                    message: generateAlertMessage(
                      player.name,
                      line.statType,
                      result,
                      line.pregameLine
                    ),
                    status: "active",
                  });
                  alertsCreated++;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error syncing NFL game:", error);
      }
    }

    return NextResponse.json({
      success: true,
      playersUpdated,
      edgesCalculated,
      alertsCreated,
      gameStatus,
    });
  } catch (error) {
    console.error("Error syncing game:", error);
    return NextResponse.json(
      { error: "Failed to sync game" },
      { status: 500 }
    );
  }
}
