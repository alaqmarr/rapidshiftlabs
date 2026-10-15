import { IosPageLoader } from "@/components/ui/ios-spinner";

export default function AdminLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[500px]">
      <IosPageLoader message="Loading Admin Console..." subtext="Retrieving real-time fleet, contracts, and telemetry" />
    </div>
  );
}
