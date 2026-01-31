import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, playerLines, alerts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";
import { calculateEdgeScore, calculateMateoScore } from "@/lib/algorithm";

export const dynamic = "force-dynamic";

// Types for the monitoring response
interface MonitoringData {
  game: {
    id: string;
    sport: "nba" | "nfl";
    homeTeam: { name: string; logo?: string; score: number };
    awayTeam: { name: string; logo?: string; score: number };
    status: "scheduled" | "in_progress" | "final" | "postponed";
    period: number;
    timeRemaining: string;
    gameElapsedPercent: number;
  };
  players: {
    id: string;
    name: string;
    team: string;
    position: string;
    lines: {
      statType: string;
      pregameLine: number;
      currentValue: number;
      projectedPace: number;
      edgeScore: number;
      mateoScore: number;
      seasonAverage: number | null;
    }[];
  }[];
  alerts: {
    id: string;
    playerName: string;
    statType: string;
    edgeScore: number;
    message: string;
    createdAt: string;
  }[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    // Get game from database (try by ID first, then by ESPN ID)
    let dbGame = await db.query.games.findFirst({
      where: eq(games.id, gameId),
    });

    if (!dbGame) {
      dbGame = await db.query.games.findFirst({
        where: eq(games.espnId, gameId),
      });
    }

    if (!dbGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Parse BDL game ID
    const bdlGameId = dbGame.sport === "nfl"
      ? parseInt(dbGame.espnId.replace("nfl-", ""))
      : parseInt(dbGame.espnId);

    // Fetch FRESH data from BallDontLie API
    let gameStatus: "scheduled" | "in_progress" | "final" | "postponed" = "scheduled";
    let gameElapsedPercent = 0;
    let period = 0;
    let timeRemaining = "";
    let homeScore = 0;
    let awayScore = 0;
    let homeTeamName = dbGame.homeTeam;
    let awayTeamName = dbGame.awayTeam;
    let homeTeamLogo = dbGame.homeTeamLogo;
    let awayTeamLogo = dbGame.awayTeamLogo;

    const playerStatsMap = new Map<string, {
      playerId: string;
      playerName: string;
      team: string;
      position: string;
      stats: Record<string, number>;
    }>();

    // Map to store season averages by player ID
    const seasonAveragesMap = new Map<string, {
      points: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
      three_pointers?: number;
    }>();

    // Map to store betting lines fetched from API (playerId -> statType -> line)
    const apiLinesMap = new Map<string, Map<string, number>>();

    if (dbGame.sport === "nba") {
      try {
        // Fetch today's games to get current status (no cache for live data)
        const today = new Date().toLocaleDateString('en-CA');
        const nbaGames = await bdlClient.getNBAGames({ dates: [today], per_page: 100 }, true);
        const bdlGame = nbaGames.data.find(g => g.id === bdlGameId);

        if (bdlGame) {
          // Determine status
          const statusLower = (bdlGame.status || "").toLowerCase();
          const isInProgress = statusLower.includes("progress") ||
            (bdlGame.period > 0 && !statusLower.includes("final"));
          const isFinal = statusLower.includes("final");

          gameStatus = isFinal ? "final" : isInProgress ? "in_progress" : "scheduled";
          period = bdlGame.period;
          timeRemaining = bdlGame.time || "";
          homeScore = bdlGame.home_team_score;
          awayScore = bdlGame.visitor_team_score;
          homeTeamName = bdlGame.home_team.full_name;
          awayTeamName = bdlGame.visitor_team.full_name;
          homeTeamLogo = `https://cdn.nba.com/logos/nba/${bdlGame.home_team.id}/global/L/logo.svg`;
          awayTeamLogo = `https://cdn.nba.com/logos/nba/${bdlGame.visitor_team.id}/global/L/logo.svg`;

          // Calculate elapsed percent
          if (gameStatus === "final") {
            gameElapsedPercent = 100;
          } else if (gameStatus === "in_progress" && bdlGame.period > 0) {
            const timeRaw = (bdlGame.time || "").toLowerCase();

            // Handle special time values
            if (timeRaw.includes("half")) {
              // Halftime = end of 2nd quarter = 50%
              gameElapsedPercent = 50;
            } else if (timeRaw.includes("end") || timeRaw === "") {
              // End of quarter - use period to determine
              gameElapsedPercent = bdlGame.period * 25;
            } else {
              // Parse time like "4:00" or "Q2 4:00"
              const timeStr = timeRaw.replace(/q\d\s*/i, "");
              const timeParts = timeStr.split(":");
              const minutes = parseFloat(timeParts[0]) || 0;
              const seconds = parseFloat(timeParts[1]) || 0;
              const timeInMinutes = minutes + seconds / 60;

              // NBA quarter is 12 minutes
              if (!isNaN(timeInMinutes)) {
                gameElapsedPercent = ((bdlGame.period - 1) * 25) + ((12 - timeInMinutes) / 12 * 25);
              } else {
                // Fallback: just use period completion
                gameElapsedPercent = (bdlGame.period - 1) * 25 + 12.5;
              }
            }
            gameElapsedPercent = Math.min(100, Math.max(0, gameElapsedPercent));
          }

          // Fetch player props (betting lines) from BallDontLie V2 API
          if (gameStatus !== "final") {
            try {
              const props = await bdlClient.getNBAPlayerProps({ game_id: bdlGameId });

              const statTypeMap: Record<string, string> = {
                points: "points",
                rebounds: "rebounds",
                assists: "assists",
                threes: "three_pointers",
                steals: "steals",
                blocks: "blocks",
              };

              for (const prop of props.data) {
                // V2 API uses player_id directly, not player.id
                const propData = prop as { player_id?: number; line_value?: number; prop_type: string; line?: number };
                const playerId = String(propData.player_id);
                const statType = statTypeMap[prop.prop_type] || prop.prop_type;
                // V2 API uses line_value instead of line
                const lineValue = parseFloat(String(propData.line_value)) || prop.line || 0;

                if (!apiLinesMap.has(playerId)) {
                  apiLinesMap.set(playerId, new Map());
                }
                apiLinesMap.get(playerId)!.set(statType, lineValue);
              }
            } catch (propsError) {
              console.error("Error fetching NBA props:", propsError);
            }
          }

          // Fetch player stats for this game (no cache for live data)
          if (gameStatus !== "scheduled") {
            try {
              const stats = await bdlClient.getNBAStats({ game_ids: [bdlGameId], per_page: 100 }, true);

              for (const ps of stats.data) {
                playerStatsMap.set(String(ps.player.id), {
                  playerId: String(ps.player.id),
                  playerName: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position || "N/A",
                  stats: {
                    points: ps.pts || 0,
                    rebounds: ps.reb || 0,
                    assists: ps.ast || 0,
                    three_pointers: ps.fg3m || 0,
                    steals: ps.stl || 0,
                    blocks: ps.blk || 0,
                  },
                });
              }

              // Fetch season averages for all players in this game (API only accepts one at a time)
              const playerIds = stats.data.map(ps => ps.player.id);
              if (playerIds.length > 0) {
                const currentSeason = new Date().getMonth() >= 9
                  ? new Date().getFullYear()
                  : new Date().getFullYear() - 1;

                // Fetch in parallel for speed, limit to first 15 players to avoid rate limits
                const playersToFetch = playerIds.slice(0, 15);
                const avgPromises = playersToFetch.map(async (playerId) => {
                  try {
                    const seasonAvgs = await bdlClient.getNBASeasonAverages({
                      season: currentSeason,
                      player_id: playerId,
                    });
                    if (seasonAvgs.data.length > 0) {
                      const avg = seasonAvgs.data[0];
                      seasonAveragesMap.set(String(avg.player_id), {
                        points: avg.pts || 0,
                        rebounds: avg.reb || 0,
                        assists: avg.ast || 0,
                        steals: avg.stl || 0,
                        blocks: avg.blk || 0,
                      });
                    }
                  } catch {
                    // Silently fail for individual player
                  }
                });

                await Promise.allSettled(avgPromises);
              }
            } catch (error) {
              console.error("Error fetching NBA stats:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching NBA game data:", error);
      }
    } else if (dbGame.sport === "nfl") {
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const nflGames = await bdlClient.getNFLGames({ dates: [today], per_page: 100 });
        const bdlGame = nflGames.data.find(g => g.id === bdlGameId);

        if (bdlGame) {
          const statusLower = (bdlGame.status || "").toLowerCase();
          const isInProgress = statusLower.includes("progress") ||
            (bdlGame.quarter > 0 && !statusLower.includes("final"));
          const isFinal = statusLower.includes("final");

          gameStatus = isFinal ? "final" : isInProgress ? "in_progress" : "scheduled";
          period = bdlGame.quarter;
          timeRemaining = bdlGame.time || "";
          homeScore = bdlGame.home_team_score;
          awayScore = bdlGame.visitor_team_score;
          homeTeamName = bdlGame.home_team.full_name;
          awayTeamName = bdlGame.visitor_team.full_name;

          if (gameStatus === "final") {
            gameElapsedPercent = 100;
          } else if (gameStatus === "in_progress" && bdlGame.quarter > 0) {
            const timeInMinutes = parseFloat(bdlGame.time?.split(":")[0] || "15");
            gameElapsedPercent = ((bdlGame.quarter - 1) * 25) + ((15 - timeInMinutes) / 15 * 25);
            gameElapsedPercent = Math.min(100, Math.max(0, gameElapsedPercent));
          }

          if (gameStatus !== "scheduled") {
            try {
              const stats = await bdlClient.getNFLStats({ game_ids: [bdlGameId] });
              for (const ps of stats.data) {
                playerStatsMap.set(`nfl-${ps.player.id}`, {
                  playerId: `nfl-${ps.player.id}`,
                  playerName: `${ps.player.first_name} ${ps.player.last_name}`,
                  team: ps.team.full_name,
                  position: ps.player.position_abbreviation || "N/A",
                  stats: {
                    passing_yards: ps.passing_yards || 0,
                    rushing_yards: ps.rushing_yards || 0,
                    receiving_yards: ps.receiving_yards || 0,
                    receptions: ps.receptions || 0,
                    touchdowns: (ps.passing_tds || 0) + (ps.rushing_tds || 0) + (ps.receiving_tds || 0),
                  },
                });
              }
            } catch (error) {
              console.error("Error fetching NFL stats:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching NFL game data:", error);
      }
    }

    // Get player lines from database
    const lines = await db.query.playerLines.findMany({
      where: eq(playerLines.gameId, dbGame.id),
    });

    const linePlayerIds = [...new Set(lines.map((l) => l.playerId))];
    const dbPlayers = linePlayerIds.length > 0
      ? await db.query.players.findMany({
          where: (players, { inArray }) => inArray(players.id, linePlayerIds),
        })
      : [];

    // Build player monitoring data - show ALL players from box score
    const monitoringPlayers: MonitoringData["players"] = [];

    for (const [bdlPlayerId, playerData] of playerStatsMap) {
      // Find if this player has lines configured
      const dbPlayer = dbPlayers.find((p) => p.espnId === bdlPlayerId);
      const playerLinesList = dbPlayer
        ? lines.filter((l) => l.playerId === dbPlayer.id)
        : [];

      // Get season averages for this player
      const playerSeasonAvgs = seasonAveragesMap.get(bdlPlayerId);

      // Build lines array - show configured lines OR show all stats as lines
      const playerLines: MonitoringData["players"][0]["lines"] = [];

      if (playerLinesList.length > 0) {
        // Player has configured lines - use those
        for (const line of playerLinesList) {
          const currentValue = playerData.stats[line.statType] || 0;
          let edgeScore = 0;
          let mateoScore = 0;
          let pace = 0;

          if (currentValue > 0 && gameElapsedPercent > 0) {
            const result = calculateEdgeScore({
              currentValue,
              gameElapsedPercent,
              pregameLine: line.pregameLine,
              gamesPlayed: dbPlayer?.gamesPlayed || 10,
              historicalStddev: dbPlayer?.historicalStddev || 0,
              isRookie: dbPlayer?.isRookie || false,
            });
            edgeScore = result.edgeScore;
            pace = result.pace;

            // Calculate Mateo score
            const mateoResult = calculateMateoScore({
              currentValue,
              pregameLine: line.pregameLine,
              gameElapsedPercent,
            });
            mateoScore = mateoResult.pacePercent;
          }

          // Get season average for this stat type
          const seasonAvg = playerSeasonAvgs
            ? (playerSeasonAvgs as Record<string, number>)[line.statType] || null
            : null;

          playerLines.push({
            statType: line.statType,
            pregameLine: line.pregameLine,
            currentValue,
            projectedPace: pace,
            edgeScore,
            mateoScore,
            seasonAverage: seasonAvg,
          });
        }
      } else {
        // No DB lines - use API-fetched lines if available, otherwise show stats
        const apiPlayerLines = apiLinesMap.get(bdlPlayerId);

        for (const [statType, value] of Object.entries(playerData.stats)) {
          // Get API line for this stat if available
          const apiLine = apiPlayerLines?.get(statType) || 0;

          // Get season average for this stat type
          const seasonAvg = playerSeasonAvgs
            ? (playerSeasonAvgs as Record<string, number>)[statType] || null
            : null;

          // Calculate edge if we have a line and current value
          let edgeScore = 0;
          let mateoScore = 0;
          let pace = 0;
          if (value > 0 && apiLine > 0 && gameElapsedPercent > 0) {
            const result = calculateEdgeScore({
              currentValue: value,
              gameElapsedPercent,
              pregameLine: apiLine,
              gamesPlayed: 10,
              historicalStddev: 0,
              isRookie: false,
            });
            edgeScore = result.edgeScore;
            pace = result.pace;

            // Calculate Mateo score
            const mateoResult = calculateMateoScore({
              currentValue: value,
              pregameLine: apiLine,
              gameElapsedPercent,
            });
            mateoScore = mateoResult.pacePercent;
          } else if (value > 0 && gameElapsedPercent > 0) {
            pace = (value / gameElapsedPercent) * 100;
          }

          // Only show stats that have value OR have a line
          if (value > 0 || apiLine > 0) {
            playerLines.push({
              statType,
              pregameLine: apiLine,
              currentValue: value,
              projectedPace: pace,
              edgeScore,
              mateoScore,
              seasonAverage: seasonAvg,
            });
          }
        }
      }

      if (playerLines.length > 0) {
        monitoringPlayers.push({
          id: dbPlayer?.id || bdlPlayerId,
          name: playerData.playerName,
          team: playerData.team,
          position: playerData.position,
          lines: playerLines,
        });
      }
    }

    // Sort players: those with edges first, then by total stats
    monitoringPlayers.sort((a, b) => {
      const aMaxEdge = Math.max(0, ...a.lines.map((l) => l.edgeScore));
      const bMaxEdge = Math.max(0, ...b.lines.map((l) => l.edgeScore));
      if (aMaxEdge !== bMaxEdge) return bMaxEdge - aMaxEdge;

      const aTotal = a.lines.reduce((sum, l) => sum + l.currentValue, 0);
      const bTotal = b.lines.reduce((sum, l) => sum + l.currentValue, 0);
      return bTotal - aTotal;
    });

    // Fetch alerts for this game
    const gameAlerts = await db.query.alerts.findMany({
      where: eq(alerts.gameId, dbGame.id),
      orderBy: [desc(alerts.createdAt)],
      limit: 20,
    });

    const alertsResponse: MonitoringData["alerts"] = gameAlerts.map((alert) => {
      const player = dbPlayers.find((p) => p.id === alert.playerId);
      return {
        id: alert.id,
        playerName: player?.name || "Unknown",
        statType: alert.statType,
        edgeScore: alert.edgeScore,
        message: alert.message || "",
        createdAt: alert.createdAt.toISOString(),
      };
    });

    const response: MonitoringData = {
      game: {
        id: dbGame.id,
        sport: dbGame.sport as "nba" | "nfl",
        homeTeam: {
          name: homeTeamName,
          logo: homeTeamLogo || undefined,
          score: homeScore,
        },
        awayTeam: {
          name: awayTeamName,
          logo: awayTeamLogo || undefined,
          score: awayScore,
        },
        status: gameStatus,
        period,
        timeRemaining,
        gameElapsedPercent,
      },
      players: monitoringPlayers,
      alerts: alertsResponse,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in monitor endpoint:", error);
    return NextResponse.json(
      { error: "Failed to fetch monitoring data" },
      { status: 500 }
    );
  }
}
