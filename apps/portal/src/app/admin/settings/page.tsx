import { getContainer } from "@rsl/core/container";
import { SettingsManager, type SettingsData } from "@/features/settings/settings-manager";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const container = getContainer();

  let initialSettings: SettingsData = {
    company: {
      legalName: "RapidShift Labs Private Limited",
      tradeName: "RapidShift Labs",
      gstin: "",
      pan: "",
      state: "Karnataka",
      addressLine1: "123 Innovation Hub",
      addressLine2: "Koramangala 4th Block",
      city: "Bengaluru",
      postalCode: "560034",
      country: "India",
      bankName: "HDFC Bank",
      accountNumber: "",
      ifsc: "",
      branch: "Bengaluru",
      upiId: "rapidshift@hdfcbank",
      phone: "+91 98765 43210",
      email: "billing@rapidshiftlabs.com",
    },
    email: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "",
      pass: "",
      fromName: "RapidShift Labs Billing",
      fromEmail: "billing@rapidshiftlabs.com",
    },
    numbering: {
      gstPrefix: "RSL",
      nonGstPrefix: "RSL/NON-GST",
      nextGstSequence: 1,
      nextNonGstSequence: 1,
    },
    github: {
      token: "",
      defaultBranch: "main",
      hasToken: false,
    },
  };

  try {
    const settings = await container.settingsModule.getSettingsUseCase.execute();
    if (settings) {
      initialSettings = {
        company: { ...initialSettings.company, ...(settings.company || {}) },
        email: { ...initialSettings.email, ...(settings.email || {}) },
        numbering: { ...initialSettings.numbering, ...(settings.numbering || {}) },
        github: { ...initialSettings.github, ...(settings.github || {}) },
      };
    }
  } catch (err) {
    console.error("[AdminSettingsPage] Server fetch error:", err);
  }

  return <SettingsManager initialSettings={initialSettings} />;
}
