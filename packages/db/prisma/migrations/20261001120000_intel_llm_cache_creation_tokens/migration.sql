-- A API devolve o uso do cache de prompt em dois campos: o que foi lido
-- (cache_read_input_tokens, já gravado em "cacheReadTokens") e o que foi
-- escrito (cache_creation_input_tokens). Sem o segundo não dá para distinguir
-- "nunca cacheou" de "grava e ninguém lê" — e input_tokens exclui os dois,
-- então o total processado por chamada só fecha com as três colunas.
ALTER TABLE "intel_llm_cache"
  ADD COLUMN "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0;
