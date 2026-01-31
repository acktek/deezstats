import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calculator,
  TrendingUp,
  Clock,
  BarChart3,
  AlertTriangle,
  Zap,
  Database,
  RefreshCw,
  Timer,
} from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold">How DeezStats Works</h1>
        <p className="text-muted-foreground">
          Understanding the edge detection algorithms and market inefficiencies they exploit.
        </p>
      </div>

      {/* The Core Insight */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Zap className="h-5 w-5 text-gold-500" />
            The Core Insight
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Sportsbooks set live player prop lines by anchoring to historical
            data. For players with <strong>limited sample sizes</strong>{" "}
            (rookies, role players, early in the season), their live
            adjustments lag behind reality.
          </p>
          <p className="text-muted-foreground">
            When a player with few games on record starts a game hot, the
            sportsbook&apos;s live line adjustment is based on their small
            sample of historical performance&mdash;not their current
            trajectory. This creates a window of opportunity.
          </p>
          <div className="bg-muted/50 p-4 rounded-lg border border-border">
            <p className="font-semibold text-forest-600 dark:text-forest-400 mb-2">
              Example:
            </p>
            <p className="text-sm text-muted-foreground">
              A rookie WR has a pregame line of 45.5 receiving yards (based on
              just 3 career games). 20 minutes into the game, he has 38 yards.
              He&apos;s on pace for 95+ yards, but the live line has only
              moved to 52.5 because the book is anchored to his limited
              history.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Minutes-Based Accuracy */}
      <Card className="card-leather border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Timer className="h-5 w-5 text-primary" />
            Minutes-Based Pace (Key Innovation)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Traditional pace calculations use <strong>game elapsed time</strong>,
            which can cause false positives. DeezStats uses{" "}
            <strong>actual minutes played</strong> for more accurate projections.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="font-semibold text-red-600 dark:text-red-400 mb-2">
                ❌ Old Way (Game Elapsed)
              </p>
              <p className="text-sm text-muted-foreground">
                Player has 15 pts at halftime (50% elapsed) → Projects 30 pts
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Problem: Player already played 28 of their expected 34 minutes!
              </p>
            </div>

            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="font-semibold text-green-600 dark:text-green-400 mb-2">
                ✓ DeezStats (Minutes Played)
              </p>
              <p className="text-sm text-muted-foreground">
                Player has 15 pts with 28/34 min played (82%) → Projects 18 pts
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Accounts for actual playing time, not just game clock.
              </p>
            </div>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg border border-border">
            <p className="text-sm font-medium mb-2">This prevents false positives when:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Starters are benched in blowouts</li>
              <li>Player is in foul trouble</li>
              <li>Player has already exceeded their usual minutes</li>
              <li>Rotation changes mid-game</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* The Edge Algorithm */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Calculator className="h-5 w-5 text-primary" />
            Edge Score Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 p-4 rounded-lg border border-border font-mono text-sm mb-6">
            <p className="text-primary font-semibold">
              EDGE = (PACE_RATIO × DATA_SCARCITY × GAME_TIMING) - VARIANCE_PENALTY
            </p>
          </div>

          <div className="space-y-6">
            <div className="gold-accent">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-gold-500" />
                Pace Ratio
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Measures how far ahead of the pregame line the player is tracking.
              </p>
              <code className="bg-muted px-2 py-1 rounded text-xs block">
                player_progress = minutes_played / expected_minutes
              </code>
              <code className="bg-muted px-2 py-1 rounded text-xs block mt-1">
                PACE_RATIO = (current_stats / player_progress) / pregame_line
              </code>
            </div>

            <div className="gold-accent">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-gold-500" />
                Data Scarcity
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Amplifies the signal for players with limited game history. Rookies get a 20% bonus.
              </p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                DATA_SCARCITY = 1 + (1 / sqrt(games_played + 1))
              </code>
            </div>

            <div className="gold-accent">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-gold-500" />
                Game Timing
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Early-game edges are more valuable. Decays from 1.0 to 0.5 as game progresses.
              </p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                GAME_TIMING = 1 - (game_elapsed% × 0.5)
              </code>
            </div>

            <div className="gold-accent">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-gold-500" />
                Variance Penalty
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Reduces confidence for historically inconsistent players.
              </p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                VARIANCE_PENALTY = historical_stddev / pregame_line
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mateo Algorithm */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <TrendingUp className="h-5 w-5 text-whiskey-500" />
            Mateo Score Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            A simplified pace-based approach that shows how far ahead or behind a player is.
          </p>

          <div className="bg-muted/30 p-4 rounded-lg border border-border font-mono text-sm mb-6">
            <p className="text-whiskey-600 dark:text-whiskey-400 font-semibold">
              % TARGET = current_stat / betting_line
            </p>
            <p className="text-whiskey-600 dark:text-whiskey-400 font-semibold mt-1">
              MATEO = % TARGET / (minutes_played / expected_minutes)
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="destructive" className="text-xs">{"< 0.9"}</Badge>
                <span className="font-medium text-sm">Behind</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Unlikely to hit the line at current pace.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">0.9 - 1.1</Badge>
                <span className="font-medium text-sm">On Target</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tracking close to the line.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="forest" className="text-xs">1.1 - 1.5</Badge>
                <span className="font-medium text-sm">Ahead</span>
              </div>
              <p className="text-xs text-muted-foreground">
                On pace to exceed the line.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-gold-500/10 border border-gold-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="gold" className="text-xs">{"> 1.5"}</Badge>
                <span className="font-medium text-sm">Way Ahead</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Significantly exceeding expectations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edge Alert Thresholds */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <AlertTriangle className="h-5 w-5 text-whiskey-500" />
            Edge Alert Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">{"< 1.5"}</Badge>
                <span className="font-medium text-sm">No Edge</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Performing at or below expectations.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-whiskey-100/50 dark:bg-whiskey-900/20 border border-whiskey-200 dark:border-whiskey-800">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="whiskey" className="text-xs">1.5 - 2.0</Badge>
                <span className="font-medium text-sm">Monitor</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Potential edge developing.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-forest-100/50 dark:bg-forest-900/20 border border-forest-200 dark:border-forest-800">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="forest" className="text-xs">2.0 - 3.0</Badge>
                <span className="font-medium text-sm">Good</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Solid edge detected.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-gold-100/50 dark:bg-gold-900/20 border border-gold-200 dark:border-gold-800">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="gold" className="text-xs">{"> 3.0"}</Badge>
                <span className="font-medium text-sm">Strong</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Act fast - books will adjust.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Architecture */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <RefreshCw className="h-5 w-5 text-primary" />
            System Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-2">Data Flow</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li><strong>BallDontLie API</strong> provides real-time stats + player props</li>
              <li><strong>Minutes tracking</strong> from live box scores</li>
              <li><strong>Season averages</strong> for expected minutes per player</li>
              <li><strong>Edge + Mateo calculations</strong> run every 10 seconds</li>
              <li><strong>Alerts</strong> trigger when thresholds crossed</li>
            </ol>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium mb-2">Football</p>
              <p className="text-xs text-muted-foreground">
                Receiving/Rushing Yards, Receptions, Passing Yards, TDs
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Basketball</p>
              <p className="text-xs text-muted-foreground">
                Points, Rebounds, Assists, 3PM, Steals, Blocks
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="card-leather border-whiskey-400/50">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Disclaimer:</strong> DeezStats is for educational purposes.
            Gamble responsibly. Past performance does not guarantee future results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
