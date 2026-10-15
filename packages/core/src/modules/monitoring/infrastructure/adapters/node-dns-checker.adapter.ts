import dns from "node:dns/promises";
import type {
  DnsCheckerPort,
  DnsCheckResult,
  DnsRecordsSnapshot,
  DnsDriftItem,
  ExpectedDnsRecords,
} from "../../domain/ports/dns-checker.port";

export class NodeDnsChecker implements DnsCheckerPort {
  async check(
    hostname: string,
    baseline?: ExpectedDnsRecords | null,
  ): Promise<DnsCheckResult> {
    const timestamp = Date.now();
    const cleanHostname = hostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/:[0-9]+$/, "")
      .replace(/\/.*$/, "");

    const handleDnsPromise = async <T>(
      promise: Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await promise;
      } catch (err: any) {
        // ENODATA or NODATA means domain exists but has no records of this type
        if (
          err?.code === "ENODATA" ||
          err?.code === "NODATA" ||
          err?.code === "ENOTFOUND_NORECORDS"
        ) {
          return fallback;
        }
        throw err;
      }
    };

    try {
      // Execute resolutions in parallel
      const [a, aaaa, cname, mx, txtChunks, ns] = await Promise.all([
        handleDnsPromise(dns.resolve4(cleanHostname), []),
        handleDnsPromise(dns.resolve6(cleanHostname), []),
        handleDnsPromise(dns.resolveCname(cleanHostname), []),
        handleDnsPromise(dns.resolveMx(cleanHostname), []),
        handleDnsPromise(dns.resolveTxt(cleanHostname), []),
        handleDnsPromise(dns.resolveNs(cleanHostname), []),
      ]);

      const txt = txtChunks.map((chunk) =>
        Array.isArray(chunk) ? chunk.join("") : String(chunk),
      );

      const records: DnsRecordsSnapshot = {
        a,
        aaaa,
        cname,
        mx,
        txt,
        ns,
      };

      // Check if ANY records were returned or if everything was empty
      const totalRecordCount =
        a.length +
        aaaa.length +
        cname.length +
        mx.length +
        txt.length +
        ns.length;

      let driftDetected = false;
      const drifts: DnsDriftItem[] = [];

      if (baseline) {
        const compareStringSets = (
          type: "A" | "AAAA" | "CNAME" | "TXT" | "NS",
          expected: string[] = [],
          actual: string[] = [],
        ) => {
          const expSet = new Set(
            expected.map((s) => s.toLowerCase().trim()).filter(Boolean),
          );
          const actSet = new Set(
            actual.map((s) => s.toLowerCase().trim()).filter(Boolean),
          );

          const added = [...actSet].filter((x) => !expSet.has(x));
          const removed = [...expSet].filter((x) => !actSet.has(x));

          if (added.length > 0 || removed.length > 0) {
            drifts.push({
              recordType: type,
              added,
              removed,
              description: `${type} records changed: +[${added.join(", ")}] -[${removed.join(", ")}]`,
            });
          }
        };

        if (baseline.a) {
          compareStringSets("A", baseline.a, records.a);
        }
        if (baseline.aaaa) {
          compareStringSets("AAAA", baseline.aaaa, records.aaaa);
        }
        if (baseline.cname) {
          const expCname = Array.isArray(baseline.cname)
            ? baseline.cname
            : [baseline.cname];
          compareStringSets("CNAME", expCname, records.cname);
        }
        if (baseline.txt) {
          compareStringSets("TXT", baseline.txt, records.txt);
        }
        if (baseline.ns) {
          compareStringSets("NS", baseline.ns, records.ns);
        }

        if (baseline.mx) {
          const normalizeMx = (
            item: { exchange: string; priority: number } | string,
          ) => {
            if (typeof item === "string") {
              return item.toLowerCase().trim();
            }
            return `${item.priority}:${item.exchange.toLowerCase().trim()}`;
          };

          const expMx = baseline.mx.map(normalizeMx);
          const actMx = records.mx.map(
            (m) => `${m.priority}:${m.exchange.toLowerCase().trim()}`,
          );

          const expSet = new Set(expMx);
          const actSet = new Set(actMx);

          const added = [...actSet].filter((x) => !expSet.has(x));
          const removed = [...expSet].filter((x) => !actSet.has(x));

          if (added.length > 0 || removed.length > 0) {
            drifts.push({
              recordType: "MX",
              added,
              removed,
              description: `MX records changed: +[${added.join(", ")}] -[${removed.join(", ")}]`,
            });
          }
        }

        driftDetected = drifts.length > 0;
      }

      return {
        hostname: cleanHostname,
        resolved: totalRecordCount > 0,
        records,
        driftDetected,
        drifts,
        timestamp,
      };
    } catch (err: any) {
      return {
        hostname: cleanHostname,
        resolved: false,
        records: {
          a: [],
          aaaa: [],
          cname: [],
          mx: [],
          txt: [],
          ns: [],
        },
        driftDetected: false,
        drifts: [],
        errorMessage: err?.message || "DNS resolution failed",
        timestamp,
      };
    }
  }
}
