"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function MetricsChart({
  data,
}: {
  data: { label: string; diamonds: number; hours: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3142" />
          <XAxis dataKey="label" stroke="#9aa3b5" fontSize={12} />
          <YAxis stroke="#9aa3b5" fontSize={12} />
          <Tooltip
            contentStyle={{
              background: "#161a23",
              border: "1px solid #2a3142",
              borderRadius: 12,
            }}
          />
          <Bar dataKey="diamonds" name="Diamantes" fill="#fe2c55" radius={[6, 6, 0, 0]} />
          <Bar dataKey="hours" name="Horas" fill="#25f4ee" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
