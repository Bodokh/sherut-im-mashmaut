import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  APPLICATION_TABLES, ProductionBootstrapError, executePreapproval, loadMigrations,
  parseBootstrapArguments, productionConnectionConfig, readApprovalFile,
  safeFailure, validateManifest,
} from "../../../scripts/mentoring/production-owner-preapproval.mjs";

const organizationId = "11111111-1111-4111-8111-111111111111";
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12,"0")}`;
const manifest = () => ({
  version: 1, environment: "production", mode: "unbound_email_preapproval", organizationId,
  approval: { reference: "explicit-initial-owner-approval", operator: "release-operator", approvedAt: "2026-10-27T09:00:00.000Z" },
  provider: { name: "neon", resourceId: "ir_testProduction", projectId: "test-production-project", branchId: "br-test-production" },
  database: { host: "ep-test-production.eu-central-1.aws.neon.tech", name: "mentoring_production", role: "production_owner" },
  clerk: { instanceId: "ins_testProduction", frontendHostname: "clerk.example.org" },
  owners: [1,2,3].map((index) => ({ membershipId: uuid(index), operationId: uuid(index+10), auditId: uuid(index+20), email: `owner${index}@example.org`, displayName: `Approved owner ${index}` })),
});
const environment = (input = manifest()) => ({
  NODE_ENV: "production",
  MENTORING_PRODUCTION_DATABASE_URL: `postgresql://production_owner:synthetic-password@${input.database.host}/mentoring_production?sslmode=require`,
  MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from(`${input.clerk.frontendHostname}$`).toString("base64")}`,
});
const migrations = [{ filename: "001_example.sql", checksum: "a".repeat(64) }];
const initialSettings = { organization_id: organizationId, version: 1, offline_lease_hours: 24, reminder_audience: "responsible_team", appointment_reminder_minutes_before: 0, overdue_reminders_enabled: true, overdue_repeat_hours: null, updated_by: null };

class FakeClient {
  constructor() {
    this.state = { organizations: [{id:organizationId}], settings: [{...initialSettings}], memberships: [], operations: [], audit: [], counts: {}, migrations: structuredClone(migrations) };
    this.calls = [];
    this.writes = 0;
    this.failWrite = null;
  }
  async query(sql, values = []) {
    this.calls.push({sql,values});
    const compact = sql.replace(/\s+/g," ").trim();
    if (compact.startsWith("BEGIN")) { this.before = structuredClone(this.state); return { rows: [] }; }
    if (compact === "ROLLBACK") { this.state = this.before; return { rows: [] }; }
    if (compact === "COMMIT") { this.before = null; return { rows: [] }; }
    if (compact.startsWith("SET LOCAL") || compact.startsWith("LOCK TABLE") || compact.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (compact.includes("current_database()")) return { rows: [{ database_name: "mentoring_production", role_name: "production_owner" }] };
    if (compact.includes("FROM pg_catalog.pg_tables")) return {rows: [...APPLICATION_TABLES,"organizations","organization_settings","schema_migrations"].map(tablename=>({tablename, row_security:false, force_row_security:false}))};
    if (compact.includes("FROM mentoring.schema_migrations")) return {rows: this.state.migrations.map(row=>({version:row.filename,checksum:row.checksum}))};
    if (compact.includes("AS table_name")) return {rows: APPLICATION_TABLES.map(table_name=>({ table_name, row_count: String(["memberships","operations","audit"].includes(table_name)?this.state[table_name].length:(this.state.counts[table_name]??0)) }))};
    if (compact.includes("FROM mentoring.organizations")) return {rows: structuredClone(this.state.organizations)};
    if (compact.includes("FROM mentoring.organization_settings")) return {rows: structuredClone(this.state.settings)};
    if (compact.startsWith("SELECT") && compact.includes("FROM mentoring.memberships")) return {rows: structuredClone(this.state.memberships)};
    if (compact.startsWith("SELECT") && compact.includes("FROM mentoring.operations")) return {rows: structuredClone(this.state.operations)};
    if (compact.startsWith("SELECT") && compact.includes("FROM mentoring.audit")) return {rows: structuredClone(this.state.audit)};
    if (compact.includes("transaction_timestamp()")) return {rows:[{created_at:new Date("2026-10-27T10:00:00.000Z")}]};
    if (compact.startsWith("INSERT")) {
      this.writes += 1;
      if (this.failWrite === this.writes) throw new Error("postgresql://unprintable-secret@wrong-host/private-owner@example.org");
      if (compact.includes("mentoring.memberships")) {
        const [id,organization_id,email,display_name,created_at] = values;
        this.state.memberships.push({id,organization_id,email,display_name,created_at,updated_at:created_at,auth_user_id:null,phone:null,role:"ceo",active:true,version:1,coordinator_id:null,sms_muted:false});
      } else if (compact.includes("mentoring.operations")) {
        const [organization_id,actor_id,operation_id,payload_hash,response,created_at]=values;
        this.state.operations.push({organization_id,actor_id,operation_id,payload_hash,response:JSON.parse(response),created_at});
      } else if (compact.includes("mentoring.audit")) {
        const [id,organization_id,actor_id,operation_id,details,created_at]=values;
        this.state.audit.push({id,organization_id,actor_id,operation_id,action:"production_owner_preapproved",participant_id:null,details:JSON.parse(details),created_at});
      } else throw new Error("Unexpected insert");
      return {rowCount:1,rows:[]};
    }
    throw new Error(`Unexpected test SQL: ${compact}`);
  }
}

test("approval manifest accepts only deliberate production unbound-email preapproval and unique approved owners", () => {
  assert.deepEqual(validateManifest(manifest()), manifest());
  for (const mutate of [
    m=>{m.environment="development";}, m=>{m.mode="promote_existing";}, m=>{m.organizationId=uuid(99);},
    m=>{m.owners=[];}, m=>{m.owners[1].email=m.owners[0].email;}, m=>{m.owners[1].membershipId=m.owners[0].operationId;},
    m=>{m.owners[0].authUserId="user_existing";}, m=>{m.owners[0].email=" Owner@example.org ";},
    m=>{m.database.connectionString="secret";}, m=>{m.clerk.frontendHostname="test.clerk.accounts.dev";},
    m=>{m.approval.reference=null;}, m=>{m.database.name=null;}, m=>{m.database.role=42;},
  ]) { const input=manifest(); mutate(input); assert.throws(()=>validateManifest(input), ProductionBootstrapError); }
});

test("production connection refuses accidental dev, pooler, target, transport, and public-key mismatches", () => {
  const input=manifest(); const valid=environment(input);
  const config=productionConnectionConfig(valid,input);
  assert.equal(config.host,input.database.host); assert.equal(config.database,input.database.name); assert.equal(config.user,input.database.role);
  assert.deepEqual(config.ssl,{rejectUnauthorized:true});
  assert.equal(config.enableChannelBinding,true);
  for (const patch of [
    {NODE_ENV:"development"}, {VERCEL_ENV:"preview"}, {MENTORING_PRODUCTION_DATABASE_URL:undefined},
    {MENTORING_PRODUCTION_DATABASE_URL:valid.MENTORING_PRODUCTION_DATABASE_URL.replace("ep-test-production.","ep-test-production-pooler.")},
    {MENTORING_PRODUCTION_DATABASE_URL:valid.MENTORING_PRODUCTION_DATABASE_URL.replace("production_owner:","dev_owner:")},
    {MENTORING_PRODUCTION_DATABASE_URL:valid.MENTORING_PRODUCTION_DATABASE_URL.replace("/mentoring_production?","/development?")},
    {MENTORING_PRODUCTION_DATABASE_URL:`${valid.MENTORING_PRODUCTION_DATABASE_URL}&host=attacker.example.org`},
    {MENTORING_PRODUCTION_DATABASE_URL:valid.MENTORING_PRODUCTION_DATABASE_URL.replace("sslmode=require","sslmode=disable")},
    {MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY:valid.MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY.replace("pk_live_","pk_test_")},
    {MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY:`pk_live_${Buffer.from("clerk.wrong.example.org$").toString("base64")}`},
  ]) assert.throws(()=>productionConnectionConfig({...valid,...patch},input),ProductionBootstrapError);
});

test("CLI is explicit, strict and read-only by default", () => {
  assert.equal(parseBootstrapArguments(["--help"]),null);
  assert.deepEqual(parseBootstrapArguments(["--production","--approval-file","/private/approval.json"]),{approvalFile:"/private/approval.json",apply:false});
  assert.equal(parseBootstrapArguments(["--production","--approval-file","/private/approval.json","--apply"]).apply,true);
  for (const args of [[],["--approval-file","/private/approval.json"],["--production","--approval-file","relative.json"],["--production","--approval-file","/private/approval.json","--force"]]) assert.throws(()=>parseBootstrapArguments(args),ProductionBootstrapError);
});

test("actual CLI help is credential-free and wrong environment fails before reading an approval file", () => {
  const script=fileURLToPath(new URL("../../../scripts/mentoring/bootstrap-production-owners.mjs",import.meta.url));
  const help=spawnSync(process.execPath,[script,"--help"],{encoding:"utf8",env:{NODE_ENV:"development"}});
  assert.equal(help.status,0); assert.match(help.stdout,/Read-only preflight is the default/);
  const refused=spawnSync(process.execPath,[script,"--production","--approval-file","/nonexistent/private-approval.json"],{encoding:"utf8",env:{NODE_ENV:"development"}});
  assert.equal(refused.status,1); assert.equal(JSON.parse(refused.stderr).error,"wrong_environment");
  assert.equal(refused.stdout,""); assert.ok(!refused.stderr.includes("private-approval.json"));
});

test("approval file must be private, regular, bounded JSON and cannot be a symlink", async () => {
  const directory=await mkdtemp(path.join(tmpdir(),"mentoring-owner-preapproval-"));
  try {
    const file=path.join(directory,"approval.json"); await writeFile(file,JSON.stringify(manifest()),{mode:0o600});
    assert.deepEqual(await readApprovalFile(file),manifest());
    await chmod(file,0o644); await assert.rejects(readApprovalFile(file),ProductionBootstrapError);
    await chmod(file,0o600); const link=path.join(directory,"link.json"); await symlink(file,link); await assert.rejects(readApprovalFile(link),ProductionBootstrapError);
    await writeFile(file,"x".repeat(65_537)); await assert.rejects(readApprovalFile(file),ProductionBootstrapError);
    await writeFile(file,'{"email":"private-owner@example.org",'); await assert.rejects(readApprovalFile(file),ProductionBootstrapError);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("migration verification uses all current ordered source checksums", async () => {
  const source=await loadMigrations();
  assert.equal(source.length,6); assert.equal(source[0].filename,"001_initial.sql"); assert.equal(source.at(-1).filename,"006_reminders.sql");
  assert.ok(source.every(row=>/^[a-f0-9]{64}$/.test(row.checksum)));
});

test("default preflight performs no insert, commit, row lock or membership change", async () => {
  const client=new FakeClient(); const before=structuredClone(client.state);
  const result=await executePreapproval(client,manifest(),migrations,{apply:false});
  assert.equal(result.state,"ready_to_preapprove"); assert.equal(result.ownerCount,3); assert.deepEqual(client.state,before);
  assert.ok(client.calls[0].sql.includes("READ ONLY"));
  assert.equal(client.writes,0); assert.ok(!client.calls.some(call=>/INSERT|FOR UPDATE|LOCK TABLE|^COMMIT$/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql,"ROLLBACK");
});

test("initial apply atomically writes approved NULL-bound CEOs with matching receipts and external-approval audits", async () => {
  const client=new FakeClient(); const input=manifest();
  const result=await executePreapproval(client,input,migrations,{apply:true});
  assert.equal(result.state,"preapproved"); assert.equal(result.ownerCount,3);
  assert.equal(client.state.memberships.length,3); assert.equal(client.state.operations.length,3); assert.equal(client.state.audit.length,3);
  assert.ok(client.state.memberships.every(row=>row.auth_user_id===null&&row.role==="ceo"&&row.active===true&&row.version===1));
  for (const [index,event] of client.state.audit.entries()) {
    assert.equal(event.actor_id,input.owners[0].membershipId); assert.equal(event.details.mode,"external_operator_preapproval");
    assert.equal(event.details.approvalReference,input.approval.reference); assert.equal(event.details.targetMembershipId,input.owners[index].membershipId);
    assert.ok(client.state.operations.some(row=>row.operation_id===event.operation_id&&row.actor_id===event.actor_id));
    assert.ok(!JSON.stringify(event.details).includes("@example.org"));
  }
  assert.ok(client.calls.some(call=>call.sql.startsWith("LOCK TABLE"))); assert.equal(client.calls.at(-1).sql,"COMMIT");
});

test("exact replay is a no-op; different approval, changed identity, revocation, timestamps, and receipts refuse", async () => {
  const original=new FakeClient(); const input=manifest(); await executePreapproval(original,input,migrations,{apply:true});
  const before=structuredClone(original.state); original.writes=0;
  assert.equal((await executePreapproval(original,input,migrations,{apply:true})).state,"already_preapproved");
  assert.equal(original.writes,0); assert.deepEqual(original.state,before);
  for (const mutate of [
    c=>{c.state.memberships[0].auth_user_id="user_bound";}, c=>{c.state.memberships[0].active=false;},
    c=>{c.state.memberships[0].version=2;}, c=>{c.state.memberships[0].updated_at="2026-10-28T10:00:00.000Z";},
    c=>{c.state.memberships[0].role="coordinator";}, c=>{c.state.operations[0].payload_hash="b".repeat(64);},
    c=>{c.state.audit[0].details.mode="self_authorized";}, c=>{c.state.audit.pop();},
  ]) { const client=new FakeClient(); client.state=structuredClone(before); mutate(client); await assert.rejects(executePreapproval(client,input,migrations,{apply:true}),ProductionBootstrapError); assert.equal(client.writes,0); }
  const changed=manifest(); changed.approval.reference="different-approval"; await assert.rejects(executePreapproval(original,changed,migrations,{apply:true}),ProductionBootstrapError);
});

test("preflight and apply reject inherited QA/partial memberships, application data, changed seeds, unknown/RLS tables and migration drift", async () => {
  for (const apply of [false,true]) for (const mutate of [
    c=>{c.state.memberships.push({id:uuid(100),role:"ceo",active:false});}, c=>{c.state.counts.participants=1;},
    c=>{c.state.counts.reminder_attempts=1;}, c=>{c.state.organizations.push({id:uuid(200)});},
    c=>{c.state.settings[0].version=2;}, c=>{c.state.migrations[0].checksum="b".repeat(64);},
    c=>{c.state.migrations.push({filename:"999_unknown.sql",checksum:"a".repeat(64)});},
  ]) { const client=new FakeClient(); mutate(client); await assert.rejects(executePreapproval(client,manifest(),migrations,{apply}),ProductionBootstrapError); assert.equal(client.writes,0); }
  for (const kind of ["unknown_table","row_security","force_row_security"]) {
    const client=new FakeClient(); const base=client.query.bind(client);
    client.query=async(sql,values)=>{
      if (!sql.includes("FROM pg_catalog.pg_tables")) return base(sql,values);
      const rows=[...APPLICATION_TABLES,"organizations","organization_settings","schema_migrations"].map(tablename=>({tablename,row_security:false,force_row_security:false}));
      if (kind==="unknown_table") rows.push({tablename:"unknown_state",row_security:false,force_row_security:false});
      else rows.find(row=>row.tablename==="memberships")[kind]=true;
      return {rows};
    };
    await assert.rejects(executePreapproval(client,manifest(),migrations,{apply:true}),error=>error instanceof ProductionBootstrapError&&error.code==="migration_mismatch"); assert.equal(client.writes,0);
  }
});

test("truthy non-boolean apply cannot enter a write transaction", async () => {
  const client=new FakeClient();
  await assert.rejects(executePreapproval(client,manifest(),migrations,{apply:"false"}),error=>error instanceof ProductionBootstrapError&&error.code==="invalid_arguments");
  assert.equal(client.calls.length,0);
});

test("live database/role checks cannot be replaced by URL-only approval", async () => {
  const client=new FakeClient(); const base=client.query.bind(client); client.query=async(sql,values)=>sql.includes("current_database()")?{rows:[{database_name:"development",role_name:"development_owner"}]}:base(sql,values);
  await assert.rejects(executePreapproval(client,manifest(),migrations,{apply:true}),ProductionBootstrapError); assert.equal(client.writes,0);
});

test("every write failure rolls back the entire batch and provider/database narratives are redacted", async () => {
  for (let index=1;index<=9;index++) {
    const client=new FakeClient(); const before=structuredClone(client.state); client.failWrite=index;
    let failure;
    try { await executePreapproval(client,manifest(),migrations,{apply:true}); } catch(error) { failure=error; }
    assert.ok(failure instanceof ProductionBootstrapError); assert.equal(client.writes,index); assert.deepEqual(client.state,before); assert.equal(client.calls.at(-1).sql,"ROLLBACK");
    const text=JSON.stringify(safeFailure(failure)); assert.ok(!/secret|postgresql|private-owner|wrong-host/.test(text));
  }
  assert.deepEqual(safeFailure(new Error("sensitive narrative")),{error:"database_error",message:"Production owner preapproval failed. No private details were logged."});
});
