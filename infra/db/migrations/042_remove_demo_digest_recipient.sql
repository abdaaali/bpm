-- Remove the personal/demo recipient previously inserted by migration 036.
-- Recipient lists are operational tenant data and must be configured explicitly.
DELETE FROM digest_recipients
WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND email = 'a.meissa@sd.zain.com';
