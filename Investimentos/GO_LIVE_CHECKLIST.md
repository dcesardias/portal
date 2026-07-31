# Checklist de Go-Live — Investimentos

Pré-produção (dev/homolog) e cutover. Todos os itens são obrigatórios.

## 1. Infraestrutura
- [ ] Backup automático diário configurado
- [ ] `vw_centrocusto_un` acessível na instância nova (mesma DB ou linked server)
- [ ] Certificado TLS válido para API/Web
- [ ] Docker Compose validado em homolog
- [ ] Runtime Node 24 LTS instalado

## 2. Schema & Migrations
- [ ] `prisma migrate deploy` executado sem erros
- [ ] Seed base rodado (admin + 2 fluxos)
- [ ] Perfis mínimos criados: `Solicitante`, `Aprovador`, `GPE`, `Administrador`
- [ ] Permissões atribuídas (`SOLICITACAO_APROVAR`, `SOLICITACAO_CRIAR`, `RECEBIMENTO_CRIAR`, `ADMIN_FLUXO`)
- [ ] `RegraFluxo` default criada apontando para "GPE Direto"

## 3. ETL de migração
- [ ] Dump legado extraído em ambiente isolado (não conectar produção AACD)
- [ ] `LEGACY_DUMP_DIR` configurado
- [ ] `ts-node prisma/migrate-legacy.ts` executado
- [ ] Validação paralela: total por grupo/estabelecimento bate com legado (±0)
- [ ] Sem migração de senhas — usuários resetam no 1º acesso

## 4. Segurança (auditoria fecha)
- [ ] `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` gerados com `openssl rand -hex 32`
- [ ] Cookies `Secure=true` em produção (NODE_ENV=production)
- [ ] Rate-limit ativo (5 tentativas/60s em `/auth/login`)
- [ ] `mustChangePwd=true` para todo usuário migrado
- [ ] CORS restrito ao domínio do front
- [ ] Helmet ligado no bootstrap
- [ ] Logs de auditoria (login, senha, config) verificados

## 5. Testes
- [ ] `pnpm --filter @investimentos/api check-types` — 0 erros
- [ ] `pnpm --filter @investimentos/shared check-types` — 0 erros
- [ ] `pnpm --filter @investimentos/api test` — 81/81 verde
- [ ] E2E manual: criar → enviar → aprovar → receber uma solicitação de ponta a ponta
- [ ] E2E manual: pedir revisão, fazer nova submissão, aprovar
- [ ] E2E manual: reprovar (terminal — não vira novo pedido)
- [ ] E2E manual: cancelar solicitação em RASCUNHO e após APROVADO
- [ ] E2E manual: recebimento parcial → status RECEBIDO_PARCIAL
- [ ] E2E manual: recebimento completo → status RECEBIDO
- [ ] E2E manual: recebimento não-previsto sem solicitacaoItemId

## 6. Fluxo de aprovação
- [ ] Fluxo "GPE Direto" ativo com perfilAlvo=`GPE`
- [ ] Fluxo "3 Níveis" ativo com etapas ALCADA_FOCAL → ALCADA_SUP → ALCADA_FINAL
- [ ] Matriz `RegraAlcada` populada para (estab × grupo)
- [ ] Regra `isDefault` apontando para "GPE Direto"
- [ ] Simulador Admin: entradas conhecidas resolvem para fluxo esperado

## 7. Observabilidade
- [ ] Dashboard operacional: pendências por etapa, valores por grupo, tempo médio
- [ ] Alerta: solicitação em EM_APROVACAO > 30 dias
- [ ] Log estruturado (JSON) em stdout
- [ ] Métrica: tempo de resposta P95 < 500ms

## 8. Rollback plan
- [ ] Backup da DB antiga preservado por 60 dias
- [ ] Scripts SQL de rollback prontos
- [ ] Legado (ScriptCase) mantido em read-only por 30 dias pós-cutover
- [ ] Chave de rollback documentada (quem, quando, como)

## 9. Treinamento / comunicação
- [ ] Guia rápido para solicitantes (screenshot + passo a passo)
- [ ] Guia para aprovadores (fila, decisão, revisão)
- [ ] Guia Admin (fluxos, alçada, usuários)
- [ ] Comunicado interno com data de cutover (D-14, D-7, D-1)
- [ ] Canal de suporte definido (e-mail/Teams)

## 10. Cutover
- [ ] Freeze do legado (nenhuma nova solicitação a partir de D-day 00:00)
- [ ] ETL delta executada (pega o que entrou desde a última carga)
- [ ] Comparação delta: 100% match
- [ ] DNS/proxy apontado para nova app
- [ ] Smoke test pós-cutover: login + criar solicitação real + aprovar
- [ ] Comunicado de cutover concluído

## 11. Débito técnico conhecido
- [ ] refresh() ainda não regenera claim `mcp` (ver memory.md — mitigado por MustChangePwdGuard)
- [ ] Notificações por e-mail: NÃO implementadas nesta fase (roadmap)
- [ ] MFA (TOTP): NÃO habilitado por padrão (opt-in por usuário)
- [ ] Aprovação paralela (quórum): schema pronto, service ainda decide por 1º aprovador
