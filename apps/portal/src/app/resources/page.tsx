import React from "react";
import type { Metadata } from "next";
import { ResourcesView } from "@/features/resources/resources-view";

export const metadata: Metadata = {
  title: "Engineering Resources & Master Runbooks | RapidShift Labs",
  description:
    "Comprehensive operational runbooks, in-place embed masterclass, API guides, and system manuals for RapidShift Control Panel administrators and clients.",
};

export default function ResourcesPage() {
  return <ResourcesView />;
}
