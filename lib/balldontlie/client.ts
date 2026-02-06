// BALLDONTLIE API Client
// Docs: https://docs.balldontlie.io

const API_BASE = "https://api.balldontlie.io/v1";
const API_BASE_V2 = "https://api.balldontlie.io/v2";
const API_BASE_ROOT = "https://api.balldontlie.io"; // For /nba/v1/ and /nfl/v1/ endpoints

export type Sport = "nba" | "nfl";

export interface BDLGame {
  id: number;
  date: string;
  season: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  home_team: BDLTeam;
  home_team_score: number;
  visitor_team: BDLTeam;
  visitor_team_score: number;
}

export interface BDLTeam {
  id: number;
  conference: string;
  division: string;
  city: string;
  name: string;
  full_name: string;
  abbreviation: string;
}

export interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height: string;
  weight: string;
  jersey_number: string;
  college: string;
  country: string;
  draft_year: number;
  draft_round: number;
  draft_number: number;
  team: BDLTeam;
}

export interface BDLPlayerStats {
  id: number;
  min: string;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  pf: number;
  pts: number;
  player: BDLPlayer;
  team: BDLTeam;
  game: BDLGame;
}

export interface BDLNFLPlayerStats {
  id: number;
  player: BDLNFLPlayer;
  game: BDLNFLGame;
  team: BDLNFLTeam;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  receiving_yards: number;
  receiving_tds: number;
  targets: number;
  fumbles: number;
}

export interface BDLNFLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_abbreviation: string;
  height: string;
  weight: number;
  jersey_number: string;
  college: string;
  experience: string;
  age: number;
  team: BDLNFLTeam;
}

export interface BDLNFLTeam {
  id: number;
  conference: string;
  division: string;
  location: string;
  name: string;
  full_name: string;
  abbreviation: string;
}

export interface BDLNFLGame {
  id: number;
  date: string;
  season: number;
  week: number;
  status: string;
  quarter: number;
  time: string;
  home_team: BDLNFLTeam;
  home_team_score: number;
  visitor_team: BDLNFLTeam;
  visitor_team_score: number;
  venue: string;
}

export interface BDLPlayerProp {
  id: number;
  game?: BDLGame | BDLNFLGame;
  game_id?: number;
  player?: BDLPlayer | BDLNFLPlayer;
  player_id?: number;
  prop_type: string;
  line?: number;
  line_value?: string;
  over_odds?: number;
  under_odds?: number;
  market?: { type: string; over_odds?: number; under_odds?: number; odds?: number };
  vendor: string;
}

/**
 * Extract the line value from a BDL prop response.
 * Handles both V1 (line: number) and V2 (line_value: string) formats.
 */
export function extractPropLine(prop: BDLPlayerProp): number {
  if (prop.line_value !== undefined) {
    const parsed = parseFloat(prop.line_value);
    if (!isNaN(parsed)) return parsed;
  }
  if (prop.line !== undefined) return prop.line;
  return 0;
}

/**
 * Extract the player ID from a BDL prop response.
 * Handles both V1 (player.id) and V2 (player_id) formats.
 */
export function extractPropPlayerId(prop: BDLPlayerProp): number {
  if (prop.player_id !== undefined) return prop.player_id;
  if (prop.player?.id !== undefined) return prop.player.id;
  return 0;
}

export interface BDLSeasonAverage {
  player_id: number;
  season: number;
  games_played: number;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fg_pct: number;
  fg3_pct: number;
  ft_pct: number;
  turnover: number;
}

export interface BDLNFLSeasonStats {
  player: BDLNFLPlayer;
  season: number;
  games_played: number;
  passing_yards: number;
  passing_tds: number;
  rushing_yards: number;
  rushing_tds: number;
  receiving_yards: number;
  receiving_tds: number;
  receptions: number;
}

export interface BDLNBAAdvancedStats {
  player_id: number;
  game_id: number;
  min: string;
  usage_percentage: number;
  pace: number;
  offensive_rating: number;
  defensive_rating: number;
  net_rating: number;
  assist_percentage: number;
  rebound_percentage: number;
  effective_field_goal_percentage: number;
  true_shooting_percentage: number;
  turnover_percentage: number;
}

interface APIResponse<T> {
  data: T[];
  meta?: {
    next_cursor?: number;
    per_page?: number;
  };
}

export class BallDontLieClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.BALLDONTLIE_API_KEY || "";
  }

  private async fetch<T>(endpoint: string, params?: Record<string, unknown>, noCache?: boolean): Promise<T> {
    return this.fetchFromBase<T>(API_BASE, endpoint, params, noCache);
  }

  private async fetchV2<T>(endpoint: string, params?: Record<string, unknown>, noCache?: boolean): Promise<T> {
    return this.fetchFromBase<T>(API_BASE_V2, endpoint, params, noCache);
  }

  private async fetchNFL<T>(endpoint: string, params?: Record<string, unknown>, noCache?: boolean): Promise<T> {
    return this.fetchFromBase<T>(API_BASE_ROOT, endpoint, params, noCache);
  }

  private async fetchFromBase<T>(base: string, endpoint: string, params?: Record<string, unknown>, noCache?: boolean): Promise<T> {
    if (!this.apiKey) {
      throw new Error("BALLDONTLIE_API_KEY not configured");
    }

    const url = new URL(`${base}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(`${key}[]`, String(v)));
        } else if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: this.apiKey,
      },
      cache: noCache ? "no-store" : undefined,
      next: noCache ? undefined : { revalidate: 30 },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BallDontLie API error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // ============ NBA Endpoints ============

  async getNBAGames(params?: {
    dates?: string[];
    seasons?: number[];
    team_ids?: number[];
    cursor?: number;
    per_page?: number;
  }, noCache?: boolean): Promise<APIResponse<BDLGame>> {
    return this.fetch<APIResponse<BDLGame>>("/games", params, noCache);
  }

  async getNBAGameBoxScore(gameId: number): Promise<{
    data: {
      game: BDLGame;
      home_team: { players: BDLPlayerStats[] };
      visitor_team: { players: BDLPlayerStats[] };
    };
  }> {
    // Fetch all live box scores and find the one for this game
    const liveBoxScores = await this.getNBALiveBoxScores();
    const boxScore = liveBoxScores.data.find((bs: any) => bs.game?.id === gameId);
    if (boxScore) {
      return { data: boxScore };
    }
    // Fallback: try fetching by date
    throw new Error(`Box score not found for game ${gameId}`);
  }

  async getNBALiveBoxScores(): Promise<{ data: any[] }> {
    return this.fetchNBA<{ data: any[] }>("/nba/v1/box_scores/live");
  }

  async getNBABoxScoresByDate(date: string): Promise<{ data: any[] }> {
    return this.fetchNBA<{ data: any[] }>("/nba/v1/box_scores", { date });
  }

  private async fetchNBA<T>(endpoint: string, params?: Record<string, unknown>, noCache?: boolean): Promise<T> {
    return this.fetchFromBase<T>(API_BASE_ROOT, endpoint, params, noCache); // Same base as NFL (no /v1 suffix)
  }

  async getNBAStats(params?: {
    game_ids?: number[];
    player_ids?: number[];
    seasons?: number[];
    dates?: string[];
    cursor?: number;
    per_page?: number;
  }, noCache?: boolean): Promise<APIResponse<BDLPlayerStats>> {
    return this.fetch<APIResponse<BDLPlayerStats>>("/stats", params, noCache);
  }

  async getNBASeasonAverages(params: {
    season: number;
    player_id: number;
  }): Promise<APIResponse<BDLSeasonAverage>> {
    return this.fetch<APIResponse<BDLSeasonAverage>>("/season_averages", params);
  }

  async getNBAPlayerProps(params: {
    game_id: number;
    player_id?: number;
    vendors?: string[];
    prop_types?: string[];
  }): Promise<APIResponse<BDLPlayerProp>> {
    return this.fetchV2<APIResponse<BDLPlayerProp>>("/odds/player_props", params);
  }

  async getNBAPlayers(params?: {
    search?: string;
    player_ids?: number[];
    team_ids?: number[];
    cursor?: number;
    per_page?: number;
  }): Promise<APIResponse<BDLPlayer>> {
    return this.fetch<APIResponse<BDLPlayer>>("/players", params);
  }

  async getNBAAdvancedStats(params?: {
    game_ids?: number[];
    player_ids?: number[];
    per_page?: number;
  }): Promise<APIResponse<BDLNBAAdvancedStats>> {
    return this.fetchNBA<APIResponse<BDLNBAAdvancedStats>>("/nba/v1/stats/advanced", params, true);
  }

  // ============ NFL Endpoints ============

  async getNFLGames(params?: {
    dates?: string[];
    seasons?: number[];
    weeks?: number[];
    team_ids?: number[];
    cursor?: number;
    per_page?: number;
  }): Promise<APIResponse<BDLNFLGame>> {
    return this.fetchNFL<APIResponse<BDLNFLGame>>("/nfl/v1/games", params);
  }

  async getNFLStats(params?: {
    game_ids?: number[];
    player_ids?: number[];
    seasons?: number[];
    cursor?: number;
    per_page?: number;
  }): Promise<APIResponse<BDLNFLPlayerStats>> {
    return this.fetchNFL<APIResponse<BDLNFLPlayerStats>>("/nfl/v1/stats", params);
  }

  async getNFLSeasonStats(params: {
    season: number;
    player_ids?: number[];
    postseason?: boolean;
  }): Promise<APIResponse<BDLNFLSeasonStats>> {
    return this.fetchNFL<APIResponse<BDLNFLSeasonStats>>("/nfl/v1/season_stats", params);
  }

  async getNFLPlayerProps(params: {
    game_ids?: number[];
    player_ids?: number[];
    vendors?: string[];
    prop_types?: string[];
  }): Promise<APIResponse<BDLPlayerProp>> {
    return this.fetchNFL<APIResponse<BDLPlayerProp>>("/nfl/v1/player_props", params);
  }

  async getNFLPlayers(params?: {
    search?: string;
    player_ids?: number[];
    team_ids?: number[];
    cursor?: number;
    per_page?: number;
  }): Promise<APIResponse<BDLNFLPlayer>> {
    return this.fetchNFL<APIResponse<BDLNFLPlayer>>("/nfl/v1/players", params);
  }
}

export const bdlClient = new BallDontLieClient();
