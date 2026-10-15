export interface CompanySettings {
  legalName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  state?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  upiId?: string;
  swiftBic?: string;
  iban?: string;
  lutNumber?: string;
  phone?: string;
  email?: string;
}

export interface EmailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface NumberingSettings {
  gstPrefix: string; // e.g. "RSL"
  nonGstPrefix: string; // e.g. "RSL/NON-GST"
  nextGstSequence: number; // e.g. 1
  nextNonGstSequence: number; // e.g. 1
}

export interface DunningSettings {
  enabled: boolean;
  reminderDays: number[]; // e.g. [-7, -3, 0, 3]
}

export interface GitHubSettings {
  token: string;
  defaultBranch?: string; // e.g. "main"
  configuredAt?: number;
  lastTestedAt?: number;
  lastTestStatus?: "ok" | "error";
  lastTestMessage?: string;
  rateLimitRemaining?: number;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
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
  swiftBic: "HDFCINBBXXX",
  iban: "",
  lutNumber: "",
  phone: "+91 98765 43210",
  email: "billing@rapidshiftlabs.com",
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  fromName: "RapidShift Labs Billing",
  fromEmail: "billing@rapidshiftlabs.com",
};

export const DEFAULT_NUMBERING_SETTINGS: NumberingSettings = {
  gstPrefix: "RSL",
  nonGstPrefix: "RSL/NON-GST",
  nextGstSequence: 1,
  nextNonGstSequence: 1,
};

export const DEFAULT_DUNNING_SETTINGS: DunningSettings = {
  enabled: true,
  reminderDays: [-7, -3, 0, 3],
};

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  token: "",
  defaultBranch: "main",
};
