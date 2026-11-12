-- Row-level security for ZMNHOOF OS. Identical on PGlite (local) and PostgreSQL / Neon (production).
-- The app connects as the owner, then runs each request inside a transaction that does:
--   SET LOCAL ROLE app_user;  select set_config('app.role', '<role>', true);  select set_config('app.user_id', '<id>', true);
-- app_user is not a superuser and does not own the tables, so these policies are enforced.
-- RLS is row-level: column masking of rent for investors is applied in src/lib/access.ts (listed as a known gap).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
REVOKE UPDATE, DELETE ON audit_events FROM app_user;

CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.role', true), '') $$;
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.user_id', true), '') $$;

-- Financial tables: investor and manager only. The administrator sees governance, never financial content.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','tenants','leases','documents','valuations','value_history','scenarios']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS fin_read ON %I', t);
    EXECUTE format($p$CREATE POLICY fin_read ON %I FOR SELECT TO app_user USING (app_role() IN ('investor','manager'))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS fin_write ON %I', t);
    EXECUTE format($p$CREATE POLICY fin_write ON %I FOR ALL TO app_user USING (app_role() = 'manager') WITH CHECK (app_role() = 'manager')$p$, t);
  END LOOP;
END $$;

-- Valuations: investors may also propose (insert) and see their own drafts; only managers confirm (update).
DROP POLICY IF EXISTS val_propose ON valuations;
CREATE POLICY val_propose ON valuations FOR INSERT TO app_user
  WITH CHECK (app_role() IN ('investor','manager') AND proposed_by = app_user_id() AND status IN ('draft','in_review'));
DROP POLICY IF EXISTS val_separation ON valuations;
CREATE POLICY val_separation ON valuations AS RESTRICTIVE FOR UPDATE TO app_user
  USING (proposed_by <> app_user_id()) WITH CHECK (proposed_by <> app_user_id());

-- Income and costs: manager only. Hidden from the investor role.
ALTER TABLE cashflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cf_read ON cashflows;
CREATE POLICY cf_read ON cashflows FOR SELECT TO app_user USING (app_role() = 'manager');
DROP POLICY IF EXISTS cf_write ON cashflows;
CREATE POLICY cf_write ON cashflows FOR ALL TO app_user USING (app_role() = 'manager') WITH CHECK (app_role() = 'manager');

-- Audit log: append-only for everyone, readable by the administrator only.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read ON audit_events;
CREATE POLICY audit_read ON audit_events FOR SELECT TO app_user USING (app_role() = 'admin');
DROP POLICY IF EXISTS audit_insert ON audit_events;
CREATE POLICY audit_insert ON audit_events FOR INSERT TO app_user WITH CHECK (true);

-- Alerts and approvals route to a role.
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerts_read ON alerts;
CREATE POLICY alerts_read ON alerts FOR SELECT TO app_user
  USING (route_role = app_role() OR app_role() = 'manager' OR (app_role() = 'investor' AND kind IN ('lease_renewal','missing_document')));
DROP POLICY IF EXISTS alerts_write ON alerts;
CREATE POLICY alerts_write ON alerts FOR ALL TO app_user USING (app_role() = 'manager') WITH CHECK (app_role() = 'manager');

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appr_read ON approvals;
CREATE POLICY appr_read ON approvals FOR SELECT TO app_user USING (route_role = app_role() OR proposed_by = app_user_id());
DROP POLICY IF EXISTS appr_insert ON approvals;
CREATE POLICY appr_insert ON approvals FOR INSERT TO app_user WITH CHECK (proposed_by = app_user_id());
DROP POLICY IF EXISTS appr_decide ON approvals;
CREATE POLICY appr_decide ON approvals FOR UPDATE TO app_user
  USING (route_role = app_role() AND proposed_by <> app_user_id());

-- Investor updates: drafts are visible to managers only.
ALTER TABLE investor_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upd_read ON investor_updates;
CREATE POLICY upd_read ON investor_updates FOR SELECT TO app_user
  USING (app_role() IN ('investor','manager') AND (status = 'published' OR app_role() = 'manager'));
DROP POLICY IF EXISTS upd_write ON investor_updates;
CREATE POLICY upd_write ON investor_updates FOR ALL TO app_user USING (app_role() = 'manager') WITH CHECK (app_role() = 'manager');
