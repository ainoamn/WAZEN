/** Minimal OpenAPI 3.0 snapshot for Wazen Business API v1. */

export const runtime = "nodejs";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Wazen Business API",
    version: "1.0.0-phase17",
    description: "Scoped Bearer API (wzn_…) for wallets, members, circles, contributions, settlements, periods, expenses, exports, and documents.",
  },
  servers: [{ url: "https://wazen.bhd-om.com" }],
  paths: {
    "/api/v1/me": { get: { summary: "Current API principal", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces": {
      get: { summary: "List wallets", security: [{ bearerAuth: [] }] },
      post: { summary: "Create wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}": {
      get: { summary: "Wallet detail", security: [{ bearerAuth: [] }] },
      patch: { summary: "Update wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/archive": { post: { summary: "Archive or restore wallet", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/summary": { get: { summary: "Wallet KPIs", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/export": { get: { summary: "Export transactions or members CSV", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle": { get: { summary: "Circle config and turns", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle/order": { post: { summary: "Set circle payout order", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle/turns/{turnId}/complete": {
      post: { summary: "Complete current circle turn payout", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/transactions": {
      get: { summary: "List transactions", security: [{ bearerAuth: [] }] },
      post: { summary: "Create transaction", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/transactions/{transactionId}/void": {
      post: { summary: "Void transaction", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/members": {
      get: { summary: "List members", security: [{ bearerAuth: [] }] },
      post: { summary: "Create member", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/members/{memberId}": {
      patch: { summary: "Update member role/status", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/invites": { post: { summary: "Invite member", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/contributions": { post: { summary: "Record contribution", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/contribution-plan": {
      get: { summary: "Get contribution plan", security: [{ bearerAuth: [] }] },
      put: { summary: "Update contribution plan", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/surplus/withdraw": { post: { summary: "Withdraw surplus", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/installments": { get: { summary: "Installment schedule", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/expenses": {
      get: { summary: "List trip/group expenses", security: [{ bearerAuth: [] }] },
      post: { summary: "Create trip/group expense", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/expenses/{expenseId}/void": {
      post: { summary: "Void trip/group expense", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/settlements": { get: { summary: "List settlements", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/settlements/{settlementId}/settle": {
      post: { summary: "Settle reimbursement/share", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/settlements/{settlementId}/void": {
      post: { summary: "Void pending settlement", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/periods": {
      get: { summary: "List accounting periods", security: [{ bearerAuth: [] }] },
      post: { summary: "Close accounting period", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/periods/{periodId}/reopen": {
      post: { summary: "Reopen closed accounting period", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/audit": { get: { summary: "Audit log", security: [{ bearerAuth: [] }] } },
    "/api/v1/documents": {
      get: { summary: "List documents", security: [{ bearerAuth: [] }] },
      post: { summary: "Create document", security: [{ bearerAuth: [] }] },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "wzn" },
    },
  },
};

export async function GET() {
  return Response.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Wazen-Api": "v1",
    },
  });
}
