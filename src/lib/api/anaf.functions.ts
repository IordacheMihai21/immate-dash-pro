import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeCui } from "@/lib/cuiUtils";

// Public ANAF web service — no API key required. Docs:
// https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
// Rate-limited by ANAF to ~1 request/second per caller; fine for interactive
// single-CUI lookups from the registration form.
const ANAF_TVA_ENDPOINT = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

interface AnafDateGenerale {
  denumire: string;
  adresa: string;
  nrRegCom: string;
  telefon: string;
  statusRO_e_Factura?: boolean;
}

interface AnafFoundEntry {
  date_generale: AnafDateGenerale;
  inregistrare_scop_Tva?: { scpTVA?: boolean };
}

interface AnafResponse {
  found?: AnafFoundEntry[];
  notFound?: number[];
}

export const verifyCuiWithAnaf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cui: z.string().min(1) }))
  .handler(async ({ data }) => {
    const numericCui = normalizeCui(data.cui);

    if (!numericCui) {
      throw new Error("CUI invalid. Introdu doar cifrele (fara prefixul RO).");
    }

    const today = new Date().toISOString().slice(0, 10);

    let response: Response;

    try {
      response = await fetch(ANAF_TVA_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ cui: Number(numericCui), data: today }]),
      });
    } catch {
      throw new Error("Serviciul ANAF nu a putut fi contactat. Incearca din nou.");
    }

    if (!response.ok) {
      throw new Error("Serviciul ANAF nu a putut fi contactat. Incearca din nou.");
    }

    const payload = (await response.json()) as AnafResponse;
    const match = payload.found?.[0];

    if (!match) {
      throw new Error("CUI-ul nu a fost gasit in baza de date ANAF. Verifica cifrele introduse.");
    }

    const general = match.date_generale;

    return {
      companyName: general.denumire ?? "",
      address: general.adresa ?? "",
      registrationNumber: general.nrRegCom ?? "",
      vatPayer: Boolean(match.inregistrare_scop_Tva?.scpTVA),
      eFacturaRegistered: Boolean(general.statusRO_e_Factura),
    };
  });
