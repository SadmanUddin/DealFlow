import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDealDocumentDownload } = vi.hoisted(() => ({
  getDealDocumentDownload: vi.fn(),
}));

vi.mock('../src/services/deal.service.js', () => ({
  createDeal: vi.fn(),
  createOffer: vi.fn(),
  getDeal: vi.fn(),
  getDealDocumentDownload,
  linkDealDocument: vi.fn(),
  listDealActivities: vi.fn(),
  listDealDocuments: vi.fn(),
  listDeals: vi.fn(),
  listOffers: vi.fn(),
  respondToOffer: vi.fn(),
  updateDealStatus: vi.fn(),
  withdrawOffer: vi.fn(),
}));

describe('deal document download controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts both route IDs and delegates participant authorization to the service', async () => {
    const stream = { on: vi.fn(), pipe: vi.fn() };
    getDealDocumentDownload.mockResolvedValue({
      row: {
        original_filename: 'purchase terms.pdf',
        mime_type: 'application/pdf',
        size_bytes: 123,
      },
      stream,
    });
    const { downloadDocument } = await import('../src/controllers/deal.controller.js');
    const response = { set: vi.fn() };

    await downloadDocument(
      { params: { id: '31', documentId: '90' }, user: { id: 7 } },
      response,
      vi.fn()
    );

    expect(getDealDocumentDownload).toHaveBeenCalledWith(31, 90, 7);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/pdf',
      })
    );
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });
});
