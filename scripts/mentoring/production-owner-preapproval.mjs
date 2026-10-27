import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/;
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const MAX_APPROVAL_BYTES = 65_536;

// These are code-owned identifiers, never interpolated from the approval file.
export const APPLICATION_TABLES = Object.freeze([
  "memberships", "participants", "assignments", "contacts", "appointments", "reviews", "grants",
  "ceo_protections", "operations", "conflicts", "audit", "outbox", "resource_ids", "contact_revisions",
  "review_events", "appointment_history", "manual_color_history", "organization_settings_history",
  "monthly_reviews", "monthly_review_history", "reminder_jobs", "reminder_attempts",
]);
const ALL_TABLES = Object.freeze([...APPLICATION_TABLES, "organizations", "organization_settings", "schema_migrations"]);
const COUNT_SQL = APPLICATION_TABLES.map(name => `SELECT '${name}' AS table_name, count(*)::text AS row_count FROM mentoring.${name}`).join(" UNION ALL ");
const LOCK_SQL = `LOCK TABLE ${ALL_TABLES.map(name=>`mentoring.${name}`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`;
const MESSAGES = Object.freeze({
  invalid_arguments: "Use --production --approval-file /absolute/private/approval.json and optional --apply.",
  invalid_manifest: "The production approval manifest is invalid or incomplete.",
  private_file_required: "The approval file must be a private, bounded, regular JSON file owned by this operator.",
  wrong_environment: "This entry point requires an explicit production execution environment.",
  wrong_target: "The production database or Clerk target differs from the approved target.",
  migration_mismatch: "The production schema or migration checksums differ from this checkout.",
  nonempty_database: "The production application contains prior data or changed seed settings; no preapproval was applied.",
  conflict: "An existing preapproval, membership, receipt or audit differs; no existing record was changed.",
  database_error: "Production owner preapproval failed. No private details were logged.",
});

export class ProductionBootstrapError extends Error {
  constructor(code) { super(MESSAGES[code] ?? MESSAGES.database_error); this.name = "ProductionBootstrapError"; this.code = Object.hasOwn(MESSAGES,code)?code:"database_error"; }
}
const fail = (code) => { throw new ProductionBootstrapError(code); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function keys(value, expected) {
  if (!plain(value) || Object.keys(value).length !== expected.length || expected.some(key=>!Object.hasOwn(value,key))) fail("invalid_manifest");
}
const printable = (value,max) => typeof value === "string" && value.length>=1 && value.length<=max && value===value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const validIso = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
function freeze(value) { if (value && typeof value === "object") { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); } return value; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const same = (left,right) => canonical(left)===canonical(right);
const iso = value => { try { return new Date(value).toISOString(); } catch { return null; } };

export function validateManifest(raw) {
  keys(raw,["version","environment","mode","organizationId","approval","provider","database","clerk","owners"]);
  if (raw.version!==1 || raw.environment!=="production" || raw.mode!=="unbound_email_preapproval" || raw.organizationId!==ORGANIZATION_ID) fail("invalid_manifest");
  keys(raw.approval,["reference","operator","approvedAt"]);
  if (typeof raw.approval.reference!=="string" || !OPAQUE.test(raw.approval.reference) || !printable(raw.approval.operator,100) || !validIso(raw.approval.approvedAt)) fail("invalid_manifest");
  keys(raw.provider,["name","resourceId","projectId","branchId"]);
  if (raw.provider.name!=="neon" || [raw.provider.resourceId,raw.provider.projectId,raw.provider.branchId].some(value=>typeof value!=="string" || !OPAQUE.test(value))) fail("invalid_manifest");
  keys(raw.database,["host","name","role"]);
  if (typeof raw.database.host!=="string" || !HOSTNAME.test(raw.database.host) || !raw.database.host.startsWith("ep-") || !raw.database.host.endsWith(".neon.tech") || raw.database.host.includes("-pooler") || typeof raw.database.name!=="string" || !IDENTIFIER.test(raw.database.name) || typeof raw.database.role!=="string" || !IDENTIFIER.test(raw.database.role)) fail("invalid_manifest");
  keys(raw.clerk,["instanceId","frontendHostname"]);
  if (typeof raw.clerk.instanceId!=="string" || !/^ins_[A-Za-z0-9]{1,195}$/.test(raw.clerk.instanceId) || typeof raw.clerk.frontendHostname!=="string" || !HOSTNAME.test(raw.clerk.frontendHostname) || !raw.clerk.frontendHostname.startsWith("clerk.") || /\.(?:accounts|lcl)\.dev$/.test(raw.clerk.frontendHostname)) fail("invalid_manifest");
  if (!Array.isArray(raw.owners) || raw.owners.length<1 || raw.owners.length>10) fail("invalid_manifest");
  const ids = new Set(); const emails = new Set();
  for (const owner of raw.owners) {
    keys(owner,["membershipId","operationId","auditId","email","displayName"]);
    for (const id of [owner.membershipId,owner.operationId,owner.auditId]) { if (typeof id!=="string" || !UUID.test(id) || ids.has(id)) fail("invalid_manifest"); ids.add(id); }
    if (typeof owner.email!=="string" || owner.email.length>320 || owner.email!==owner.email.trim().toLowerCase() || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(owner.email) || emails.has(owner.email) || !printable(owner.displayName,200)) fail("invalid_manifest");
    emails.add(owner.email);
  }
  return freeze(structuredClone(raw));
}

export function assertProductionEnvironment(environment) {
  if (environment.NODE_ENV!=="production" || (environment.VERCEL_ENV && environment.VERCEL_ENV!=="production")) fail("wrong_environment");
}

export function productionConnectionConfig(environment, raw) {
  assertProductionEnvironment(environment);
  const manifest=validateManifest(raw);
  let url; let username; let password; let database;
  try {
    url=new URL(environment.MENTORING_PRODUCTION_DATABASE_URL);
    username=decodeURIComponent(url.username); password=decodeURIComponent(url.password); database=decodeURIComponent(url.pathname.slice(1));
  } catch { fail("wrong_target"); }
  const allowed=new Set(["sslmode","channel_binding"]);
  if (!["postgres:","postgresql:"].includes(url.protocol) || url.hostname!==manifest.database.host || url.hostname.includes("-pooler") || (url.port && url.port!=="5432") || username!==manifest.database.role || database!==manifest.database.name || !password || url.hash || [...url.searchParams.keys()].some(key=>!allowed.has(key)) || !["require","verify-full"].includes(url.searchParams.get("sslmode")) || (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding")!=="require")) fail("wrong_target");
  const key=environment.MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY;
  if (typeof key!=="string" || !key.startsWith("pk_live_")) fail("wrong_target");
  const encoded=key.slice(8); const decoded=Buffer.from(encoded,"base64");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || decoded.toString("base64").replace(/=+$/,"")!==encoded.replace(/=+$/,"") || decoded.toString("utf8")!==`${manifest.clerk.frontendHostname}$`) fail("wrong_target");
  // Parse the approved components ourselves. URI query options cannot override
  // host/user/database or relax TLS certificate/hostname verification in pg.
  return { host:url.hostname, port:5432, user:username, password, database, ssl:{rejectUnauthorized:true}, enableChannelBinding:true, connectionTimeoutMillis:10_000, application_name:"mentoring-production-owner-preapproval" };
}

export function parseBootstrapArguments(args) {
  let values;
  try { ({values}=parseArgs({args,strict:true,allowPositionals:false,options:{help:{type:"boolean"},production:{type:"boolean"},"approval-file":{type:"string"},apply:{type:"boolean"}}})); } catch { fail("invalid_arguments"); }
  if (values.help) { if (Object.keys(values).length!==1) fail("invalid_arguments"); return null; }
  if (!values.production || !values["approval-file"] || !path.isAbsolute(values["approval-file"])) fail("invalid_arguments");
  return {approvalFile:values["approval-file"],apply:values.apply===true};
}

export async function readApprovalFile(filename) {
  let handle;
  try {
    handle=await open(filename,constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat=await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077)!==0 || (typeof process.getuid==="function" && stat.uid!==process.getuid()) || stat.size>MAX_APPROVAL_BYTES) fail("private_file_required");
    const buffer=Buffer.alloc(MAX_APPROVAL_BYTES+1); let total=0;
    while (total<buffer.length) { const {bytesRead}=await handle.read(buffer,total,buffer.length-total,total); if (!bytesRead) break; total+=bytesRead; }
    if (total>MAX_APPROVAL_BYTES) fail("private_file_required");
    let parsed;
    try { parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,total))); } catch { fail("private_file_required"); }
    return validateManifest(parsed);
  } catch (error) { if (error instanceof ProductionBootstrapError) throw error; fail("private_file_required"); }
  finally { await handle?.close().catch(()=>{}); }
}

export async function loadMigrations(directory=fileURLToPath(new URL("../../db/mentoring/",import.meta.url))) {
  const entries=await readdir(directory,{withFileTypes:true});
  const files=entries.filter(entry=>entry.name.endsWith(".sql"));
  if (!files.length || files.some(entry=>!entry.isFile() || !/^\d{3}_[a-z0-9_]+\.sql$/.test(entry.name))) fail("migration_mismatch");
  const names=files.map(entry=>entry.name).sort();
  if (new Set(names.map(name=>name.slice(0,3))).size!==names.length) fail("migration_mismatch");
  return freeze(await Promise.all(names.map(async filename=>({filename,checksum:createHash("sha256").update(await readFile(path.join(directory,filename))).digest("hex")}))));
}

function migrationSnapshot(migrations) {
  if (!Array.isArray(migrations) || !migrations.length || migrations.some(row=>!plain(row) || !/^\d{3}_[a-z0-9_]+\.sql$/.test(row.filename) || !/^[a-f0-9]{64}$/.test(row.checksum))) fail("migration_mismatch");
  const snapshot=structuredClone(migrations).sort((a,b)=>a.filename.localeCompare(b.filename));
  if (new Set(snapshot.map(row=>row.filename.slice(0,3))).size!==snapshot.length) fail("migration_mismatch");
  return freeze(snapshot);
}

function receipt(manifest,owner,digest,createdAt) { return {kind:"production_owner_preapproval",membershipId:owner.membershipId,approvalDigest:digest,clerkInstanceId:manifest.clerk.instanceId,identityBinding:"verified_primary_email_required",createdAt}; }
function auditDetails(manifest,owner,digest) { return {mode:"external_operator_preapproval",approvalReference:manifest.approval.reference,approvalOperator:manifest.approval.operator,approvedAt:manifest.approval.approvedAt,approvalDigest:digest,targetMembershipId:owner.membershipId,identityBinding:"unbound_verified_primary_email",clerkInstanceId:manifest.clerk.instanceId,clerkFrontendHostname:manifest.clerk.frontendHostname,providerResourceId:manifest.provider.resourceId,providerProjectId:manifest.provider.projectId,providerBranchId:manifest.provider.branchId}; }

function exactReplay(manifest,digest,memberships,operations,audits) {
  if (memberships.length!==manifest.owners.length || operations.length!==manifest.owners.length || audits.length!==manifest.owners.length) return false;
  const actorId=manifest.owners[0].membershipId;
  return manifest.owners.every(owner=>{
    const member=memberships.find(row=>row.id===owner.membershipId);
    const operation=operations.find(row=>row.operation_id===owner.operationId);
    const audit=audits.find(row=>row.id===owner.auditId);
    const createdAt=operation?.response?.createdAt;
    return validIso(createdAt) && member && member.organization_id===manifest.organizationId && member.auth_user_id===null && member.email===owner.email && member.display_name===owner.displayName && member.phone===null && member.role==="ceo" && member.active===true && member.version===1 && member.coordinator_id===null && member.sms_muted===false && iso(member.created_at)===createdAt && iso(member.updated_at)===createdAt &&
      operation.organization_id===manifest.organizationId && operation.actor_id===actorId && operation.payload_hash===digest && same(operation.response,receipt(manifest,owner,digest,createdAt)) && iso(operation.created_at)===createdAt &&
      audit && audit.organization_id===manifest.organizationId && audit.actor_id===actorId && audit.operation_id===owner.operationId && audit.action==="production_owner_preapproved" && audit.participant_id===null && same(audit.details,auditDetails(manifest,owner,digest)) && iso(audit.created_at)===createdAt;
  });
}

/** Uses the caller's connected client; never retries, creates users or sends. */
export async function executePreapproval(client, raw, migrations, {apply=false}={}) {
  if (typeof apply!=="boolean") fail("invalid_arguments");
  const manifest=validateManifest(raw); const expectedMigrations=migrationSnapshot(migrations);
  const digest=createHash("sha256").update(canonical(manifest)).digest("hex");
  let transaction=false;
  try {
    await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction=true;
    await client.query("SET LOCAL statement_timeout = '10s'"); await client.query("SET LOCAL lock_timeout = '5s'");
    const identity=await client.query("SELECT current_database() AS database_name, current_user AS role_name");
    if (identity.rows.length!==1 || identity.rows[0].database_name!==manifest.database.name || identity.rows[0].role_name!==manifest.database.role) fail("wrong_target");
    if (apply) { await client.query("SELECT pg_advisory_xact_lock(602617869, 1)"); await client.query("SELECT pg_advisory_xact_lock(602617869, 3)"); }
    const inventory=await client.query("SELECT t.tablename, c.relrowsecurity AS row_security, c.relforcerowsecurity AS force_row_security FROM pg_catalog.pg_tables t JOIN pg_catalog.pg_namespace n ON n.nspname = t.schemaname JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = t.tablename WHERE t.schemaname = 'mentoring' ORDER BY t.tablename");
    if (inventory.rows.length!==ALL_TABLES.length || inventory.rows.some(row=>!ALL_TABLES.includes(row.tablename) || row.row_security!==false || row.force_row_security!==false) || new Set(inventory.rows.map(row=>row.tablename)).size!==ALL_TABLES.length) fail("migration_mismatch");
    const applied=await client.query("SELECT version, checksum FROM mentoring.schema_migrations ORDER BY version");
    if (!same(applied.rows.map(row=>({filename:row.version,checksum:row.checksum})),expectedMigrations)) fail("migration_mismatch");
    if (apply) await client.query(LOCK_SQL);
    const organization=await client.query(`SELECT id FROM mentoring.organizations ORDER BY id${apply?" FOR UPDATE":""}`);
    if (organization.rows.length!==1 || organization.rows[0].id!==manifest.organizationId) fail("nonempty_database");
    const settings=await client.query("SELECT organization_id, version, offline_lease_hours, reminder_audience, appointment_reminder_minutes_before, overdue_reminders_enabled, overdue_repeat_hours, updated_by FROM mentoring.organization_settings ORDER BY organization_id");
    const expectedSettings={organization_id:manifest.organizationId,version:1,offline_lease_hours:24,reminder_audience:"responsible_team",appointment_reminder_minutes_before:0,overdue_reminders_enabled:true,overdue_repeat_hours:null,updated_by:null};
    if (settings.rows.length!==1 || !same(settings.rows[0],expectedSettings)) fail("nonempty_database");
    const counts=await client.query(COUNT_SQL);
    if (counts.rows.length!==APPLICATION_TABLES.length || new Set(counts.rows.map(row=>row.table_name)).size!==APPLICATION_TABLES.length || counts.rows.some(row=>!APPLICATION_TABLES.includes(row.table_name) || !/^\d+$/.test(row.row_count))) fail("nonempty_database");
    if (counts.rows.some(row=>!["memberships","operations","audit"].includes(row.table_name) && row.row_count!=="0")) fail("nonempty_database");
    const report={ownerCount:manifest.owners.length,approvalDigest:digest,clerkInstanceId:manifest.clerk.instanceId,providerProjectId:manifest.provider.projectId,providerBranchId:manifest.provider.branchId,host:manifest.database.host,database:manifest.database.name,role:manifest.database.role};
    if (counts.rows.some(row=>row.row_count!=="0")) {
      const memberships=await client.query("SELECT id, organization_id, auth_user_id, email, display_name, phone, role, active, version, coordinator_id, sms_muted, created_at, updated_at FROM mentoring.memberships ORDER BY id");
      const operations=await client.query("SELECT organization_id, actor_id, operation_id, payload_hash, response, created_at FROM mentoring.operations ORDER BY operation_id");
      const audits=await client.query("SELECT id, organization_id, actor_id, operation_id, action, participant_id, details, created_at FROM mentoring.audit ORDER BY id");
      if (!exactReplay(manifest,digest,memberships.rows,operations.rows,audits.rows)) fail("conflict");
      await client.query(apply?"COMMIT":"ROLLBACK"); transaction=false; return {...report,state:"already_preapproved"};
    }
    if (!apply) { await client.query("ROLLBACK"); transaction=false; return {...report,state:"ready_to_preapprove"}; }
    const time=await client.query("SELECT transaction_timestamp() AS created_at"); const createdAt=iso(time.rows[0]?.created_at);
    if (!validIso(createdAt)) fail("database_error");
    for (const owner of manifest.owners) {
      await client.query("INSERT INTO mentoring.memberships (id, organization_id, auth_user_id, email, display_name, phone, role, active, version, coordinator_id, sms_muted, created_at, updated_at) VALUES ($1, $2, NULL, $3, $4, NULL, 'ceo', true, 1, NULL, false, $5, $5)",[owner.membershipId,manifest.organizationId,owner.email,owner.displayName,createdAt]);
    }
    const actorId=manifest.owners[0].membershipId;
    for (const owner of manifest.owners) {
      await client.query("INSERT INTO mentoring.operations (organization_id, actor_id, operation_id, payload_hash, response, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",[manifest.organizationId,actorId,owner.operationId,digest,JSON.stringify(receipt(manifest,owner,digest,createdAt)),createdAt]);
      await client.query("INSERT INTO mentoring.audit (id, organization_id, actor_id, operation_id, action, participant_id, details, created_at) VALUES ($1, $2, $3, $4, 'production_owner_preapproved', NULL, $5::jsonb, $6)",[owner.auditId,manifest.organizationId,actorId,owner.operationId,JSON.stringify(auditDetails(manifest,owner,digest)),createdAt]);
    }
    await client.query("COMMIT"); transaction=false; return {...report,state:"preapproved"};
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(()=>{});
    if (error instanceof ProductionBootstrapError) throw error;
    fail("database_error");
  }
}

export function safeFailure(error) { const code=error instanceof ProductionBootstrapError?error.code:"database_error"; return {error:code,message:MESSAGES[code]}; }
