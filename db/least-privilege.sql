-- ============================================================
-- Valfritt: separat applikationskonto med minimala rättigheter
-- ============================================================
-- Kör som databasägaren (rbac_user) EFTER att schemat och alla
-- migrationer är applicerade:
--
--   docker compose exec -T db psql -U rbac_user rbac_access \
--     -v app_password="'<starkt-losenord>'" -f /docker-entrypoint-initdb.d/least-privilege.sql
--
-- Peka sedan backend mot det nya kontot i .env:
--   DB_USER=rbac_app
--   DB_PASSWORD=<starkt-losenord>
--
-- OBS: rbac_app får INTE skapa/ändra tabeller. Kör därför migrationer
-- separat som rbac_user (MIGRATIONS med ägarkontot) innan uppgradering,
-- eller sätt tillfälligt tillbaka DB_USER=rbac_user vid deploy.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rbac_app') THEN
    EXECUTE format('CREATE ROLE rbac_app LOGIN PASSWORD %L', current_setting('app_password', true));
  END IF;
END
$$;

-- Anslutning och läsning av schemat
GRANT CONNECT ON DATABASE rbac_access TO rbac_app;
GRANT USAGE ON SCHEMA public TO rbac_app;

-- Data: läsa och skriva, men inte ändra strukturen
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rbac_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rbac_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO rbac_app;

-- Samma rättigheter för framtida objekt som ägaren skapar
ALTER DEFAULT PRIVILEGES FOR ROLE rbac_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rbac_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rbac_user IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rbac_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rbac_user IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO rbac_app;

-- Explicit: inga strukturändringar
REVOKE CREATE ON SCHEMA public FROM rbac_app;
