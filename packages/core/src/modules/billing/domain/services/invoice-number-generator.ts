import { financialYear, toDateKey } from "../../../../shared/kernel/time";

export interface InvoiceNumberOptions {
  billingMode: "gst" | "non_gst";
  issueDateEpochMs: number;
  sequenceNumber: number;
  gstPrefix?: string;
  nonGstPrefix?: string;
}

export class InvoiceNumberGenerator {
  static format(options: InvoiceNumberOptions): string {
    const {
      billingMode,
      issueDateEpochMs,
      sequenceNumber,
      gstPrefix = "RSL",
      nonGstPrefix = "RSL/NON-GST",
    } = options;

    const dateKey = toDateKey(issueDateEpochMs);
    const fy = financialYear(dateKey);
    const seqStr = String(sequenceNumber).padStart(4, "0");

    if (billingMode === "gst") {
      return `${gstPrefix}/${fy}/${seqStr}`;
    } else {
      return `${nonGstPrefix}/${fy}/${seqStr}`;
    }
  }
}
