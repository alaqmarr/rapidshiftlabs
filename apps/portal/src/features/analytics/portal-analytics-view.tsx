"use client";

import {
  AnalyticsSuiteDashboard,
  type AnalyticsData,
} from "./admin-analytics-view";

interface PortalAnalyticsViewProps {
  clientId: string;
  clientName: string;
  initialData: AnalyticsData;
  offloadConfig?: {
    endpointUrl?: string;
    secret?: string;
    enabled?: boolean;
  } | null;
}

export function PortalAnalyticsView({
  clientId,
  clientName,
  initialData,
  offloadConfig,
}: PortalAnalyticsViewProps) {
  return (
    <AnalyticsSuiteDashboard
      mode="portal"
      clientId={clientId}
      clientName={clientName}
      initialData={initialData}
      offloadConfig={offloadConfig}
    />
  );
}
