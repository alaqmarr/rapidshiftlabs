import { IosPageLoader } from "@/components/ui/ios-spinner";

export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <IosPageLoader message="Loading RapidShift Control Panel..." subtext="Syncing workspace state" />
    </div>
  );
}
