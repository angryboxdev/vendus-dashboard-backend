Status: in-progress (catálogo + migração feitos)
Blocked by: 01

# Modelo de dados e migração

Tabelas `access_profiles` (org, nome, descrição, sistema/protegido, ativo, version), `access_profile_permissions`, `member_permission_overrides`; `org_members.profile_id`, `status active|disabled`, `version`. Seed dos perfis (U2) por organização e conversão dos membros (U11). RLS + TABLE_REGISTRY. Migração única, aditiva, para o Raul.
