# Plano de piloto — Addere

## Critérios de seleção do cliente piloto

### Perfil ideal
- Usa Protheus ERP (qualquer versão com REST habilitado)
- 3–10 representantes externos (não só internos)
- Ciclo de vendas com pedidos frequentes (mínimo 10/semana)
- Gestor comercial engajado e disponível para acompanhar
- Disposição para fornecer feedback honesto

### Critérios de exclusão
- Processo de pedidos exclusivamente por EDI/integração automática
- Infraestrutura Protheus sem acesso REST externo (VPN complexa)
- Equipe sem smartphones compatíveis (Android 10+ ou iOS 14+)

---

## Cronograma de 30 dias

### Semana 1 — Onboarding (dias 1–7)
| Dia | Ação |
|-----|------|
| 1 | Reunião de kickoff com gestor + configurar ambiente (API Protheus, empresa no admin) |
| 2 | Instalar app nos dispositivos dos representantes |
| 3 | Treinamento presencial ou videochamada (45 min) com todos os reps |
| 4–7 | Uso supervisionado — Gustavo disponível via WhatsApp para dúvidas em horário comercial |

### Semanas 2–3 — Uso real (dias 8–21)
- Representantes usam o app em suas rotinas normais de vendas
- Check-in semanal com o gestor (30 min toda segunda-feira)
- Relatório semanal automático enviado toda segunda-feira às 8h
- Monitoramento contínuo via dashboard de piloto

### Semana 4 — Avaliação (dias 22–30)
| Dia | Ação |
|-----|------|
| 22 | Revisão das métricas com gestor + análise do período |
| 25 | Entrevista rápida com 2–3 representantes (10 min cada) |
| 28 | Apresentação dos resultados finais para o gestor |
| 30 | Decisão: continuar, expandir ou encerrar |

---

## Responsabilidades

### Gustavo (responsável técnico Addere)
- Configurar integração com o Protheus do cliente (URLs, credenciais, mapeamento de campos)
- Suporte técnico via WhatsApp em horário comercial (08h–18h dias úteis)
- Enviar análise resumida junto com o relatório semanal automático
- Corrigir bugs críticos em até 24h úteis
- Monitorar dashboard de piloto e alertar o cliente em caso de anomalias

### Cliente (gestor comercial)
- Garantir que os representantes usem o app para pedidos reais (não apenas em testes)
- Responder ao check-in semanal (30 min — obrigatório)
- Liberar acesso à API do Protheus para testes e sincronização
- Coletar impressões informais dos representantes durante o período

---

## Métricas de sucesso

Critérios para conversão em cliente pagante ao final do piloto:

| Métrica | Meta | Crítico (abaixo = problema) |
|---------|------|-----------------------------|
| Tempo médio por pedido | < 5 min | > 10 min |
| Taxa de sincronização | > 98% | < 95% |
| Pedidos emitidos em campo | > 50% | < 20% |
| Tempo médio de sync | < 30s | > 5 min |
| NPS dos representantes | > 7 | < 5 |

> **Avaliação de NPS**: pergunta simples no último dia — "De 0 a 10, quanto você recomendaria o Addere?" — enviada por formulário Google ou WhatsApp.

---

## Critérios de saída antecipada

Encerrar o piloto imediatamente se:
- Taxa de sync < 90% por **mais de 3 dias consecutivos** sem resolução identificada
- **Bug crítico** (pedido perdido ou duplicado no Protheus) sem resolução em 48h úteis
- Cliente solicitar encerramento por qualquer motivo
- Nenhum representante usar o app por mais de 5 dias corridos

---

## Proposta de valor pós-piloto

Com resultados positivos (todas as metas atingidas), apresentar proposta comercial:

### Modelo de precificação
- **Plano por representante ativo/mês**: cobrança baseada em usuários que emitiram ao menos 1 pedido no mês
- Inclui: app mobile (iOS + Android), painel admin, integrações Protheus, suporte, atualizações automáticas

### Comparativo de ROI
| Item | Cálculo exemplo |
|------|-----------------|
| Tempo economizado por pedido | 10 min → 4 min = 6 min de economia |
| Pedidos por rep/mês | ~80 pedidos |
| Economia total/rep/mês | 8h de trabalho |
| Custo mensal do plano | R$ X/rep |
| Break-even | ~1–2 pedidos a mais por mês pela agilidade |

### Apresentação dos resultados
Usar os dados reais do piloto para mostrar:
1. Evolução da taxa de sync semana a semana
2. Quantidade de pedidos feitos em campo (sem sinal)
3. Redução do tempo médio por pedido vs estimativa anterior
4. Feedbacks positivos dos representantes (anonimizados)

---

## Configuração técnica inicial

### Checklist pré-piloto
- [ ] API Protheus com acesso REST externo (testar com curl)
- [ ] Criar empresa no painel admin (CNPJ, nome, URLs Protheus)
- [ ] Sincronizar catálogo de produtos (`POST /sync/products`)
- [ ] Sincronizar clientes (`POST /sync/customers`)
- [ ] Sincronizar transportadoras e condições de pagamento
- [ ] Criar usuários para cada representante (role: SALESPERSON)
- [ ] Criar registro de piloto no banco (clientName, startDate, endDate)
- [ ] Instalar app em todos os dispositivos (via TestFlight/Firebase App Distribution)
- [ ] Testar criação de pedido online e offline com 1 rep antes do lançamento

### Pós-configuração
- Verificar que `POST /pilot/events` retorna 204 após login
- Confirmar que relatório semanal será enviado na próxima segunda-feira
- Validar que dashboard `/piloto?pilotId=...` carrega as métricas
