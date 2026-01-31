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
} from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold">How DeezStats Works</h1>
        <p className="text-muted-foreground">
          Understanding the edge detection algorithm and the market inefficiency it exploits.
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

      {/* The Algorithm */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Calculator className="h-5 w-5 text-primary" />
            The Edge Score Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 p-4 rounded-lg border border-border font-mono text-sm mb-6">
            <p className="text-primary font-semibold">
              EDGE_SCORE = (PACE_RATIO x DATA_SCARCITY x GAME_TIMING) - VARIANCE_PENALTY
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
              <code className="bg-muted px-2 py-1 rounded text-xs">
                PACE_RATIO = (current_stats / game_elapsed%) / pregame_line
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
                GAME_TIMING = 1 - (game_elapsed% x 0.5)
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

      {/* Alert Thresholds */}
      <Card className="card-leather">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <AlertTriangle className="h-5 w-5 text-whiskey-500" />
            Alert Thresholds
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
              <li><strong>ESPN API</strong> provides real-time stats</li>
              <li><strong>Pregame lines</strong> entered manually before games</li>
              <li><strong>Edge calculation</strong> runs on every update</li>
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
