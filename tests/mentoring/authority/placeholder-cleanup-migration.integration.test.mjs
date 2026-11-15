import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const connectionString = process.env.MENTORING_PLACEHOLDER_MIGRATION_TEST_URL;
const allowedDatabases = ["mentoringqa", "mentoring_dev", "mentoring_placeholder_migration_test"];
const placeholder = "פלוני אלמוני";

test("migrations 015/016 backfill coordinators and remove only the placeholder record, idempotently", { skip: !connectionString, timeout: 30_000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(client.connectionParameters.host), "Use a disposable local database.");
  assert.ok(allowedDatabases.includes(client.connectionParameters.database), "Use a dedicated local test database.");
  await client.connect();
  try {
    await client.query("BEGIN");
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const ceo = randomUUID();
    const coordinator = randomUUID();
    const teamMentor = randomUUID();
    const loneMentor = randomUUID();
    const placeholderMentor = randomUUID();
    const placeholderBusyMentor = randomUUID();
    const placeholderLoginMentor = randomUUID();
    await client.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role) VALUES($1,$2,'Migration CEO','ceo'),($3,$2,'Migration coordinator','coordinator')", [ceo, organizationId, coordinator]);
    await client.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role,coordinator_id) VALUES($1,$2,'Team mentor','mentor',$3),($4,$2,'Lone mentor','mentor',NULL),($5,$2,$6,'mentor',NULL),($7,$2,$8,'mentor',NULL)", [teamMentor, organizationId, coordinator, loneMentor, placeholderMentor, placeholder, placeholderBusyMentor, `  ${placeholder}  `]);
    await client.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role,auth_user_id) VALUES($1,$2,$3,'mentor',$4)", [placeholderLoginMentor, organizationId, placeholder, `login-${placeholderLoginMentor}`]);

    async function card(name, { contact = false } = {}) {
      const id = randomUUID();
      await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'participant')", [id, organizationId]);
      await client.query("INSERT INTO mentoring.participants(id,organization_id,display_name,created_by) VALUES($1,$2,$3,$4)", [id, organizationId, name, ceo]);
      if (contact) {
        const contactId = randomUUID();
        await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'contact')", [contactId, organizationId]);
        await client.query("INSERT INTO mentoring.contacts(id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at,notes) VALUES($1,$2,$3,$4,'phone','completed',now(),now(),'Retained history')", [contactId, organizationId, id, ceo]);
        await client.query("INSERT INTO mentoring.contact_revisions(organization_id,contact_id,participant_id,revision,actor_id,method,outcome,occurred_at,received_at,notes,revised_by_staff_id,revised_at,change_kind) SELECT organization_id,id,participant_id,1,actor_id,method,outcome,occurred_at,received_at,notes,actor_id,received_at,'initial' FROM mentoring.contacts WHERE id=$1", [contactId]);
      }
      return id;
    }
    async function assign(participantId, mentorId, coordinatorId, { ended = false } = {}) {
      await client.query("INSERT INTO mentoring.assignments(id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,ended_at) VALUES($1,$2,$3,$4,$5,now() - interval '2 days',$6)", [randomUUID(), organizationId, participantId, mentorId, coordinatorId, ended ? new Date() : null]);
    }

    const emptyPlaceholder = await card(placeholder);
    await assign(emptyPlaceholder, loneMentor, null);
    await client.query("INSERT INTO mentoring.tracking_cards(id,organization_id,subject_kind,participant_id,status,status_at,notes,updated_by) VALUES($1,$2,'mentee',$3,'green',now(),'demo',$4)", [randomUUID(), organizationId, emptyPlaceholder, ceo]);
    const historyPlaceholder = await card(`  פלוני\u00a0 אלמוני `.replace("\u00a0", " "), { contact: true });
    const alreadyDeleted = await card(placeholder, { contact: true });
    await client.query("UPDATE mentoring.participants SET deleted_at=now(), deleted_by=$3, deletion_reason='manual', deleted_previous_lifecycle='active' WHERE organization_id=$1 AND id=$2", [organizationId, alreadyDeleted, ceo]);
    const realMentee = await card("Real mentee kept");
    const nameLookalike = await card("פלוני אלמוני נוסף");

    const nullTeam = await card("Backfill null coordinator");
    await assign(nullTeam, teamMentor, null);
    const namedTeam = await card("Keep explicit coordinator");
    await assign(namedTeam, teamMentor, ceo);
    const endedTeam = await card("Ended assignment untouched");
    await assign(endedTeam, teamMentor, null, { ended: true });
    const lonePerson = await card("Lone mentor mentee");
    await assign(lonePerson, loneMentor, null);
    const busyMentee = await card("Busy placeholder mentor mentee");
    await assign(busyMentee, placeholderBusyMentor, null);

    const snapshot = async () => ({
      participants: (await client.query("SELECT id,deleted_at,deleted_by,deletion_reason,deleted_previous_lifecycle,version FROM mentoring.participants ORDER BY id")).rows,
      assignments: (await client.query("SELECT id,coordinator_id,ended_at FROM mentoring.assignments ORDER BY id")).rows,
      staff: (await client.query("SELECT id,active,version FROM mentoring.memberships ORDER BY id")).rows,
    });
    const baseline = await snapshot();
    const run = async (file) => client.query(await readFile(new URL(`../../../db/mentoring/${file}`, import.meta.url), "utf8"));
    await run("015_assignment_coordinator_backfill.sql");
    await run("016_remove_placeholder_record.sql");
    const first = await snapshot();
    await run("015_assignment_coordinator_backfill.sql");
    await run("016_remove_placeholder_record.sql");
    assert.deepEqual(await snapshot(), first, "A second run changes nothing.");

    const find = (state, key, id) => state[key].find((row) => row.id === id);
    const assignmentFor = async (participantId) => (await client.query("SELECT coordinator_id FROM mentoring.assignments WHERE participant_id=$1", [participantId])).rows[0];
    assert.equal(find(first, "participants", emptyPlaceholder), undefined, "An empty placeholder card is purged.");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM mentoring.tracking_cards WHERE participant_id=$1", [emptyPlaceholder])).rows[0].count, 0);
    assert.equal(await assignmentFor(emptyPlaceholder), undefined);
    const soft = find(first, "participants", historyPlaceholder);
    assert.ok(soft.deleted_at, "A placeholder with contact history goes to the recycle bin.");
    assert.equal(soft.deleted_by, ceo);
    assert.equal(soft.deleted_previous_lifecycle, "active");
    assert.equal(soft.version, find(baseline, "participants", historyPlaceholder).version + 1);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE participant_id=$1", [historyPlaceholder])).rows[0].count, 1, "Contact history is retained.");
    assert.deepEqual(find(first, "participants", alreadyDeleted), find(baseline, "participants", alreadyDeleted), "An already deleted card with history is left alone.");
    assert.deepEqual(find(first, "participants", realMentee), find(baseline, "participants", realMentee));
    assert.deepEqual(find(first, "participants", nameLookalike), find(baseline, "participants", nameLookalike), "Only the exact placeholder name matches.");

    assert.equal((await assignmentFor(nullTeam)).coordinator_id, coordinator, "NULL coordinator is filled from the mentor's team.");
    assert.equal((await assignmentFor(namedTeam)).coordinator_id, ceo, "An explicit coordinator is never rewritten.");
    assert.equal((await assignmentFor(endedTeam)).coordinator_id, null, "Ended assignments are untouched.");
    assert.equal((await assignmentFor(lonePerson)).coordinator_id, null, "Mentors without a team stay without a coordinator.");

    assert.equal(find(first, "staff", placeholderMentor).active, false, "A placeholder staff row without login or mentees is deactivated, not deleted.");
    assert.equal(find(first, "staff", placeholderBusyMentor).active, true, "A placeholder staff member still holding a mentee stays active.");
    assert.equal(find(first, "staff", placeholderLoginMentor).active, true, "A placeholder name with a real login is never touched.");
    for (const id of [ceo, coordinator, teamMentor, loneMentor]) assert.deepEqual(find(first, "staff", id), find(baseline, "staff", id));
    assert.ok(busyMentee);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
