import { NextRequest, NextResponse } from "next/server";
import { bdlClient, extractPropLine, extractPropPlayerId } from "@/lib/balldontlie";
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
                  name: dbPlayer.name.startsWith("Player #") ? `${ps.player.first_name} ${ps.player.last_name}` : dbPlayer.name,
                  team: ps.team.full_name,
                  position: ps.player.position || dbPlayer.position,
                  isRookie: ps.player.draft_year === season,
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
                  case "assists": currentValue = ps.ast; break;
                  case "three_pointers": currentValue = ps.fg3m; break;
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

            // Batch-fetch NBA player details (V2 props don't include player object)
            const propPlayerIds = [...new Set(props.data.map(p => extractPropPlayerId(p)).filter(id => id > 0))];
            const bdlPlayerMap = new Map<number, { first_name: string; last_name: string; team: any; position: string; draft_year: number }>();
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
              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, String(propPlayerId)),
              });

              const bdlPlayer = bdlPlayerMap.get(propPlayerId);
              const p = bdlPlayer || prop.player as any;

              if (!dbPlayer) {
                const [newPlayer] = await db.insert(players).values({
                  espnId: String(propPlayerId),
                  name: p ? `${p.first_name} ${p.last_name}` : `Player #${propPlayerId}`,
                  team: p?.team?.full_name || "Unknown",
                  position: p?.position || "Unknown",
                  sport: "nba",
                  gamesPlayed: 1,
                  isRookie: p?.draft_year === season,
                }).returning();
                dbPlayer = newPlayer;
              } else if (dbPlayer.name.startsWith("Player #") && p) {
                // Fix previously unknown player names
                await db.update(players).set({
                  name: `${p.first_name} ${p.last_name}`,
                  team: p.team?.full_name || dbPlayer.team,
                  position: p.position || dbPlayer.position,
                  updatedAt: new Date(),
                }).where(eq(players.id, dbPlayer.id));
                dbPlayer = { ...dbPlayer, name: `${p.first_name} ${p.last_name}` };
              }

              // Map prop type to our stat type
              type StatType = "receiving_yards" | "rushing_yards" | "receptions" | "passing_yards" | "touchdowns" | "points" | "assists" | "three_pointers";
              const statTypeMap: Record<string, StatType> = {
                points: "points",
                assists: "assists",
                threes: "three_pointers",
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
                  pregameLine: propLineValue,
                  source: prop.vendor,
                }).where(eq(playerLines.id, existingLine.id));
              } else {
                await db.insert(playerLines).values({
                  playerId: dbPlayer.id,
                  gameId: dbGame.id,
                  statType,
                  pregameLine: propLineValue,
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
              const propPlayerId = extractPropPlayerId(prop);
              const propLineValue = extractPropLine(prop);
              if (!propPlayerId) continue;

              let dbPlayer = await db.query.players.findFirst({
                where: eq(players.espnId, `nfl-${propPlayerId}`),
              });

              const p = prop.player as any;

              if (!dbPlayer) {
                const nflExp = p?.experience;
                const nflIsRookie = nflExp === "Rookie" || nflExp === "1" || nflExp === "";
                const [newPlayer] = await db.insert(players).values({
                  espnId: `nfl-${propPlayerId}`,
                  name: p ? `${p.first_name} ${p.last_name}` : `Player #${propPlayerId}`,
                  team: p?.team?.full_name || "Unknown",
                  position: p?.position_abbreviation || "Unknown",
                  sport: "nfl",
                  gamesPlayed: 1,
                  isRookie: nflIsRookie,
                }).returning();
                dbPlayer = newPlayer;
              } else if (dbPlayer.name.startsWith("Player #") && p) {
                await db.update(players).set({
                  name: `${p.first_name} ${p.last_name}`,
                  team: p.team?.full_name || dbPlayer.team,
                  position: p.position_abbreviation || dbPlayer.position,
                  updatedAt: new Date(),
                }).where(eq(players.id, dbPlayer.id));
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
                  pregameLine: propLineValue,
                  source: prop.vendor,
                }).where(eq(playerLines.id, existingLine.id));
              } else {
                await db.insert(playerLines).values({
                  playerId: dbPlayer.id,
                  gameId: dbGame.id,
                  statType,
                  pregameLine: propLineValue,
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
