"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Volume2, VolumeX, X, TrendingUp } from "lucide-react";
import { cn, getEdgeClass, getEdgeLabel } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Alert {
  id: string;
  playerName: string;
  statType: string;
  edgeScore: number;
  message: string;
  createdAt: string;
}

interface AlertsPanelProps {
  alerts: Alert[];
  onDismiss?: (alertId: string) => void;
  className?: string;
}

const statLabels: Record<string, string> = {
  passing_yards: "Pass Yds",
  rushing_yards: "Rush Yds",
  receiving_yards: "Rec Yds",
  receptions: "Rec",
  touchdowns: "TDs",
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  three_pointers: "3PM",
  steals: "Steals",
  blocks: "Blocks",
};

export function AlertsPanel({ alerts, onDismiss, className }: AlertsPanelProps) {
  const { toast } = useToast();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element for notifications
  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3");
    audioRef.current.volume = 0.5;
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  // Handle new alerts
  useEffect(() => {
    const newAlerts = alerts.filter((a) => !seenAlertIds.has(a.id));

    if (newAlerts.length > 0) {
      // Mark as seen
      setSeenAlertIds((prev) => {
        const next = new Set(prev);
        newAlerts.forEach((a) => next.add(a.id));
        return next;
      });

      // Play sound for new alerts
      if (soundEnabled && audioRef.current) {
        audioRef.current.play().catch(() => {
          // Ignore autoplay errors
        });
      }

      // Show toast notifications
      if (notificationsEnabled) {
        for (const alert of newAlerts) {
          toast({
            title: `Edge Alert: ${alert.playerName}`,
            description: `${statLabels[alert.statType] || alert.statType} - Edge: ${alert.edgeScore.toFixed(1)}`,
            duration: 5000,
          });
        }
      }
    }
  }, [alerts, seenAlertIds, soundEnabled, notificationsEnabled, toast]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const sortedAlerts = [...alerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Card className={cn("card-leather", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Live Alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>

          {/* Notification Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch
                id="sound"
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
                className="scale-75"
              />
              <Label htmlFor="sound" className="text-xs cursor-pointer">
                {soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                id="notifications"
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
                className="scale-75"
              />
              <Label htmlFor="notifications" className="text-xs cursor-pointer">
                {notificationsEnabled ? (
                  <Bell className="h-3.5 w-3.5" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {sortedAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No alerts yet</p>
            <p className="text-xs mt-1">
              Alerts appear when edges cross threshold
            </p>
          </div>
        ) : (
          sortedAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface AlertItemProps {
  alert: Alert;
  onDismiss?: () => void;
}

function AlertItem({ alert, onDismiss }: AlertItemProps) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getEdgeIcon = (score: number) => {
    if (score >= 3.0) return "text-green-500";
    if (score >= 2.0) return "text-yellow-500";
    return "text-orange-500";
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        alert.edgeScore >= 3.0
          ? "bg-green-500/5 border-green-500/20"
          : alert.edgeScore >= 2.0
            ? "bg-yellow-500/5 border-yellow-500/20"
            : "bg-orange-500/5 border-orange-500/20"
      )}
    >
      {/* Edge Icon */}
      <div className="pt-0.5">
        <TrendingUp className={cn("h-4 w-4", getEdgeIcon(alert.edgeScore))} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{alert.playerName}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {statLabels[alert.statType] || alert.statType}
          </Badge>
          <Badge className={cn("text-xs", getEdgeClass(alert.edgeScore))}>
            {getEdgeLabel(alert.edgeScore)} ({alert.edgeScore.toFixed(1)})
          </Badge>
        </div>
        {alert.message && (
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
            {alert.message.replace(/^[^\n]+\n/, "")}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatTime(alert.createdAt)}
        </p>
      </div>

      {/* Dismiss Button */}
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
