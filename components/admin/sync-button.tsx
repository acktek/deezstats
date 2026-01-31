"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Check, Clock, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface CronJob {
  jobId: number;
  title: string;
  enabled: boolean;
  url: string;
}

export function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [, setCronJobs] = useState<CronJob[]>([]);
  const [cronStatus, setCronStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    checkCronStatus();
  }, []);

  const checkCronStatus = async () => {
    try {
      const response = await fetch("/api/admin/setup-cron");
      if (response.ok) {
        const data = await response.json();
        setCronJobs(data.jobs || []);
        const hasActiveCron = data.jobs?.some(
          (job: CronJob) => job.enabled && job.url?.includes("sync-espn")
        );
        setCronStatus(hasActiveCron ? "active" : "inactive");
      } else {
        setCronStatus("inactive");
      }
    } catch {
      setCronStatus("inactive");
    }
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/cron/sync");
      const data = await response.json();

      if (response.ok) {
        setLastSync(new Date());
        toast({
          title: "Sync Complete",
          description: `${data.gamesUpdated} games, ${data.playersUpdated} players, ${data.propsUpdated} props`,
        });
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Sync Failed",
        description: "Could not connect to sync endpoint",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const setupCron = async () => {
    setIsSettingUp(true);
    try {
      const response = await fetch("/api/admin/setup-cron", {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Cron Job Created",
          description: data.message,
        });
        setCronStatus("active");
        checkCronStatus();
      } else {
        toast({
          title: "Setup Failed",
          description: data.error || "Could not create cron job",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Setup Failed",
        description: "Could not connect to cron-job.org",
        variant: "destructive",
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <Card className="card-leather">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Auto Sync:</span>
              {cronStatus === "loading" ? (
                <Badge variant="secondary">Checking...</Badge>
              ) : cronStatus === "active" ? (
                <Badge variant="forest">Active (every 5 min)</Badge>
              ) : (
                <Badge variant="whiskey">Inactive</Badge>
              )}
            </div>
            {lastSync && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-forest-500" />
                {lastSync.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {cronStatus === "inactive" && (
              <Button
                onClick={setupCron}
                disabled={isSettingUp}
                variant="outline"
                size="sm"
              >
                {isSettingUp ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Enable Auto Sync
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={triggerSync}
              disabled={isSyncing}
              variant="gold"
              size="sm"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
