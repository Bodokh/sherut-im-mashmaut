-- Offline-created participant/contact IDs are operation UUIDs. They share one
-- namespace because CEO protection identifies a resource by organization + UUID.
CREATE TABLE mentoring.resource_ids (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES mentoring.organizations (id),
  kind text NOT NULL CHECK (kind IN ('participant', 'contact')),
  UNIQUE (organization_id, id)
);

INSERT INTO mentoring.resource_ids (id, organization_id, kind)
SELECT id, organization_id, 'participant' FROM mentoring.participants;

-- Deliberately fail atomically if historic data contains a cross-kind collision.
INSERT INTO mentoring.resource_ids (id, organization_id, kind)
SELECT id, organization_id, 'contact' FROM mentoring.contacts;

ALTER TABLE mentoring.participants ADD CONSTRAINT participants_resource_id_fk
  FOREIGN KEY (organization_id, id) REFERENCES mentoring.resource_ids (organization_id, id);
ALTER TABLE mentoring.contacts ADD CONSTRAINT contacts_resource_id_fk
  FOREIGN KEY (organization_id, id) REFERENCES mentoring.resource_ids (organization_id, id);
ALTER TABLE mentoring.ceo_protections ADD CONSTRAINT ceo_protections_resource_id_fk
  FOREIGN KEY (organization_id, resource_id) REFERENCES mentoring.resource_ids (organization_id, id);
