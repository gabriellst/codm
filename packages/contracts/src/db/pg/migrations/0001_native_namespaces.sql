-- T1.9 — o namespace deixa de ser prefixo no nome e passa a ser SCHEMA nativo do Postgres.
--
-- ESCRITA À MÃO, e o motivo importa. O `drizzle-kit generate` não consegue produzir esta migração
-- sem um humano no terminal: ele vê 13 tabelas sumirem e 13 aparecerem, e abre um prompt por tabela
-- perguntando "renomeou ou é nova?" (`promptNamedWithSchemasConflict`). Sem TTY ele aborta; com TTY,
-- responder "nova" 13 vezes geraria DROP + CREATE — e DROP de tabela com dado dentro é a diferença
-- entre uma migração e um incidente.
--
-- Então o SQL é autoral e o SNAPSHOT é gerado: `meta/0001_snapshot.json` saiu do próprio drizzle-kit
-- rodando contra um diretório de rascunho vazio, onde não há estado anterior e portanto não há
-- pergunta. As duas metades descrevem o mesmo destino por caminhos independentes, e a prova de que
-- concordam é que um `drizzle:generate:cloud` seguinte não encontra mais nada a fazer.
--
-- PRESERVA DADO. `SET SCHEMA` + `RENAME TO` movem a tabela existente com suas linhas, índices,
-- constraints e sequences. Nada é recriado, nada é copiado, e a migração é igualmente correta num
-- banco vazio e num banco em uso.
--
-- A quarta seção existe porque o drizzle DERIVA o nome de constraint do nome da tabela: com a tabela
-- renomeada, `authentication_users_email_unique` viraria `users_email_unique` na próxima geração, e
-- o snapshot passaria a discordar do banco numa coisa que ninguém olha até quebrar. Os dois CHECK
-- (`owner_owners_kind_check`, `owner_onboardings_current_step_check`) NÃO aparecem ali: eles têm
-- nome explícito no código, então não derivam de nada e não mudam.
CREATE SCHEMA "authentication";
--> statement-breakpoint
CREATE SCHEMA "owner";
--> statement-breakpoint
CREATE SCHEMA "shared";
--> statement-breakpoint

-- 1. mover para o schema dono (a tabela vai inteira: linhas, índices, constraints)
ALTER TABLE "authentication_users" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_accounts" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_sessions" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_verification_tokens" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_user_profiles" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_device_tokens" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "authentication_device_codes" SET SCHEMA "authentication";
--> statement-breakpoint
ALTER TABLE "owner_owners" SET SCHEMA "owner";
--> statement-breakpoint
ALTER TABLE "owner_onboardings" SET SCHEMA "owner";
--> statement-breakpoint
ALTER TABLE "shared_events" SET SCHEMA "shared";
--> statement-breakpoint
ALTER TABLE "shared_outbox" SET SCHEMA "shared";
--> statement-breakpoint
ALTER TABLE "shared_idempotency_keys" SET SCHEMA "shared";
--> statement-breakpoint
ALTER TABLE "shared_scheduled_commands" SET SCHEMA "shared";
--> statement-breakpoint

-- 2. tirar o prefixo do nome — o schema já diz o que ele dizia
ALTER TABLE "authentication"."authentication_users" RENAME TO "users";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_accounts" RENAME TO "accounts";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_sessions" RENAME TO "sessions";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_verification_tokens" RENAME TO "verification_tokens";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_user_profiles" RENAME TO "user_profiles";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_device_tokens" RENAME TO "device_tokens";
--> statement-breakpoint
ALTER TABLE "authentication"."authentication_device_codes" RENAME TO "device_codes";
--> statement-breakpoint
ALTER TABLE "owner"."owner_owners" RENAME TO "owners";
--> statement-breakpoint
ALTER TABLE "owner"."owner_onboardings" RENAME TO "onboardings";
--> statement-breakpoint
ALTER TABLE "shared"."shared_events" RENAME TO "events";
--> statement-breakpoint
ALTER TABLE "shared"."shared_outbox" RENAME TO "outbox";
--> statement-breakpoint
ALTER TABLE "shared"."shared_idempotency_keys" RENAME TO "idempotency_keys";
--> statement-breakpoint
ALTER TABLE "shared"."shared_scheduled_commands" RENAME TO "scheduled_commands";
--> statement-breakpoint

-- 3. alinhar os nomes DERIVADOS de constraint com o nome novo da tabela
ALTER TABLE "authentication"."users" RENAME CONSTRAINT "authentication_users_email_unique" TO "users_email_unique";
--> statement-breakpoint
ALTER TABLE "authentication"."sessions" RENAME CONSTRAINT "authentication_sessions_token_unique" TO "sessions_token_unique";
--> statement-breakpoint
ALTER TABLE "authentication"."device_tokens" RENAME CONSTRAINT "authentication_device_tokens_token_hash_unique" TO "device_tokens_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "authentication"."accounts" RENAME CONSTRAINT "authentication_accounts_user_id_authentication_users_id_fk" TO "accounts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "authentication"."sessions" RENAME CONSTRAINT "authentication_sessions_user_id_authentication_users_id_fk" TO "sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "authentication"."user_profiles" RENAME CONSTRAINT "authentication_user_profiles_id_authentication_users_id_fk" TO "user_profiles_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "authentication"."device_tokens" RENAME CONSTRAINT "authentication_device_tokens_user_id_authentication_users_id_fk" TO "device_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "authentication"."device_codes" RENAME CONSTRAINT "authentication_device_codes_user_id_authentication_users_id_fk" TO "device_codes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shared"."idempotency_keys" RENAME CONSTRAINT "shared_idempotency_keys_key_scope_pk" TO "idempotency_keys_key_scope_pk";
