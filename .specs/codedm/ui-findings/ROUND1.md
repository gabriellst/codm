# UI Findings — Round 1 (founder, 2026-07-22, teste manual do console)

Screenshots nesta pasta. Cada item vira fix obrigatório; canon = skills react + examples/pairs.

1. I18N MISTURADO (sistêmico): strings hardcoded em inglês convivendo com pt ("Not connected",
   "Show archived", "0 awaiting input · 0 working · ..."). O gate existe (eslint
   no-hardcoded-jsx-text) mas o flat config do eslint NÃO CARREGA no repo (phantom deps
   jiti/@typescript-eslint/utils — pendência da fase 8a). FIX: consertar eslint (declarar deps),
   rodar a regra, traduzir TODAS as violações (locales pt+en), prender no lint.
2. CANAIS (01-canais.png, 04-connect-channel.png): chevron das rows não faz nada; WhatsApp deve
   ser o ÚNICO conectável (fluxo connect real; QR quando gateway up, estado honesto sem);
   Instagram DM + Telegram = "Em breve" (disabled, sem chevron). "Not connected" → i18n.
3. VOLTAR × TÍTULO (02-voltar-titulo.png): o botão voltar flutua ACIMA do display title;
   deve ficar inline à esquerda do título (mesma linha, antes de "TAREFAS"/"CANAIS").
4. SWITCH + LINE-HEIGHT (03-switch-lineheight.png): Switch feio (proporções thumb/track,
   espaçamento interno insuficiente); espaçamento título→descrição das ListRows apertado
   (ocorre em vários lugares — provável line-height nos tokens/type ramp). Passe GLOBAL
   em primitives/tokens, não pontual.
5. ATTACH WIZARD fora do canon: estrutura de steps + dados de form divergem do exemplar
   aprovado examples/pairs/synthetic-react-onboarding-composed-form (template repo).
   RECONSTRUIR o wizard seguindo o pair (composição de steps, TanStack Form, validação).
6. ONBOARDING (routes/onboarding) fora das skills: sem animação decente, pobre.
   Refazer seguindo o playbook/pair; slides com transição digna do design.
7. "Explorar com dados de demonstração": botão sem backend — REMOVER.
8. CONFIGURAÇÕES mockadas: manter apenas o que tem read/mutation real (providers, stop
   criteria); general/appVersion canned → read real ou remoção honesta.
