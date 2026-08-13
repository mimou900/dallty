/**
 * Export helpers for the Reports section.
 * Heavy libraries are loaded on demand so they stay out of the initial bundle.
 */

export type ReportTable = {
  title: string;
  headers: string[];
  rows: (string | number)[][];
};

export type ReportDocument = {
  fileName: string;
  title: string;
  subtitle?: string;
  tables: ReportTable[];
};

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function exportReportCsv(doc: ReportDocument) {
  const lines: string[] = [csvCell(doc.title)];
  if (doc.subtitle) lines.push(csvCell(doc.subtitle));
  for (const table of doc.tables) {
    lines.push("");
    lines.push(csvCell(table.title));
    lines.push(table.headers.map(csvCell).join(","));
    for (const row of table.rows) lines.push(row.map(csvCell).join(","));
  }
  // BOM keeps Arabic and currency symbols readable in Excel.
  download(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${doc.fileName}.csv`);
}

export async function exportReportExcel(doc: ReportDocument) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const table of doc.tables) {
    const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
    const name = table.title.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Sheet";
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${doc.fileName}.xlsx`,
  );
}

export async function exportReportPdf(doc: ReportDocument) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  pdf.setFontSize(16);
  pdf.text(doc.title, 40, 48);
  if (doc.subtitle) {
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text(doc.subtitle, 40, 66);
    pdf.setTextColor(0);
  }

  let cursor = doc.subtitle ? 90 : 72;
  for (const table of doc.tables) {
    pdf.setFontSize(12);
    pdf.text(table.title, 40, cursor);
    autoTable(pdf, {
      head: [table.headers],
      body: table.rows.map((r) => r.map(String)),
      startY: cursor + 8,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [16, 122, 96] },
      margin: { left: 40, right: 40 },
    });
    const last = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursor = (last?.finalY ?? cursor) + 34;
    if (cursor > 720) {
      pdf.addPage();
      cursor = 60;
    }
  }

  pdf.save(`${doc.fileName}.pdf`);
}
