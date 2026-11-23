import { downloadDealDocument } from "./api";

export async function downloadLinkedDocument(
  dealId: number,
  documentId: number,
  filename: string,
) {
  const blob = await downloadDealDocument(dealId, documentId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
