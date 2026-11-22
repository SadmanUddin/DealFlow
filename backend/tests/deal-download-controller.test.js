import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDealDocumentDownload, respondToOffer, withdrawOffer } = vi.hoisted(() => ({
  getDealDocumentDownload: vi.fn(),
  respondToOffer: vi.fn(),
  withdrawOffer: vi.fn(),
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
  respondToOffer,
  updateDealStatus: vi.fn(),
  withdrawOffer,
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

describe('deal offer response controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts the combined deal and offer route params for responding', async () => {
    const { respond } = await import('../src/controllers/deal.controller.js');
    const response = { status: vi.fn(() => response), json: vi.fn() };
    respondToOffer.mockResolvedValue({ id: 90, status: 'accepted' });

    await respond(
      { params: { id: '31', offerId: '90' }, body: { action: 'accept' }, user: { id: 7 } },
      response
    );

    expect(respondToOffer).toHaveBeenCalledWith(31, 90, 7, 'accept');
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('accepts the combined deal and offer route params for withdrawal', async () => {
    const { withdraw } = await import('../src/controllers/deal.controller.js');
    const response = { status: vi.fn(() => response), json: vi.fn() };
    withdrawOffer.mockResolvedValue({ id: 90, status: 'withdrawn' });

    await withdraw(
      { params: { id: '31', offerId: '90' }, user: { id: 7 } },
      response
    );

    expect(withdrawOffer).toHaveBeenCalledWith(31, 90, 7);
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
