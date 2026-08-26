-- Remove o cadastro de "tipo de usuário": era decorativo (nada ramificava por
-- ele), duplicava os dois valores do enum Role e chegava vazio em staging.
--
-- IF EXISTS em tudo porque staging e produção receberam colunas por
-- `prisma db push` no passado (ver 20260820000000_baseline_drift): o nome da
-- constraint pode divergir e uma migration que falha trava o deploy inteiro.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_userTypeId_fkey";

ALTER TABLE "users" DROP COLUMN IF EXISTS "userTypeId";

DROP TABLE IF EXISTS "user_types";
