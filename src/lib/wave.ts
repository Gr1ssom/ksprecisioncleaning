import "server-only";
import type { Line } from "./format";

/**
 * Minimal Wave Accounting public GraphQL client.
 * Docs: https://developer.waveapps.com/hc/en-us/articles/360019968212-API-Reference
 * Requires a Full Access token (or OAuth token) + business id.
 */
const ENDPOINT = "https://gql.waveapps.com/graphql/public";

export const waveConfigured = () => Boolean(process.env.WAVE_ACCESS_TOKEN && process.env.WAVE_BUSINESS_ID);

type MutationResult = { didSucceed: boolean; inputErrors?: { message: string; path?: string[] }[] | null };

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WAVE_ACCESS_TOKEN}` },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e: { message: string }) => e.message).join("; ") || `Wave HTTP ${res.status}`);
  }
  return json.data as T;
}

function check(r: MutationResult, what: string) {
  if (!r.didSucceed) throw new Error(`${what}: ${r.inputErrors?.map((e) => e.message).join("; ") || "failed"}`);
}

export async function ensureWaveCustomer(c: { name: string; email?: string | null; phone?: string | null }) {
  const data = await gql<{ customerCreate: MutationResult & { customer: { id: string } } }>(
    `mutation($input: CustomerCreateInput!) { customerCreate(input: $input) { didSucceed inputErrors { message path } customer { id } } }`,
    { input: { businessId: process.env.WAVE_BUSINESS_ID, name: c.name, email: c.email || undefined, phone: c.phone || undefined } },
  );
  check(data.customerCreate, "customerCreate");
  return data.customerCreate.customer.id;
}

const PRODUCT_NAME = "Cleaning Services";
let productCache: string | null = null;

async function ensureServiceProduct() {
  if (process.env.WAVE_PRODUCT_ID) return process.env.WAVE_PRODUCT_ID;
  if (productCache) return productCache;
  const found = await gql<{ business: { products: { edges: { node: { id: string; name: string } }[] } } }>(
    `query($id: ID!) { business(id: $id) { products(page: 1, pageSize: 200) { edges { node { id name } } } } }`,
    { id: process.env.WAVE_BUSINESS_ID },
  );
  const hit = found.business.products.edges.find((e) => e.node.name === PRODUCT_NAME);
  if (hit) return (productCache = hit.node.id);
  if (!process.env.WAVE_INCOME_ACCOUNT_ID) throw new Error("Set WAVE_PRODUCT_ID or WAVE_INCOME_ACCOUNT_ID to create a Wave product");
  const made = await gql<{ productCreate: MutationResult & { product: { id: string } } }>(
    `mutation($input: ProductCreateInput!) { productCreate(input: $input) { didSucceed inputErrors { message } product { id } } }`,
    { input: { businessId: process.env.WAVE_BUSINESS_ID, name: PRODUCT_NAME, unitPrice: "0", incomeAccountId: process.env.WAVE_INCOME_ACCOUNT_ID } },
  );
  check(made.productCreate, "productCreate");
  return (productCache = made.productCreate.product.id);
}

/** Create, approve and email an invoice from Wave. Returns Wave ids/links. */
export async function sendWaveInvoice(args: {
  customerId: string;
  email: string;
  invoiceDate: string;
  dueDate: string;
  memo?: string | null;
  lines: Line[];
  subject: string;
  message: string;
}) {
  const productId = await ensureServiceProduct();
  const created = await gql<{ invoiceCreate: MutationResult & { invoice: { id: string; viewUrl: string } } }>(
    `mutation($input: InvoiceCreateInput!) { invoiceCreate(input: $input) { didSucceed inputErrors { message path } invoice { id viewUrl } } }`,
    {
      input: {
        businessId: process.env.WAVE_BUSINESS_ID,
        customerId: args.customerId,
        status: "SAVED",
        invoiceDate: args.invoiceDate,
        dueDate: args.dueDate,
        memo: args.memo || undefined,
        items: args.lines.map((l) => ({
          productId,
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
        })),
      },
    },
  );
  check(created.invoiceCreate, "invoiceCreate");
  const inv = created.invoiceCreate.invoice;

  const approved = await gql<{ invoiceApprove: MutationResult }>(
    `mutation($input: InvoiceApproveInput!) { invoiceApprove(input: $input) { didSucceed inputErrors { message } } }`,
    { input: { invoiceId: inv.id } },
  );
  check(approved.invoiceApprove, "invoiceApprove");

  const sent = await gql<{ invoiceSend: MutationResult }>(
    `mutation($input: InvoiceSendInput!) { invoiceSend(input: $input) { didSucceed inputErrors { message } } }`,
    { input: { invoiceId: inv.id, to: [args.email], subject: args.subject, message: args.message, attachPDF: true } },
  );
  check(sent.invoiceSend, "invoiceSend");
  return { waveInvoiceId: inv.id, viewUrl: inv.viewUrl };
}

/** Current Wave status of each invoice id (e.g. SENT, VIEWED, PARTIAL, PAID). Unknown ids are left out. */
export async function waveInvoiceStatuses(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    // One request per 20 invoices: each is an aliased field (i0, i1, …) on the business.
    const fields = chunk.map((_, k) => `i${k}: invoice(id: $i${k}) { id status }`).join(" ");
    const vars = chunk.map((_, k) => `$i${k}: ID!`).join(", ");
    const data = await gql<{ business: Record<string, { id: string; status: string } | null> }>(
      `query($b: ID!, ${vars}) { business(id: $b) { ${fields} } }`,
      { b: process.env.WAVE_BUSINESS_ID, ...Object.fromEntries(chunk.map((id, k) => [`i${k}`, id])) },
    );
    chunk.forEach((id, k) => { const inv = data.business?.[`i${k}`]; if (inv?.status) out[id] = inv.status; });
  }
  return out;
}
