/**
 * RapidShift Address, Pincode, State, Country & Tax Validation Engine
 * Provides comprehensive validations for Indian & International addresses,
 * Pincodes/Postal codes, GSTIN matching state codes, and PAN structure.
 */

export interface IndianState {
  code: string; // 2-digit GST state code (e.g. "29")
  name: string; // State / UT name (e.g. "Karnataka")
  type: "state" | "ut";
}

export const INDIAN_STATES: IndianState[] = [
  { code: "01", name: "Jammu and Kashmir", type: "ut" },
  { code: "02", name: "Himachal Pradesh", type: "state" },
  { code: "03", name: "Punjab", type: "state" },
  { code: "04", name: "Chandigarh", type: "ut" },
  { code: "05", name: "Uttarakhand", type: "state" },
  { code: "06", name: "Haryana", type: "state" },
  { code: "07", name: "Delhi", type: "ut" },
  { code: "08", name: "Rajasthan", type: "state" },
  { code: "09", name: "Uttar Pradesh", type: "state" },
  { code: "10", name: "Bihar", type: "state" },
  { code: "11", name: "Sikkim", type: "state" },
  { code: "12", name: "Arunachal Pradesh", type: "state" },
  { code: "13", name: "Nagaland", type: "state" },
  { code: "14", name: "Manipur", type: "state" },
  { code: "15", name: "Mizoram", type: "state" },
  { code: "16", name: "Tripura", type: "state" },
  { code: "17", name: "Meghalaya", type: "state" },
  { code: "18", name: "Assam", type: "state" },
  { code: "19", name: "West Bengal", type: "state" },
  { code: "20", name: "Jharkhand", type: "state" },
  { code: "21", name: "Odisha", type: "state" },
  { code: "22", name: "Chhattisgarh", type: "state" },
  { code: "23", name: "Madhya Pradesh", type: "state" },
  { code: "24", name: "Gujarat", type: "state" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", type: "ut" },
  { code: "27", name: "Maharashtra", type: "state" },
  { code: "29", name: "Karnataka", type: "state" },
  { code: "30", name: "Goa", type: "state" },
  { code: "31", name: "Lakshadweep", type: "ut" },
  { code: "32", name: "Kerala", type: "state" },
  { code: "33", name: "Tamil Nadu", type: "state" },
  { code: "34", name: "Puducherry", type: "ut" },
  { code: "35", name: "Andaman and Nicobar Islands", type: "ut" },
  { code: "36", name: "Telangana", type: "state" },
  { code: "37", name: "Andhra Pradesh", type: "state" },
  { code: "38", name: "Ladakh", type: "ut" },
];

export interface SupportedCountry {
  code: string;
  name: string;
  currency: string;
}

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "JP", name: "Japan", currency: "JPY" },
];

export interface ValidationResult {
  isValid: boolean;
  valid: boolean;
  error?: string;
}

/**
 * Determines whether a country string denotes India.
 */
export function isIndiaCountry(country?: string | null): boolean {
  if (!country || country.trim().length === 0) return true;
  const norm = country.trim().toLowerCase();
  return (
    norm === "india" ||
    norm === "in" ||
    norm === "ind" ||
    norm === "bharat"
  );
}

/**
 * Validates Indian PIN code (6 digits, non-zero first digit) or international postal code.
 */
export function validatePincode(
  pincode: string | undefined | null,
  country: string = "India",
): ValidationResult {
  if (!pincode || pincode.trim().length === 0) {
    return { isValid: false, valid: false, error: "Pincode / Postal code is required." };
  }

  const clean = pincode.trim();
  const isIndia = isIndiaCountry(country);

  if (isIndia) {
    // 6 digits, first digit between 1 and 9
    const indianPincodeRegex = /^[1-9][0-9]{5}$/;
    if (!indianPincodeRegex.test(clean)) {
      return {
        isValid: false,
        valid: false,
        error: "Indian PIN code must be exactly 6 digits and cannot start with 0 (e.g. 560034).",
      };
    }
  } else {
    // International postal code: 3 to 10 alphanumeric chars/spaces/hyphens
    const intlPostalRegex = /^[A-Za-z0-9\s-]{3,10}$/;
    if (!intlPostalRegex.test(clean)) {
      return {
        isValid: false,
        valid: false,
        error: "Postal code must be 3-10 valid alphanumeric characters.",
      };
    }
  }

  return { isValid: true, valid: true };
}

/**
 * Validates GSTIN structure: 15 chars, format: 2 state digits + 10 PAN chars + 1 entity + 1 'Z' + 1 checksum.
 * Optionally verifies if the first 2 digits match the specified state.
 */
export function validateGstin(
  gstin: string | undefined | null,
  expectedStateNameOrCode?: string,
): ValidationResult {
  if (!gstin || gstin.trim().length === 0) {
    return { isValid: true, valid: true }; // GSTIN is optional for non-GST clients
  }

  const clean = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  if (!gstinRegex.test(clean)) {
    return {
      isValid: false,
      valid: false,
      error:
        "Invalid GSTIN format. Expected 15 characters (e.g. 29AAAAA0000A1Z5) with valid PAN and checksum.",
    };
  }

  if (expectedStateNameOrCode) {
    const stateCode = clean.slice(0, 2);
    const foundState = INDIAN_STATES.find(
      (s) =>
        s.code === expectedStateNameOrCode ||
        s.name.toLowerCase() === expectedStateNameOrCode.toLowerCase(),
    );

    if (foundState && foundState.code !== stateCode) {
      return {
        isValid: false,
        valid: false,
        error: `GSTIN state code '${stateCode}' does not match the selected state '${foundState.name}' (${foundState.code}).`,
      };
    }
  }

  return { isValid: true, valid: true };
}

/**
 * Validates PAN structure (10 chars: 5 uppercase letters + 4 digits + 1 uppercase letter).
 * Optionally verifies that it matches the PAN embedded in the GSTIN (chars 3 to 12).
 */
export function validatePan(
  pan: string | undefined | null,
  gstin?: string | null,
): ValidationResult {
  if (!pan || pan.trim().length === 0) {
    return { isValid: true, valid: true }; // PAN is optional if not supplied
  }

  const clean = pan.trim().toUpperCase();
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  if (!panRegex.test(clean)) {
    return {
      isValid: false,
      valid: false,
      error: "Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F).",
    };
  }

  if (gstin && gstin.trim().length >= 12) {
    const gstinPan = gstin.trim().toUpperCase().slice(2, 12);
    if (clean !== gstinPan) {
      return {
        isValid: false,
        valid: false,
        error: `PAN '${clean}' does not match the PAN '${gstinPan}' embedded in GSTIN.`,
      };
    }
  }

  return { isValid: true, valid: true };
}

/**
 * Finds Indian state object from state name or code.
 */
export function findIndianState(stateNameOrCode: string): IndianState | undefined {
  if (!stateNameOrCode) return undefined;
  const target = stateNameOrCode.trim().toLowerCase();
  return INDIAN_STATES.find(
    (s) => s.code === target || s.name.toLowerCase() === target,
  );
}

/**
 * Resolves State from GSTIN first 2 digits.
 */
export function getStateFromGstin(gstin: string): IndianState | undefined {
  if (!gstin || gstin.trim().length < 2) return undefined;
  const code = gstin.trim().slice(0, 2);
  return INDIAN_STATES.find((s) => s.code === code);
}

/**
 * Validates a complete address object.
 */
export function validateAddress(address: {
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): ValidationResult {
  if (address.addressLine1 && address.addressLine1.trim().length < 3) {
    return { isValid: false, valid: false, error: "Street address line 1 must be at least 3 characters." };
  }

  if (address.city && address.city.trim().length < 2) {
    return { isValid: false, valid: false, error: "City must be at least 2 characters." };
  }

  if (address.postalCode) {
    const pinCheck = validatePincode(address.postalCode, address.country || "India");
    if (!pinCheck.isValid) return pinCheck;
  }

  return { isValid: true, valid: true };
}
