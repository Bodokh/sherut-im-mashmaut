export type TransferSchemaState = "ready" | "absent" | "partial";

type SchemaQueryClient = {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
};

export async function transferSchemaState(client: SchemaQueryClient): Promise<TransferSchemaState> {
  const result = await client.query<{ requests: unknown; emails: unknown }>(
    "SELECT to_regclass('mentoring.transfer_requests') IS NOT NULL AS requests, to_regclass('mentoring.transfer_request_emails') IS NOT NULL AS emails",
  );
  const requests = Boolean(result.rows[0]?.requests);
  const emails = Boolean(result.rows[0]?.emails);
  if (requests && emails) return "ready";
  return requests || emails ? "partial" : "absent";
}
