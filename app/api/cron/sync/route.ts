import { NextRequest, NextResponse } from "next/server";
import { bdlClient } from "@/lib/balldontlie";
import { db } from "@/lib/db";
import { games, players, liveStats, alerts, playerLines } from "@/lib/db/schema";
import { calculateEdgeScore, shouldAlert, generateAlertMessage } from "@/lib/algorithm";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { getDateRangeUTC, getCurrentSeasonUTC, getTeamLogoUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Allow access if: admin session OR valid cron API key
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const authHeader = request.headers.get("authorization");
  const cronJobApiKey = process.env.CRONJOB_API_KEY;
  const hasValidCronKey = cronJobApiKey && authHeader === `Bearer ${cronJobApiKey}`;

  if (!isAdmin && !hasValidCronKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use UTC date range to handle timezone differences between server and game schedules
    const dates = getDateRangeUTC();
    const season = getCurrentSeasonUTC();
    let gamesUpdated = 0;
    let playersUpdated = 0;
    let propsUpdated = 0;
    let alertsCreated = 0;
    const errors: string[] = [];

    // ============ SYNC NBA ============
    try {
      const nbaGames = await bdlClient.getNBAGames({ dates, per_page: 100 });

      for (const bdlGame of nbaGames.data) {
        // Upsert game
        const gameStatus = bdlGame.status === "Final" ? "final" :
          bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

        let dbGame = await db.query.games.findFirst({
          where: eq(games.espnId, String(bdlGame.id)),
        });

        const gameElapsed = gameStatus === "final" ? 100 :
          gameStatus === "in_progress" ? ((bdlGame.period - 1) * 25 + (12 - parseFloat(bdlGame.time || "12")) / 12 * 25) : 0;

        if (dbGame) {
          await db.update(games).set({
            status: gameStatus,
            homeScore: bdlGame.home_team_score,
            awayScore: bdlGame.visitor_team_score,
            homeTeamLogo: getTeamLogoUrl("nba", bdlGame.home_team.abbreviation),
            awayTeamLogo: getTeamLogoUrl("nba", bdlGame.visitor_team.abbreviation),
            period: bdlGame.period,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
            updatedAt: new Date(),
          }).where(eq(games.id, dbGame.id));
        } else {
          const [newGame] = await db.insert(games).values({
            espnId: String(bdlGame.id),
            sport: "nba",
            homeTeam: bdlGame.home_team.full_name,
            homeTeamLogo: getTeamLogoUrl("nba", bdlGame.home_team.abbreviation),
            homeScore: bdlGame.home_team_score,
            awayTeam: bdlGame.visitor_team.full_name,
            awayTeamLogo: getTeamLogoUrl("nba", bdlGame.visitor_team.abbreviation),
            awayScore: bdlGame.visitor_team_score,
            status: gameStatus,
            period: bdlGame.period,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: gameElapsed,
            startedAt: new Date(bdlGame.date),
          }).returning();
          dbGame = newGame;
        }
        gamesUpdated++;

        // Get box score for live/completed games
        if (gameStatus !== "scheduled") {
          try {
            const boxScore = await bdlClient.getNBAGameBoxScore(bdlGame.id);
            const allPlayerStats = [
              ...boxScore.data.home_team.players,
              ...boxScore.data.visitor_team.players,
            ];

            for (const ps of allPlayerStats) {
              if (!ps.min || ps.min === "00:00") continue;

              // Upsert player
              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, String(ps.player.id)),
              });

              if (!dbPlayer) {
                const [newPlayer] = await db.insert(players).values({
                  espnId: String(ps.player.id),
                  name: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position || "Unknown",
                  sport: "nba",
                  gamesPlayed: 1,
                  isRookie: ps.player.draft_year === season,
                }).returning();
                dbPlayer = newPlayer;
              } else {
                await db.update(players).set({
                  team: ps.team.full_name,
                  position: ps.player.position || dbPlayer.position,
                  updatedAt: new Date(),
                }).where(eq(players.id, dbPlayer.id));
              }
              playersUpdated++;

              // Check for lines and calculate edges
              const lines = await db.query.playerLines.findMany({
                where: and(
                  eq(playerLines.playerId, dbPlayer.id),
                  eq(playerLines.gameId, dbGame.id)
                ),
              });

              for (const line of lines) {
                let currentValue = 0;
                switch (line.statType) {
                  case "points": currentValue = ps.pts; break;
                  case "rebounds": currentValue = ps.reb; break;
                  case "assists": currentValue = ps.ast; break;
                  case "three_pointers": currentValue = ps.fg3m; break;
                  case "steals": currentValue = ps.stl; break;
                  case "blocks": currentValue = ps.blk; break;
                }

                if (currentValue > 0) {
                  const result = calculateEdgeScore({
                    currentValue,
                    gameElapsedPercent: gameElapsed,
                    pregameLine: line.pregameLine,
                    gamesPlayed: dbPlayer.gamesPlayed,
                    historicalStddev: dbPlayer.historicalStddev || 0,
                    isRookie: dbPlayer.isRookie,
                    statType: line.statType,
                    scoreDifferential: Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score),
                    period: bdlGame.period,
                    personalFouls: ps.pf || 0,
                    sport: "nba",
                  });

                  await db.insert(liveStats).values({
                    playerId: dbPlayer.id,
                    gameId: dbGame.id,
                    statType: line.statType,
                    currentValue,
                    pace: result.pace,
                    edgeScore: result.edgeScore,
                  });

                  if (shouldAlert(result.edgeScore)) {
                    await db.insert(alerts).values({
                      playerId: dbPlayer.id,
                      gameId: dbGame.id,
                      statType: line.statType,
                      edgeScore: result.edgeScore,
                      message: generateAlertMessage(dbPlayer.name, line.statType, result, line.pregameLine),
                      status: "active",
                    });
                    alertsCreated++;
                  }
                }
              }
            }
          } catch (err: any) {
            errors.push(`NBA box score ${bdlGame.id}: ${err.message}`);
          }
        }

        // Get player props for upcoming/live games
        if (gameStatus !== "final") {
          try {
            const props = await bdlClient.getNBAPlayerProps({ game_id: bdlGame.id });

            for (const prop of props.data) {
              // Find or create player
              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, String(prop.player.id)),
              });

              if (!dbPlayer) {
                const p = prop.player as any;
                const [newPlayer] = await db.insert(players).values({
                  espnId: String(prop.player.id),
                  name: `${p.first_name} ${p.last_name}`,
                  team: p.team?.full_name || "Unknown",
                  position: p.position || "Unknown",
                  sport: "nba",
                  gamesPlayed: 1,
                  isRookie: false,
                }).returning();
                dbPlayer = newPlayer;
              }

              // Map prop type to our stat type
              type StatType = "receiving_yards" | "rushing_yards" | "receptions" | "passing_yards" | "touchdowns" | "points" | "rebounds" | "assists" | "three_pointers" | "steals" | "blocks";
              const statTypeMap: Record<string, StatType> = {
                points: "points",
                rebounds: "rebounds",
                assists: "assists",
                threes: "three_pointers",
                steals: "steals",
                blocks: "blocks",
              };
              const statType = statTypeMap[prop.prop_type];
              if (!statType) continue; // Skip unknown stat types

              // Upsert line (keyed by vendor for multi-sportsbook support)
              const propVendor = prop.vendor || "unknown";
              const existingLine = await db.query.playerLines.findFirst({
                where: and(
                  eq(playerLines.playerId, dbPlayer.id),
                  eq(playerLines.gameId, dbGame.id),
                  eq(playerLines.statType, statType),
                  eq(playerLines.vendor, propVendor)
                ),
              });

              if (existingLine) {
                await db.update(playerLines).set({
                  pregameLine: prop.line,
                  source: prop.vendor,
                }).where(eq(playerLines.id, existingLine.id));
              } else {
                await db.insert(playerLines).values({
                  playerId: dbPlayer.id,
                  gameId: dbGame.id,
                  statType,
                  pregameLine: prop.line,
                  vendor: propVendor,
                  source: prop.vendor,
                });
              }
              propsUpdated++;
            }
          } catch (err: any) {
            errors.push(`NBA props ${bdlGame.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`NBA sync: ${err.message}`);
    }

    // ============ SYNC NFL ============
    try {
      const nflGames = await bdlClient.getNFLGames({ dates, per_page: 100 });

      for (const bdlGame of nflGames.data) {
        const gameStatus = bdlGame.status === "Final" ? "final" :
          bdlGame.status === "In Progress" ? "in_progress" : "scheduled";

        let dbGame = await db.query.games.findFirst({
          where: eq(games.espnId, `nfl-${bdlGame.id}`),
        });

        const gameElapsed = gameStatus === "final" ? 100 :
          gameStatus === "in_progress" ? ((bdlGame.quarter - 1) * 25 + (15 - parseFloat(bdlGame.time || "15")) / 15 * 25) : 0;

        if (dbGame) {
          await db.update(games).set({
            status: gameStatus,
            homeScore: bdlGame.home_team_score,
            awayScore: bdlGame.visitor_team_score,
            homeTeamLogo: getTeamLogoUrl("nfl", bdlGame.home_team.abbreviation),
            awayTeamLogo: getTeamLogoUrl("nfl", bdlGame.visitor_team.abbreviation),
            period: bdlGame.quarter,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: Math.min(100, Math.max(0, gameElapsed)),
            updatedAt: new Date(),
          }).where(eq(games.id, dbGame.id));
        } else {
          const [newGame] = await db.insert(games).values({
            espnId: `nfl-${bdlGame.id}`,
            sport: "nfl",
            homeTeam: bdlGame.home_team.full_name,
            homeTeamLogo: getTeamLogoUrl("nfl", bdlGame.home_team.abbreviation),
            awayTeam: bdlGame.visitor_team.full_name,
            awayTeamLogo: getTeamLogoUrl("nfl", bdlGame.visitor_team.abbreviation),
            homeScore: bdlGame.home_team_score,
            awayScore: bdlGame.visitor_team_score,
            status: gameStatus,
            period: bdlGame.quarter,
            timeRemaining: bdlGame.time || "",
            gameElapsedPercent: gameElapsed,
            startedAt: new Date(bdlGame.date),
          }).returning();
          dbGame = newGame;
        }
        gamesUpdated++;

        // Get NFL stats for live/completed games
        if (gameStatus !== "scheduled") {
          try {
            const stats = await bdlClient.getNFLStats({ game_ids: [bdlGame.id] });

            for (const ps of stats.data) {
              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, `nfl-${ps.player.id}`),
              });

              if (!dbPlayer) {
                const [newPlayer] = await db.insert(players).values({
                  espnId: `nfl-${ps.player.id}`,
                  name: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position_abbreviation || "Unknown",
                  sport: "nfl",
                  gamesPlayed: 1,
                  isRookie: false,
                }).returning();
                dbPlayer = newPlayer;
              }
              playersUpdated++;

              // Check lines and calculate edges
              const lines = await db.query.playerLines.findMany({
                where: and(
                  eq(playerLines.playerId, dbPlayer.id),
                  eq(playerLines.gameId, dbGame.id)
                ),
              });

              for (const line of lines) {
                let currentValue = 0;
                switch (line.statType) {
                  case "passing_yards": currentValue = ps.passing_yards; break;
                  case "rushing_yards": currentValue = ps.rushing_yards; break;
                  case "receiving_yards": currentValue = ps.receiving_yards; break;
                  case "receptions": currentValue = ps.receptions; break;
                  case "touchdowns": currentValue = ps.passing_tds + ps.rushing_tds + ps.receiving_tds; break;
                }

                if (currentValue > 0) {
                  const result = calculateEdgeScore({
                    currentValue,
                    gameElapsedPercent: gameElapsed,
                    pregameLine: line.pregameLine,
                    gamesPlayed: dbPlayer.gamesPlayed,
                    historicalStddev: dbPlayer.historicalStddev || 0,
                    isRookie: dbPlayer.isRookie,
                    statType: line.statType,
                    scoreDifferential: Math.abs(bdlGame.home_team_score - bdlGame.visitor_team_score),
                    period: bdlGame.quarter,
                    sport: "nfl",
                  });

                  await db.insert(liveStats).values({
                    playerId: dbPlayer.id,
                    gameId: dbGame.id,
                    statType: line.statType,
                    currentValue,
                    pace: result.pace,
                    edgeScore: result.edgeScore,
                  });

                  if (shouldAlert(result.edgeScore)) {
                    await db.insert(alerts).values({
                      playerId: dbPlayer.id,
                      gameId: dbGame.id,
                      statType: line.statType,
                      edgeScore: result.edgeScore,
                      message: generateAlertMessage(dbPlayer.name, line.statType, result, line.pregameLine),
                      status: "active",
                    });
                    alertsCreated++;
                  }
                }
              }
            }
          } catch (err: any) {
            errors.push(`NFL stats ${bdlGame.id}: ${err.message}`);
          }
        }

        // Get NFL player props
        if (gameStatus !== "final") {
          try {
            const props = await bdlClient.getNFLPlayerProps({ game_ids: [bdlGame.id] });

            for (const prop of props.data) {
              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, `nfl-${prop.player.id}`),
              });

              if (!dbPlayer) {
                const p = prop.player as any;
                const [newPlayer] = await db.insert(players).values({
                  espnId: `nfl-${prop.player.id}`,
                  name: `${p.first_name} ${p.last_name}`,
                  team: p.team?.full_name || "Unknown",
                  position: p.position_abbreviation || "Unknown",
                  sport: "nfl",
                  gamesPlayed: 1,
                  isRookie: false,
                }).returning();
                dbPlayer = newPlayer;
              }

              type NFLStatType = "receiving_yards" | "rushing_yards" | "receptions" | "passing_yards" | "touchdowns";
              const statTypeMap: Record<string, NFLStatType> = {
                passing_yards: "passing_yards",
                rushing_yards: "rushing_yards",
                receiving_yards: "receiving_yards",
                receptions: "receptions",
                passing_tds: "touchdowns",
                rushing_tds: "touchdowns",
                receiving_tds: "touchdowns",
              };
              const statType = statTypeMap[prop.prop_type];
              if (!statType) continue; // Skip unknown stat types

              // Upsert line (keyed by vendor for multi-sportsbook support)
              const propVendor = prop.vendor || "unknown";
              const existingLine = await db.query.playerLines.findFirst({
                where: and(
                  eq(playerLines.playerId, dbPlayer.id),
                  eq(playerLines.gameId, dbGame.id),
                  eq(playerLines.statType, statType),
                  eq(playerLines.vendor, propVendor)
                ),
              });

              if (existingLine) {
                await db.update(playerLines).set({
                  pregameLine: prop.line,
                  source: prop.vendor,
                }).where(eq(playerLines.id, existingLine.id));
              } else {
                await db.insert(playerLines).values({
                  playerId: dbPlayer.id,
                  gameId: dbGame.id,
                  statType,
                  pregameLine: prop.line,
                  vendor: propVendor,
                  source: prop.vendor,
                });
              }
              propsUpdated++;
            }
          } catch (err: any) {
            errors.push(`NFL props ${bdlGame.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`NFL sync: ${err.message}`);
    }

    return NextResponse.json({
      success: true,
      gamesUpdated,
      playersUpdated,
      propsUpdated,
      alertsCreated,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}
