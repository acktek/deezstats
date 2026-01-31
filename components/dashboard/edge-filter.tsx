"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EdgeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

const thresholds = [
  { value: "0", label: "All Players" },
  { value: "1.5", label: "Monitor+ (1.5+)" },
  { value: "2.0", label: "Good+ (2.0+)" },
  { value: "3.0", label: "Strong Only (3.0+)" },
];

export function EdgeFilter({ value, onChange }: EdgeFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Edge threshold" />
      </SelectTrigger>
      <SelectContent>
        {thresholds.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
