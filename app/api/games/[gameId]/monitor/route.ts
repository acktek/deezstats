import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, players as playersTable, playerLines, alerts } from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { bdlClient } from "@/lib/balldontlie";
import { calculateEdgeScore, calculateMateoScore } from "@/lib/algorithm";
import { getDateRangeUTC, getCurrentSeasonUTC, getNBAHeadshotUrl, getTeamLogoUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Helper to parse minutes string (e.g., "32:45" -> 32.75)
function parseMinutes(minStr: string | undefined): number {
  if (!minStr) return 0;
  const parts = minStr.split(":");
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;
  return minutes + seconds / 60;
}

// Select the primary (lowest) line from vendor lines — most conservative for over bets
function selectPrimaryLine(vendorLines: { vendor: string; line: number }[]): number {
  if (vendorLines.length === 0) return 0;
  return Math.min(...vendorLines.map(vl => vl.line));
}

// Types for the monitoring response
interface VendorLine {
  vendor: string;
  line: number;
}

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
    imageUrl?: string;
    lines: {
      statType: string;
      pregameLine: number;
      vendorLines: VendorLine[];
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
      minutesPlayed: number;
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
      expectedMinutes?: number;
    }>();

    // Map to store betting lines fetched from API (playerId -> statType -> vendor lines array)
    const apiLinesMap = new Map<string, Map<string, VendorLine[]>>();

    // Map to store player info from props (for pre-game when players aren't in box score)
    const propsPlayerInfoMap = new Map<string, { name: string; team: string; position: string }>();

    if (dbGame.sport === "nba") {
      try {
        // Fetch games to get current status - use UTC date range to handle timezone differences
        const dates = getDateRangeUTC();
        const nbaGames = await bdlClient.getNBAGames({ dates, per_page: 100 }, true);
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
          homeTeamLogo = getTeamLogoUrl("nba", bdlGame.home_team.abbreviation);
          awayTeamLogo = getTeamLogoUrl("nba", bdlGame.visitor_team.abbreviation);

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
                // V2 API may use player_id directly, or nested player.id
                const propData = prop as { player_id?: number; line_value?: number; prop_type: string; line?: number; vendor?: string };
                const playerId = String(propData.player_id || prop.player?.id);
                const statType = statTypeMap[prop.prop_type] || prop.prop_type;
                // V2 API uses line_value instead of line
                const lineValue = parseFloat(String(propData.line_value)) || prop.line || 0;
                const vendor = prop.vendor || (propData as any).vendor || "unknown";

                // Store player info from props for pre-game display
                if (prop.player && !propsPlayerInfoMap.has(playerId)) {
                  const p = prop.player as any;
                  propsPlayerInfoMap.set(playerId, {
                    name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || `Player #${playerId}`,
                    team: p.team?.full_name || "Unknown",
                    position: p.position || p.position_abbreviation || "N/A",
                  });
                }

                if (!apiLinesMap.has(playerId)) {
                  apiLinesMap.set(playerId, new Map());
                }
                const playerMap = apiLinesMap.get(playerId)!;
                if (!playerMap.has(statType)) {
                  playerMap.set(statType, []);
                }
                // Avoid duplicate vendor entries for same stat
                const existingVendors = playerMap.get(statType)!;
                const existingIdx = existingVendors.findIndex(v => v.vendor === vendor);
                if (existingIdx >= 0) {
                  existingVendors[existingIdx].line = lineValue;
                } else {
                  existingVendors.push({ vendor, line: lineValue });
                }
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
                  minutesPlayed: parseMinutes(ps.min),
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

              // Fetch season averages for all players in this game
              const playerIdsForAvg = stats.data.map(ps => ps.player.id);
              if (playerIdsForAvg.length > 0) {
                const currentSeason = getCurrentSeasonUTC();
                const playersToFetch = playerIdsForAvg.slice(0, 15);
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
                        three_pointers: (avg as any).fg3m || 0,
                        expectedMinutes: parseMinutes(avg.min),
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
          } else {
            // SCHEDULED GAME: populate playerStatsMap from props so pre-game view works
            if (apiLinesMap.size > 0) {
              // Get unique player IDs from props
              const propPlayerIds = Array.from(apiLinesMap.keys());

              // Look up players in DB by espnId
              const existingPlayers = await db.query.players.findMany({
                where: inArray(playersTable.espnId, propPlayerIds),
              });
              const existingPlayerMap = new Map(existingPlayers.map(p => [p.espnId, p]));

              // For players not in DB, try to get their info from the prop data
              // We'll use team info from the game itself
              for (const playerId of propPlayerIds) {
                const existingPlayer = existingPlayerMap.get(playerId);
                const propInfo = propsPlayerInfoMap.get(playerId);
                if (existingPlayer) {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: existingPlayer.name,
                    team: existingPlayer.team || propInfo?.team || "Unknown",
                    position: existingPlayer.position || propInfo?.position || "N/A",
                    minutesPlayed: 0,
                    stats: {},
                  });
                } else if (propInfo) {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: propInfo.name,
                    team: propInfo.team,
                    position: propInfo.position,
                    minutesPlayed: 0,
                    stats: {},
                  });
                } else {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: `Player #${playerId}`,
                    team: "Unknown",
                    position: "N/A",
                    minutesPlayed: 0,
                    stats: {},
                  });
                }
              }

              // Fetch season averages for pre-game players
              const currentSeason = getCurrentSeasonUTC();
              const playersForAvg = propPlayerIds
                .map(id => parseInt(id))
                .filter(id => !isNaN(id))
                .slice(0, 20);

              if (playersForAvg.length > 0) {
                const avgPromises = playersForAvg.map(async (playerId) => {
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
                        three_pointers: (avg as any).fg3m || 0,
                        expectedMinutes: parseMinutes(avg.min),
                      });
                    }
                  } catch {
                    // Silently fail for individual player
                  }
                });
                await Promise.allSettled(avgPromises);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching NBA game data:", error);
      }
    } else if (dbGame.sport === "nfl") {
      try {
        // Use UTC date range to handle timezone differences
        const dates = getDateRangeUTC();
        const nflGames = await bdlClient.getNFLGames({ dates, per_page: 100 });
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
          homeTeamLogo = getTeamLogoUrl("nfl", bdlGame.home_team.abbreviation);
          awayTeamLogo = getTeamLogoUrl("nfl", bdlGame.visitor_team.abbreviation);

          // Fetch NFL player props
          if (gameStatus !== "final") {
            try {
              const props = await bdlClient.getNFLPlayerProps({ game_ids: [bdlGameId] });

              const statTypeMap: Record<string, string> = {
                passing_yards: "passing_yards",
                rushing_yards: "rushing_yards",
                receiving_yards: "receiving_yards",
                receptions: "receptions",
                passing_tds: "touchdowns",
                rushing_tds: "touchdowns",
                receiving_tds: "touchdowns",
              };

              for (const prop of props.data) {
                const playerId = `nfl-${prop.player.id}`;
                const statType = statTypeMap[prop.prop_type];
                if (!statType) continue;
                const vendor = prop.vendor || "unknown";

                // Store player info from props for pre-game display
                if (prop.player && !propsPlayerInfoMap.has(playerId)) {
                  const p = prop.player as any;
                  propsPlayerInfoMap.set(playerId, {
                    name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || `Player #${playerId}`,
                    team: p.team?.full_name || "Unknown",
                    position: p.position_abbreviation || p.position || "N/A",
                  });
                }

                if (!apiLinesMap.has(playerId)) {
                  apiLinesMap.set(playerId, new Map());
                }
                const playerMap = apiLinesMap.get(playerId)!;
                if (!playerMap.has(statType)) {
                  playerMap.set(statType, []);
                }
                const existingVendors = playerMap.get(statType)!;
                const existingIdx = existingVendors.findIndex(v => v.vendor === vendor);
                if (existingIdx >= 0) {
                  existingVendors[existingIdx].line = prop.line;
                } else {
                  existingVendors.push({ vendor, line: prop.line });
                }
              }
            } catch (propsError) {
              console.error("Error fetching NFL props:", propsError);
            }
          }

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
                  minutesPlayed: 0,
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
          } else {
            // SCHEDULED NFL GAME: populate playerStatsMap from props
            if (apiLinesMap.size > 0) {
              const propPlayerIds = Array.from(apiLinesMap.keys());
              const existingPlayers = await db.query.players.findMany({
                where: inArray(playersTable.espnId, propPlayerIds),
              });
              const existingPlayerMap = new Map(existingPlayers.map(p => [p.espnId, p]));

              for (const playerId of propPlayerIds) {
                const existingPlayer = existingPlayerMap.get(playerId);
                const propInfo = propsPlayerInfoMap.get(playerId);
                if (existingPlayer) {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: existingPlayer.name,
                    team: existingPlayer.team || propInfo?.team || "Unknown",
                    position: existingPlayer.position || propInfo?.position || "N/A",
                    minutesPlayed: 0,
                    stats: {},
                  });
                } else if (propInfo) {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: propInfo.name,
                    team: propInfo.team,
                    position: propInfo.position,
                    minutesPlayed: 0,
                    stats: {},
                  });
                } else {
                  playerStatsMap.set(playerId, {
                    playerId,
                    playerName: `Player #${playerId.replace("nfl-", "")}`,
                    team: "Unknown",
                    position: "N/A",
                    minutesPlayed: 0,
                    stats: {},
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching NFL game data:", error);
      }
    }

    // Get player lines from database (now includes vendor)
    const lines = await db.query.playerLines.findMany({
      where: eq(playerLines.gameId, dbGame.id),
    });

    const linePlayerIds = [...new Set(lines.map((l) => l.playerId))];
    const dbPlayers = linePlayerIds.length > 0
      ? await db.query.players.findMany({
          where: (players, { inArray }) => inArray(players.id, linePlayerIds),
        })
      : [];

    // Build player monitoring data - show ALL players from box score + props
    const monitoringPlayers: MonitoringData["players"] = [];

    for (const [bdlPlayerId, playerData] of playerStatsMap) {
      // Find if this player has lines configured in DB
      const dbPlayer = dbPlayers.find((p) => p.espnId === bdlPlayerId);
      const dbLinesList = dbPlayer
        ? lines.filter((l) => l.playerId === dbPlayer.id)
        : [];

      // Get season averages for this player
      const playerSeasonAvgs = seasonAveragesMap.get(bdlPlayerId);

      // Get API lines for this player
      const apiPlayerLines = apiLinesMap.get(bdlPlayerId);

      // Build lines array
      const playerLinesResult: MonitoringData["players"][0]["lines"] = [];

      // Group DB lines by statType to build vendorLines
      const dbLinesByStatType = new Map<string, typeof dbLinesList>();
      for (const line of dbLinesList) {
        if (!dbLinesByStatType.has(line.statType)) {
          dbLinesByStatType.set(line.statType, []);
        }
        dbLinesByStatType.get(line.statType)!.push(line);
      }

      if (dbLinesByStatType.size > 0) {
        // Player has configured lines in DB - use those
        for (const [statType, statLines] of dbLinesByStatType) {
          // Build vendorLines from DB lines for this stat
          const vendorLines: VendorLine[] = statLines.map(l => ({
            vendor: l.vendor || "unknown",
            line: l.pregameLine,
          }));

          // Also merge in API lines not already in DB
          const apiStatLines = apiPlayerLines?.get(statType) || [];
          for (const apiLine of apiStatLines) {
            if (!vendorLines.some(vl => vl.vendor === apiLine.vendor)) {
              vendorLines.push(apiLine);
            }
          }

          const primaryLine = selectPrimaryLine(vendorLines);
          const currentValue = playerData.stats[statType] || 0;
          let edgeScore = 0;
          let mateoScore = 0;
          let pace = 0;

          if (currentValue > 0 && gameElapsedPercent > 0) {
            const minutesPlayed = playerData.minutesPlayed;
            const expectedMinutes = playerSeasonAvgs?.expectedMinutes;

            const result = calculateEdgeScore({
              currentValue,
              gameElapsedPercent,
              pregameLine: primaryLine,
              gamesPlayed: dbPlayer?.gamesPlayed || 10,
              historicalStddev: dbPlayer?.historicalStddev || 0,
              isRookie: dbPlayer?.isRookie || false,
              minutesPlayed,
              expectedMinutes,
              statType,
            });
            edgeScore = result.edgeScore;
            pace = result.pace;

            const mateoResult = calculateMateoScore({
              currentValue,
              pregameLine: primaryLine,
              gameElapsedPercent,
              minutesPlayed,
              expectedMinutes,
            });
            mateoScore = mateoResult.pacePercent;
          }

          // Get season average for this stat type
          const seasonAvg = playerSeasonAvgs
            ? (playerSeasonAvgs as Record<string, number>)[statType] ?? null
            : null;

          playerLinesResult.push({
            statType,
            pregameLine: primaryLine,
            vendorLines,
            currentValue,
            projectedPace: pace,
            edgeScore,
            mateoScore,
            seasonAverage: seasonAvg,
          });
        }
      } else if (apiPlayerLines && apiPlayerLines.size > 0) {
        // No DB lines but have API lines — use those
        for (const [statType, vendorLines] of apiPlayerLines) {
          const primaryLine = selectPrimaryLine(vendorLines);
          const currentValue = playerData.stats[statType] || 0;

          const seasonAvg = playerSeasonAvgs
            ? (playerSeasonAvgs as Record<string, number>)[statType] ?? null
            : null;

          let edgeScore = 0;
          let mateoScore = 0;
          let pace = 0;

          const minutesPlayed = playerData.minutesPlayed;
          const expectedMinutes = playerSeasonAvgs?.expectedMinutes;

          if (currentValue > 0 && primaryLine > 0 && gameElapsedPercent > 0) {
            const result = calculateEdgeScore({
              currentValue,
              gameElapsedPercent,
              pregameLine: primaryLine,
              gamesPlayed: 10,
              historicalStddev: 0,
              isRookie: false,
              minutesPlayed,
              expectedMinutes,
              statType,
            });
            edgeScore = result.edgeScore;
            pace = result.pace;

            const mateoResult = calculateMateoScore({
              currentValue,
              pregameLine: primaryLine,
              gameElapsedPercent,
              minutesPlayed,
              expectedMinutes,
            });
            mateoScore = mateoResult.pacePercent;
          } else if (currentValue > 0 && gameElapsedPercent > 0) {
            if (minutesPlayed && expectedMinutes && expectedMinutes > 0) {
              const progress = minutesPlayed / expectedMinutes;
              pace = progress > 0 ? currentValue / progress : 0;
            } else {
              pace = (currentValue / gameElapsedPercent) * 100;
            }
          }

          if (currentValue > 0 || primaryLine > 0) {
            playerLinesResult.push({
              statType,
              pregameLine: primaryLine,
              vendorLines,
              currentValue,
              projectedPace: pace,
              edgeScore,
              mateoScore,
              seasonAverage: seasonAvg,
            });
          }
        }
      } else {
        // No DB lines and no API lines — show raw stats (live/final games)
        for (const [statType, value] of Object.entries(playerData.stats)) {
          if (value <= 0) continue;

          const seasonAvg = playerSeasonAvgs
            ? (playerSeasonAvgs as Record<string, number>)[statType] ?? null
            : null;

          let pace = 0;
          const minutesPlayed = playerData.minutesPlayed;
          const expectedMinutes = playerSeasonAvgs?.expectedMinutes;

          if (value > 0 && gameElapsedPercent > 0) {
            if (minutesPlayed && expectedMinutes && expectedMinutes > 0) {
              const progress = minutesPlayed / expectedMinutes;
              pace = progress > 0 ? value / progress : 0;
            } else {
              pace = (value / gameElapsedPercent) * 100;
            }
          }

          playerLinesResult.push({
            statType,
            pregameLine: 0,
            vendorLines: [],
            currentValue: value,
            projectedPace: pace,
            edgeScore: 0,
            mateoScore: 0,
            seasonAverage: seasonAvg,
          });
        }
      }

      if (playerLinesResult.length > 0) {
        // Generate headshot URL for NBA players using the BDL player ID
        const imageUrl = dbGame.sport === "nba" ? getNBAHeadshotUrl(bdlPlayerId) : undefined;

        monitoringPlayers.push({
          id: dbPlayer?.id || bdlPlayerId,
          name: playerData.playerName,
          team: playerData.team,
          position: playerData.position,
          imageUrl,
          lines: playerLinesResult,
        });
      }
    }

    // Sort players: those with edges first, then by total stats, then by line count
    monitoringPlayers.sort((a, b) => {
      const aMaxEdge = Math.max(0, ...a.lines.map((l) => l.edgeScore));
      const bMaxEdge = Math.max(0, ...b.lines.map((l) => l.edgeScore));
      if (aMaxEdge !== bMaxEdge) return bMaxEdge - aMaxEdge;

      const aTotal = a.lines.reduce((sum, l) => sum + l.currentValue, 0);
      const bTotal = b.lines.reduce((sum, l) => sum + l.currentValue, 0);
      if (aTotal !== bTotal) return bTotal - aTotal;

      return b.lines.length - a.lines.length;
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
