import { IosPageLoader } from "@/components/ui/ios-spinner";

export default function PortalLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[500px]">
      <IosPageLoader message="Loading Client Portal..." subtext="Syncing your projects, releases, and services" />
    </div>
  );
}
