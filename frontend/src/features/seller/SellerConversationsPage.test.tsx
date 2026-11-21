import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/auth-context";
import { SellerConversationsPage } from "./SellerConversationsPage";

const mocks = vi.hoisted(() => ({
  listBuyerConversations: vi.fn(),
  listBuyerConversationMessages: vi.fn(),
  markBuyerConversationRead: vi.fn(),
  sendBuyerConversationMessage: vi.fn(),
}));

vi.mock("@/features/buyer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/buyer/api")>()),
  ...mocks,
  listConversations: mocks.listBuyerConversations,
  listConversationMessages: mocks.listBuyerConversationMessages,
  markConversationRead: mocks.markBuyerConversationRead,
  sendConversationMessage: mocks.sendBuyerConversationMessage,
}));

const sellerAuth: AuthContextValue = {
  user: {
    id: 22,
    email: "seller@example.test",
    role: "seller",
    emailVerified: true,
  },
  isLoading: false,
  initializationError: null,
  isSigningIn: false,
  isSigningUp: false,
  isSigningOut: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};

const conversation = {
  id: 9,
  listingId: 41,
  listingTitle: "Northshore Coffee Roasters",
  buyerId: 21,
  sellerId: 22,
  participantName: "Buyer Name",
  status: "pending" as const,
  statusUpdatedAt: "2026-10-02T10:00:00.000Z",
  createdAt: "2026-10-01T10:00:00.000Z",
  latestMessage: "Could you share the latest monthly figures?",
  latestMessageAt: "2026-10-03T10:00:00.000Z",
  unreadCount: 2,
};

describe("seller conversations inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBuyerConversations.mockResolvedValue({
      conversations: [conversation],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    mocks.listBuyerConversationMessages.mockResolvedValue({
      messages: [
        {
          id: 55,
          conversationId: 9,
          senderId: 21,
          senderName: "Buyer Name",
          content: "Could you share the latest monthly figures?",
          createdAt: "2026-10-03T10:00:00.000Z",
          readAt: null,
        },
      ],
      pagination: { limit: 50, hasMore: false, nextCursor: null },
    });
    mocks.markBuyerConversationRead.mockResolvedValue({
      conversationId: 9,
      readCount: 1,
    });
    mocks.sendBuyerConversationMessage.mockResolvedValue({
      message: {
        id: 56,
        conversationId: 9,
        senderId: 22,
        content: "I will send them this afternoon.",
        createdAt: "2026-10-03T11:00:00.000Z",
        readAt: null,
      },
    });
  });

  it("shows seller conversation details, marks messages read, and sends a reply", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={sellerAuth}>
          <MemoryRouter initialEntries={["/seller/conversations"]}>
            <SellerConversationsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Conversations" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Northshore Coffee Roasters")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Buyer Name")).toBeInTheDocument();
    expect(
      screen.getAllByText("Could you share the latest monthly figures?").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.markBuyerConversationRead).toHaveBeenCalledWith(9),
    );

    await user.type(
      screen.getByLabelText("Write a message"),
      "I will send them this afternoon.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(mocks.sendBuyerConversationMessage).toHaveBeenCalledWith(
        9,
        "I will send them this afternoon.",
      ),
    );
  });
});
