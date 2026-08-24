/** Minimal OpenAPI 3.0 snapshot for Wazen Business API v1. */

export const runtime = "nodejs";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Wazen Business API",
    version: "1.0.0-phase23",
    description: "Scoped Bearer API (wzn_…) for wallets, accounts, rules, occurrences, links, transfers, members, circles, shares, notifications, webhooks, contributions, settlements, periods, expenses, exports, and documents.",
  },
  servers: [{ url: "https://wazen.bhd-om.com" }],
  paths: {
    "/api/v1/me": { get: { summary: "Current API principal", security: [{ bearerAuth: [] }] } },
    "/api/v1/notifications": { get: { summary: "List in-app notifications", security: [{ bearerAuth: [] }] } },
    "/api/v1/notifications/read": { post: { summary: "Mark notifications read", security: [{ bearerAuth: [] }] } },
    "/api/v1/webhooks": {
      get: { summary: "List integration webhooks (optional ?deliveries=1)", security: [{ bearerAuth: [] }] },
      post: { summary: "Create integration webhook", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/webhooks/{webhookId}": {
      delete: { summary: "Revoke integration webhook", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/webhooks/{webhookId}/test": {
      post: { summary: "Enqueue webhook test delivery", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces": {
      get: { summary: "List wallets", security: [{ bearerAuth: [] }] },
      post: { summary: "Create wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}": {
      get: { summary: "Wallet detail", security: [{ bearerAuth: [] }] },
      patch: { summary: "Update wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/archive": { post: { summary: "Archive or restore wallet", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/accounts": {
      get: { summary: "List personal accounts (banks/cash)", security: [{ bearerAuth: [] }] },
      post: { summary: "Create personal account", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/accounts/{accountId}": {
      patch: { summary: "Update personal account", security: [{ bearerAuth: [] }] },
      delete: { summary: "Delete personal account (no activity)", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/rules": {
      get: { summary: "List personal income/expense rules and pending occurrences", security: [{ bearerAuth: [] }] },
      post: { summary: "Create personal income/expense rule", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/rules/{ruleId}": {
      patch: { summary: "Update personal rule", security: [{ bearerAuth: [] }] },
      delete: { summary: "Delete personal rule", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/occurrences/{occurrenceId}/confirm": {
      post: { summary: "Confirm pending personal occurrence (posts transaction)", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/occurrences/{occurrenceId}/skip": {
      post: { summary: "Skip pending personal occurrence", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/links": {
      get: { summary: "List linked wallets (personal hub)", security: [{ bearerAuth: [] }] },
      post: { summary: "Link a wallet to personal hub", security: [{ bearerAuth: [] }] },
      delete: { summary: "Unlink a wallet from personal hub", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/links/bank": {
      put: { summary: "Set or clear bank account for a linked wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/links/transfer": {
      post: { summary: "Transfer funds between hub and linked wallet", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/summary": { get: { summary: "Wallet KPIs", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/export": { get: { summary: "Export transactions or members CSV", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle": { get: { summary: "Circle config and turns", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle/order": { post: { summary: "Set circle payout order", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/circle/turns/{turnId}/complete": {
      post: { summary: "Complete current circle turn payout", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/shares/receipt": { post: { summary: "Create receipt share link", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/shares/member-statement": { post: { summary: "Create member statement share", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/shares/statement": { post: { summary: "Create association statement share", security: [{ bearerAuth: [] }] } },
    "/api/v1/spaces/{spaceId}/transactions": {
      get: { summary: "List transactions", security: [{ bearerAuth: [] }] },
      post: { summary: "Create transaction", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/transactions/{transactionId}": {
      get: { summary: "Get transaction", security: [{ bearerAuth: [] }] },
      patch: { summary: "Update transaction", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/transactions/{transactionId}/revisions": {
      get: { summary: "Transaction edit history", security: [{ bearerAuth: [] }] },
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
    "/api/v1/spaces/{spaceId}/expenses/resplit": {
      post: { summary: "Resplit unsettled trip expenses", security: [{ bearerAuth: [] }] },
    },
    "/api/v1/spaces/{spaceId}/expenses/{expenseId}": {
      patch: { summary: "Update trip/group expense", security: [{ bearerAuth: [] }] },
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
