import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  real,
  boolean,
  primaryKey,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const sportEnum = pgEnum("sport", ["nfl", "nba", "ncaab", "ncaaf"]);
export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "in_progress",
  "final",
  "postponed",
]);
export const alertStatusEnum = pgEnum("alert_status", [
  "active",
  "expired",
  "hit",
  "missed",
]);
export const statTypeEnum = pgEnum("stat_type", [
  // Football
  "receiving_yards",
  "rushing_yards",
  "receptions",
  "passing_yards",
  "touchdowns",
  // Basketball
  "points",
  "rebounds",
  "assists",
  "three_pointers",
  "steals",
  "blocks",
]);

// ==================== AUTH TABLES ====================

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  role: userRoleEnum("role").default("user").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastLogin: timestamp("last_login", { mode: "date" }),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ==================== PLAYER DATA ====================

export const players = pgTable("players", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  espnId: varchar("espn_id", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  team: varchar("team", { length: 100 }),
  position: varchar("position", { length: 50 }),
  sport: sportEnum("sport").notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  seasonAvg: real("season_avg"),
  historicalStddev: real("historical_stddev"),
  isRookie: boolean("is_rookie").default(false).notNull(),
  imageUrl: text("image_url"),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ==================== GAME TRACKING ====================

export const games = pgTable("games", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  espnId: varchar("espn_id", { length: 50 }).notNull().unique(),
  sport: sportEnum("sport").notNull(),
  homeTeam: varchar("home_team", { length: 100 }).notNull(),
  homeTeamLogo: text("home_team_logo"),
  homeScore: integer("home_score").default(0),
  awayTeam: varchar("away_team", { length: 100 }).notNull(),
  awayTeamLogo: text("away_team_logo"),
  awayScore: integer("away_score").default(0),
  status: gameStatusEnum("status").default("scheduled").notNull(),
  period: integer("period").default(0),
  timeRemaining: varchar("time_remaining", { length: 20 }),
  gameElapsedPercent: real("game_elapsed_percent").default(0),
  startedAt: timestamp("started_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ==================== PLAYER LINES ====================

export const playerLines = pgTable("player_lines", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  statType: statTypeEnum("stat_type").notNull(),
  pregameLine: real("pregame_line").notNull(),
  currentLine: real("current_line"),
  vendor: varchar("vendor", { length: 50 }).notNull().default("unknown"),
  source: varchar("source", { length: 100 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("player_lines_player_game_stat_vendor_idx").on(
    table.playerId,
    table.gameId,
    table.statType,
    table.vendor
  ),
]);

// ==================== LIVE STATS ====================

export const liveStats = pgTable("live_stats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  statType: statTypeEnum("stat_type").notNull(),
  currentValue: real("current_value").notNull(),
  pace: real("pace"),
  edgeScore: real("edge_score"),
  capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
});

// ==================== ALERTS ====================

export const alerts = pgTable("alerts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  statType: statTypeEnum("stat_type").notNull(),
  edgeScore: real("edge_score").notNull(),
  message: text("message"),
  status: alertStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
});

// ==================== WATCHLIST ====================

export const watchlist = pgTable(
  "watchlist",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    customThreshold: real("custom_threshold"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (watchlist) => [
    primaryKey({ columns: [watchlist.userId, watchlist.playerId] }),
  ]
);

// ==================== AUDIT LOG ====================

export const auditLog = pgTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  watchlist: many(watchlist),
  auditLogs: many(auditLog),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const playersRelations = relations(players, ({ many }) => ({
  lines: many(playerLines),
  liveStats: many(liveStats),
  alerts: many(alerts),
  watchers: many(watchlist),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  lines: many(playerLines),
  liveStats: many(liveStats),
  alerts: many(alerts),
}));

export const playerLinesRelations = relations(playerLines, ({ one }) => ({
  player: one(players, {
    fields: [playerLines.playerId],
    references: [players.id],
  }),
  game: one(games, {
    fields: [playerLines.gameId],
    references: [games.id],
  }),
}));

export const liveStatsRelations = relations(liveStats, ({ one }) => ({
  player: one(players, {
    fields: [liveStats.playerId],
    references: [players.id],
  }),
  game: one(games, {
    fields: [liveStats.gameId],
    references: [games.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  player: one(players, {
    fields: [alerts.playerId],
    references: [players.id],
  }),
  game: one(games, {
    fields: [alerts.gameId],
    references: [games.id],
  }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(users, {
    fields: [watchlist.userId],
    references: [users.id],
  }),
  player: one(players, {
    fields: [watchlist.playerId],
    references: [players.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type PlayerLine = typeof playerLines.$inferSelect;
export type NewPlayerLine = typeof playerLines.$inferInsert;
export type LiveStat = typeof liveStats.$inferSelect;
export type NewLiveStat = typeof liveStats.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
