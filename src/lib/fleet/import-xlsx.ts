import { XMLParser } from "fast-xml-parser";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { VehicleInput } from "./store";

export const FLEET_HEADERS = [
  "Car Name",
  "Model Year",
  "Plate No. (AR)",
  "Fuel type",
  "Owner",
  "Driver Name",
  "Driver ID",
  "Project No",
  "Project Location",
  "Fuel Card No.",
  "Card Limit",
  "Phone No.",
  "Monthly Rent",
  "Notes",
] as const;

export const FLEET_COLUMN_KEYS = [
  "vehicle_name",
  "model",
  "plate_number",
  "fuel_type",
  "owner",
  "driver_name",
  "driver_id_no",
  "project_number",
  "project_location",
  "fuel_card_no",
  "fuel_card_limit",
  "phone_number",
  "monthly_rent",
  "notes",
] as const;

type FleetColumnKey = (typeof FLEET_COLUMN_KEYS)[number];

export type FleetImportRow = {
  row: number;
  vehicle: VehicleInput;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});

const arr = (v: unknown): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string =>
  v == null
    ? ""
    : typeof v === "object"
      ? String((v as Record<string, unknown>)["#text"] ?? "")
      : String(v);
const rich = (v: any): string =>
  v?.t !== undefined ? text(v.t) : arr(v?.r).map((r) => text(r.t)).join("");

function parseXml(bytes?: Uint8Array) {
  if (!bytes) return {};
  const s = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(s)) {
    throw new Error("Unsupported XML declarations.");
  }
  return xmlParser.parse(s);
}

function toAsciiDigits(s: string) {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
}

function normalizeHeader(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_ALIASES: Record<FleetColumnKey, string[]> = {
  vehicle_name: ["car name", "vehicle name", "name of vehicle", "vehicle"],
  model: ["model year", "model", "year"],
  plate_number: [
    "plate no ar",
    "plate no arabic plate number",
    "plate no",
    "plate number",
    "plate",
  ],
  fuel_type: ["fuel type", "fuel type dropdown diesel petrol", "fuel"],
  owner: ["owner"],
  driver_name: ["driver name", "drivers name", "driver"],
  driver_id_no: ["driver id", "driver id no", "drivers id no", "id no"],
  project_number: ["project no", "project number", "project"],
  project_location: ["project location", "location"],
  fuel_card_no: ["fuel card no", "fuel card number", "fuel card"],
  fuel_card_limit: [
    "card limit",
    "card limit saudi riyal",
    "fuel card limit",
    "fuel card current limit",
  ],
  phone_number: ["phone no", "phone number", "phone", "mobile"],
  monthly_rent: ["monthly rent", "rent"],
  notes: ["notes", "note", "remarks"],
};

function matchHeader(raw: string): FleetColumnKey | undefined {
  const norm = normalizeHeader(raw);
  if (!norm) return undefined;
  for (const key of FLEET_COLUMN_KEYS) {
    if (HEADER_ALIASES[key].some((alias) => norm === alias || norm.startsWith(alias + " "))) {
      return key;
    }
  }
  return undefined;
}

function parseOptionalNumber(raw: string, label: string): number | null {
  const cleaned = toAsciiDigits(raw)
    .trim()
    .replace(/[\u200e\u200f\u061c]/g, "")
    .replace(/sar|sr|ريال/gi, "")
    .replace(/٬/g, "")
    .replace(/٫/g, ".")
    .trim();
  if (!cleaned || /^(n\/?a|-|—|none)$/i.test(cleaned)) return null;
  let s = cleaned;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replaceAll(",", "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`${label}: enter a valid non-negative number (or N/A).`);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n > 100000000) {
    throw new Error(`${label}: value is too large.`);
  }
  return n;
}

function normalizeFuelType(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "diesel" || v === "ديزل") return "Diesel";
  if (lower === "petrol" || lower === "gasoline" || lower === "benzin" || v === "بنزين") {
    return "Petrol";
  }
  throw new Error(`Fuel type must be Diesel or Petrol (got "${v}").`);
}

export function parseFleetWorkbook(bytes: Uint8Array): FleetImportRow[] {
  if (bytes.length > 2 * 1024 * 1024) {
    throw new Error("Choose an .xlsx file smaller than 2 MB.");
  }

  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (
        !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(
          f.name,
        )
      ) {
        return false;
      }
      total += f.originalSize;
      if (f.originalSize > 8 * 1024 * 1024 || total > 16 * 1024 * 1024) {
        throw new Error("Workbook contents are too large.");
      }
      return true;
    },
  });

  const workbook = parseXml(files["xl/workbook.xml"]).workbook;
  const firstSheet = arr(workbook?.sheets?.sheet)[0];
  const rels = arr(
    parseXml(files["xl/_rels/workbook.xml.rels"]).Relationships?.Relationship,
  );
  const target = rels.find(
    (r) => r["@_Id"] === firstSheet?.["@_r:id"],
  )?.["@_Target"];
  const path = target
    ? String(target).replace(/^\/?xl\//, "").replace(/^\//, "")
    : "worksheets/sheet1.xml";
  if (!/^worksheets\/sheet\d+\.xml$/.test(path) || !files["xl/" + path]) {
    throw new Error("Use the first worksheet for your vehicle data.");
  }

  const strings = arr(parseXml(files["xl/sharedStrings.xml"]).sst?.si).map(rich);
  const sheet = parseXml(files["xl/" + path]).worksheet;
  const rows = arr(sheet?.sheetData?.row).map((r) => {
    const cells: string[] = [];
    for (const c of arr(r.c)) {
      if (c.f !== undefined) {
        throw new Error(`Row ${r["@_r"]}: use values only, not formulas.`);
      }
      if (c["@_t"] === "e") {
        throw new Error(`Row ${r["@_r"]}: fix Excel cell errors first.`);
      }
      const col = /^([A-Z]+)\d+$/.exec(c["@_r"] || "")?.[1];
      if (!col) throw new Error("Invalid cell reference.");
      let index = 0;
      for (const ch of col) index = index * 26 + ch.charCodeAt(0) - 64;
      index--;
      if (index > 50) throw new Error("Too many columns.");
      const v =
        c["@_t"] === "s"
          ? (strings[Number(c.v)] ?? "")
          : c["@_t"] === "inlineStr"
            ? rich(c.is)
            : text(c.v);
      if (v.length > 3000) throw new Error("A cell is too long.");
      cells[index] = v;
    }
    return { row: Number(r["@_r"]), cells };
  });

  const headIdx = rows.findIndex((r) => r.cells.some((v) => v?.trim()));
  if (headIdx < 0) throw new Error("The workbook is empty.");

  const mapped = rows[headIdx].cells.map((h) => matchHeader(h || ""));
  const keys = mapped.filter(Boolean) as FleetColumnKey[];
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate column headers found.");
  }
  if (!keys.includes("vehicle_name")) {
    throw new Error('Missing required column: "Car Name".');
  }
  if (!keys.includes("plate_number")) {
    throw new Error('Missing required column: "Plate No. (AR)".');
  }

  const result: FleetImportRow[] = [];
  const errors: string[] = [];

  for (const r of rows.slice(headIdx + 1)) {
    if (!r.cells.some((v) => v?.trim())) continue;
    if (result.length + errors.length >= 500) {
      throw new Error("Import at most 500 vehicles per file.");
    }
    const get = (key: FleetColumnKey) => {
      const idx = mapped.indexOf(key);
      return idx >= 0 ? String(r.cells[idx] || "").trim() : "";
    };

    try {
      const vehicle_name = get("vehicle_name");
      const plate_number = get("plate_number");
      if (!vehicle_name) throw new Error("Car Name is required.");
      if (!plate_number) throw new Error("Plate No. (AR) is required.");

      const fuel_type = normalizeFuelType(get("fuel_type"));
      const fuel_card_limit = parseOptionalNumber(
        get("fuel_card_limit"),
        "Card Limit",
      );
      const rentAmount = parseOptionalNumber(
        get("monthly_rent"),
        "Monthly Rent",
      );

      result.push({
        row: r.row,
        vehicle: {
          vehicle_name: vehicle_name.slice(0, 120),
          model: get("model").slice(0, 100),
          plate_number: plate_number.slice(0, 60),
          fuel_type,
          owner: get("owner").slice(0, 120),
          monthly_rent_type: rentAmount === null ? "N/A" : "amount",
          monthly_rent: rentAmount,
          driver_name: get("driver_name").slice(0, 120),
          driver_id_no: get("driver_id_no").slice(0, 60),
          project_number: get("project_number").slice(0, 60),
          project_location: get("project_location").slice(0, 160),
          fuel_card_no: get("fuel_card_no").slice(0, 60),
          fuel_card_limit,
          phone_number: get("phone_number").slice(0, 40),
          notes: get("notes").slice(0, 2000),
        },
      });
    } catch (e) {
      errors.push(`Row ${r.row}: ${(e as Error).message}`);
    }
  }

  if (errors.length) {
    throw new Error(
      errors.slice(0, 25).join("\n") +
        (errors.length > 25 ? `\n${errors.length - 25} more errors.` : ""),
    );
  }
  if (!result.length) {
    throw new Error("Fill at least one vehicle row before uploading.");
  }
  return result;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function colLetter(index: number) {
  let n = index + 1;
  let c = "";
  while (n) {
    c = String.fromCharCode(65 + ((n - 1) % 26)) + c;
    n = Math.floor((n - 1) / 26);
  }
  return c;
}

export function fleetImportTemplate(): Uint8Array {
  const instructions = [
    ["Vehicles Management Bulk Import Template"],
    [
      'Fill the "Vehicles" worksheet. Keep the header row unchanged. Arabic text and Arabic/English digits are supported.',
    ],
    ['Required columns: "Car Name" and "Plate No. (AR)".'],
    ['"Fuel type" has a dropdown: choose Diesel or Petrol.'],
    ['"Card Limit" is in Saudi Riyal (SAR). Enter a number or leave blank.'],
    [
      '"Monthly Rent" accepts a numeric SAR amount, or leave blank / write N/A for non-rented vehicles.',
    ],
    [
      "Maximum 500 vehicles and 2 MB per .xlsx file. Use plain values only (no formulas).",
    ],
  ];

  const makeSheet = (rows: unknown[][], isDataSheet = false) => {
    const colWidths = isDataSheet
      ? [22, 14, 20, 14, 20, 22, 18, 16, 22, 18, 16, 18, 16, 28]
      : [100];
    const colsXml = colWidths
      .map(
        (w, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
      )
      .join("");

    const rowsXml = rows
      .map(
        (row, rIdx) =>
          `<row r="${rIdx + 1}" ht="${rIdx === 0 ? 30 : 24}" customHeight="1">${row
            .map(
              (val, cIdx) =>
                `<c r="${colLetter(cIdx)}${rIdx + 1}" s="${rIdx === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`,
            )
            .join("")}</row>`,
      )
      .join("");

    const extra = isDataSheet
      ? `<autoFilter ref="A1:N1"/><dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="D2:D500"><formula1>"Diesel,Petrol"</formula1></dataValidation></dataValidations>`
      : "";

    return `<worksheet xmlns="${MAIN_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${colsXml}</cols><sheetData>${rowsXml}</sheetData>${extra}</worksheet>`;
  };

  const blankRows = Array.from({ length: 20 }, () =>
    FLEET_HEADERS.map(() => ""),
  );

  const files: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="book" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Vehicles" sheetId="1" r:id="s1"/><sheet name="Instructions" sheetId="2" r:id="s2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Type="${REL_NS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="styles" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${MAIN_NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF155D3D"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": makeSheet([Array.from(FLEET_HEADERS), ...blankRows], true),
    "xl/worksheets/sheet2.xml": makeSheet(instructions, false),
  };

  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, xml]) => [
        path,
        strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml),
      ]),
    ),
  );
}
