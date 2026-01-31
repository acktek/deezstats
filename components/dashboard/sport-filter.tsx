"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Sport = "nba" | "nfl";

interface SportFilterProps {
  value: Sport | "all";
  onChange: (value: Sport | "all") => void;
}

const sports: { value: Sport | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "nba", label: "NBA" },
  { value: "nfl", label: "NFL" },
];

export function SportFilter({ value, onChange }: SportFilterProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Sport | "all")}>
      <TabsList>
        {sports.map((sport) => (
          <TabsTrigger key={sport.value} value={sport.value}>
            {sport.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
