# Estilos Gestor

Plataforma de gestão financeira e de negócios (web + celular como PWA): login com código de verificação, planos com limite diário, produtos, vendas, entradas e saídas, gráficos interativos, **Meus Lembretes**, **notificações push**, central de alertas, **painel exclusivo do proprietário** com **Minhas Vendas** (faturamento, lucro, assinantes) e contato por **WhatsApp** e **Instagram**.

**Tecnologias:** Next.js (App Router) + TypeScript, Tailwind CSS 4, componentes no estilo shadcn/ui, Lucide, Motion, Recharts, Zod e Supabase (Auth + PostgreSQL com Row Level Security, pg_cron e pg_net). Notificações no padrão **Web Push (VAPID)** implementado no próprio servidor, sem serviço pago de terceiros.

---

## 1. Como executar

Requisitos: **Node.js 20.9 ou superior**.

```bash
npm install
cp .env.example .env.local     # preencha as variáveis (seção 2)
npm run dev                    # http://localhost:3000
```

Produção: `npm run build` e depois `npm start`.

> **Sem as variáveis do Supabase o app abre em MODO DEMONSTRAÇÃO**: dados só no navegador, código de verificação na tela e uma faixa amarela avisando em todas as páginas. Nenhuma notificação push é enviada na demonstração. Use para apresentar e testar; **não publique para clientes sem o Supabase configurado**.

---

## 2. Variáveis de ambiente

| Variável | Onde fica | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador + servidor | Supabase › Project Settings › API › Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador + servidor | Supabase › Project Settings › API › chave `anon` / publishable |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | navegador | E-mail de contato do rodapé (também configurável no painel) |
| `NEXT_PUBLIC_SITE_URL` | navegador | Endereço público do site, ex.: `https://estilosgestor.com.br` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | navegador | Chave **pública** das notificações push |
| `VAPID_PRIVATE_KEY` | **só servidor** | Chave **privada** das notificações push |
| `VAPID_SUBJECT` | **só servidor** | Contato do responsável, ex.: `mailto:voce@seudominio.com` |
| `PUSH_DISPATCH_SECRET` | **só servidor** | Senha que o agendamento usa para chamar `/api/push/dispatch` |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | Supabase › API › `service_role`. Usada só nas rotas `/api/push` |

Gere as chaves de push e o segredo com `npm run push:chaves`. Variáveis sem `NEXT_PUBLIC_` **nunca** vão para o navegador. Não publique o `.env.local` (o `.gitignore` já ignora) e mantenha o repositório do GitHub **privado**.

O WhatsApp oficial (**+55 11 95931-1513**) já vem configurado; o Instagram é cadastrado pelo painel (seção 5).

---

## 3. Banco de dados (Supabase › SQL Editor, nesta ordem)

1. `supabase/migrations/0001_estilos_gestor.sql` — estrutura principal e segurança (RLS).
2. `supabase/migrations/0003_planos_lembretes_push.sql` — limites por plano, Meus Lembretes, notificações push, histórico.
3. `supabase/migrations/0005_versao_publica.sql` — **versão pública**: conta do proprietário, limite gratuito de 1 hora, vendas de assinaturas, despesas, lucro, registro de operações, WhatsApp e Instagram.
4. *(Opcional)* `0002_agendamento_opcional.sql` — vencimentos a cada hora (exige `pg_cron`).
5. `0004_agendamento_lembretes_push.sql` — **depois de publicar o site**: lembretes e envio push a cada minuto (seção 8).

**Já tem um banco rodando com a 0001 e a 0003?** Rode só a `0005`. Ela **não apaga dados**: os pagamentos antigos viram vendas confirmadas com nome e e-mail do cliente, e todos os clientes, planos e lembretes continuam iguais (testado com dados existentes).

### Autenticação (Supabase › Authentication)

1. **Sign In / Providers › Email**: ligado, com **"Confirm email"** ativado.
2. **Email Templates**: cole `supabase/templates/confirmar-cadastro.html` em **Confirm signup** e `supabase/templates/recuperar-senha.html` em **Reset password** (código de 6 dígitos).
3. **SMTP Settings**: o envio padrão do Supabase é limitado e serve para testes. Para clientes reais, configure um SMTP próprio (ex.: Resend, Brevo, Amazon SES).
4. **URL Configuration › Site URL**: o endereço do site publicado.

---

## 4. Conta do proprietário

O **único** e-mail com acesso administrativo é **vinizinnalexandre271@gmail.com**.

- Basta **criar a conta no site com esse e-mail e confirmar o código**. Ela vira proprietária automaticamente: uso ilimitado (sem contador), todas as funcionalidades, **Minhas Vendas** e **Administração**.
- A verificação é feita **no banco de dados**, em todas as funções administrativas: exige esse e-mail **e** e-mail confirmado. Mudar a URL, mexer no navegador ou cadastrar o e-mail sem acesso à caixa de entrada não dá acesso. Nenhum usuário consegue alterar as próprias permissões.
- O banco guarda só o **SHA-256** do e-mail (o endereço não fica exposto no código). Acessos administrativos antigos (tabela `admin_users`) deixam de valer.
- Para trocar o proprietário no futuro (SQL Editor):
  ```sql
  update public.platform_owner
     set email_sha256 = public._email_hash('novo-email@exemplo.com'), updated_at = now()
   where id = 1;
  ```

---

## 5. Minhas Vendas e Administração (só o proprietário)

**Minhas Vendas** (`/admin/vendas`), com filtros Todo o período, Hoje, 7 dias, 30 dias, Este mês, Este ano e Personalizado:

- **Vendas realizadas**: pagamentos confirmados. Renovação conta como venda, mas não como cliente novo.
- **Total recebido**: soma dos confirmados. Pendentes aparecem à parte e **não** entram.
- **Assinantes ativos**: clientes com plano pago ativo e dentro da validade (não conta vencidos, cancelados, pendentes nem o proprietário).
- **Lucro líquido** = total recebido − **despesas da plataforma** (hospedagem, domínio, ferramentas…, registradas na mesma tela).
- Gráfico da evolução das receitas x despesas (separado dos gráficos dos clientes), faturamento por plano e **histórico de vendas** com busca, filtro por status e **exportação CSV** (padrão brasileiro, abre direto no Excel).
- Tudo começa em **zero** e é calculado a partir dos registros: nenhum dado inventado.

**+ Registrar nova venda** (em Minhas Vendas e na Administração): nome, e-mail da conta cadastrada (o formulário confere se a conta existe), plano, valor pago, data, forma de pagamento, status, ID do Pix/comprovante e observações.

- **Confirmado**: registra o pagamento, libera o plano e salva o vencimento. Mesmo plano ainda ativo = **renovação** (soma ao vencimento atual).
- **Pendente**: fica aguardando, fora do faturamento, sem liberar o plano. Depois, **Confirmar recebimento** ou **Cancelar**.
- **Estornar** (confirmado): sai do faturamento e do lucro, com motivo obrigatório. O plano do cliente não muda sozinho.
- Proteções: clique duplo ou reenvio não duplica a venda; o mesmo ID de Pix/comprovante não pode ser contado duas vezes; **valores registrados não podem ser alterados nem apagados**, nem direto no banco; o histórico financeiro é mantido mesmo se o cliente excluir a conta.
- Os botões **Ativar plano** e **Renovar plano** da lista de clientes abrem esse mesmo formulário, então toda ativação fica com o pagamento registrado.

**Administração** (`/admin`): visão geral, clientes (plano, ativação, vencimento, status, histórico; Ativar, Renovar, Suspender, Cancelar), assinaturas, planos (criar/editar preço, duração, benefícios, limite diário e recursos; salvar um plano não ativa ninguém), **Configurações** (WhatsApp, Instagram, e-mail de suporte, tempo gratuito), comunicados e **Registro de operações** (vendas, confirmações, estornos, planos, assinaturas, configurações e despesas, com data e autor; somente leitura e não pode ser apagado).

**Instagram**: em Administração › Configurações, informe `@seuperfil` ou o endereço completo. Enquanto estiver vazio, o botão não aparece (nenhum link quebrado).

---

## 6. Planos

| Plano | Preço | Uso diário | Recursos |
|---|---|---|---|
| Gratuito ("Continuar sem plano") | — | **1 hora** (contador a partir de 01:00:00) | Recursos básicos; alertas só no sino; botão para conhecer os planos quando o tempo acaba |
| **Básico** | R$ 40/mês | **10 horas** | Produtos, estoque, vendas, entradas e saídas, gráficos, notificações gerais |
| **Avançado** — *Mais popular* | R$ 70/mês | **Ilimitado** | Tudo do Básico + lembretes de pagamentos e compras, agendamento de compromissos, prioridade no suporte |
| **Completo Anual** — *Oferta promocional* | R$ 240/ano, à vista | **Ilimitado** | Todos os benefícios do Avançado por 12 meses. Destaques: "Equivalente a R$ 20 por mês." e "Economize R$ 600 por ano em comparação ao plano Avançado mensal." |
| Proprietário | — | **Ilimitado** | Tudo + Minhas Vendas + Administração |

O tempo é controlado **no servidor** (não conta em dobro com vários aparelhos, não cobra o tempo fora do app, renova à meia-noite de Brasília e bloqueia leitura e gravação ao terminar). Contratação pelo WhatsApp com mensagem automática do plano (ex.: "Olá! Gostaria de contratar o Plano Avançado de R$ 70 por mês. Como posso realizar o pagamento?"). Pagamento manual: o plano só é liberado quando o proprietário confirma o recebimento. Não há assistente virtual, chatbot ou IA.

---

## 7. Publicar (ou atualizar) na Vercel

### Primeira publicação
1. Suba esta pasta para um repositório **privado** no GitHub.
2. [vercel.com](https://vercel.com) → **Add New › Project** → importe o repositório.
3. **Environment Variables**: todas da seção 2. **Deploy**.
4. Copie o endereço (ou seu domínio) para o Supabase em *Authentication › URL Configuration › Site URL*.

### Se o site já está publicado (mantém o mesmo endereço)
1. No Supabase, rode **`0005_versao_publica.sql`** no SQL Editor (seção 3). Faça isso **antes** de subir o código novo.
2. Substitua os arquivos do repositório pelos desta versão (mantendo o `.env.local` só no seu computador) e faça `git push`. A Vercel publica automaticamente **no mesmo endereço e domínio**.
   Se você publicou sem GitHub, rode `npx vercel --prod` dentro da pasta do projeto.
3. As variáveis de ambiente continuam as mesmas; não é preciso mudar nada na Vercel.
4. Entre com **vinizinnalexandre271@gmail.com** e confira **Minhas Vendas** e a **Administração**.

---

## 8. Notificações push em produção

1. `npm run push:chaves` e guarde a saída em lugar seguro.
2. Na Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_DISPATCH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Novo deploy.
3. Supabase › **Database › Extensions**: ative **pg_cron** e **pg_net**.
4. Em `0004_agendamento_lembretes_push.sql`, troque os dois `<<< TROCAR >>>` (endereço do site sem barra final e o mesmo `PUSH_DISPATCH_SECRET`) e rode no SQL Editor.
5. Confira: `select jobname, active from cron.job;` e `select status_code, content from net._http_response order by created desc limit 5;` (`200` = ok; `401` = segredo diferente; `503` = falta variável).
6. No site, com plano pago: **Configurações › Ativar notificações › Enviar teste**.

Chrome, Edge e Firefox (computador e Android) e Safari no Mac recebem com o site fechado (no computador, o navegador precisa estar aberto, pode estar minimizado). **iPhone/iPad**: iOS 16.4+ e site adicionado à Tela de Início (o app mostra as instruções).

---

## 9. Instalar no celular (PWA)

- **Android (Chrome):** menu **⋮** → **Instalar app**.
- **iPhone (Safari):** **Compartilhar** → **Adicionar à Tela de Início**.

---

## 10. Checklist antes de abrir para clientes

- [ ] `npm install` e `npm run build` sem erros (o build final do Next.js precisa rodar no seu computador ou na Vercel).
- [ ] Migrações 0001, 0003 e 0005 rodadas; 0004 depois do deploy, se for usar push e lembretes no celular.
- [ ] SMTP próprio configurado e teste real de cadastro com código e recuperação de senha.
- [ ] Conta do proprietário criada e confirmada; Minhas Vendas abrindo zerado.
- [ ] Uma conta de teste: contador de 1 hora, venda registrada, plano liberado, vencimento correto.
- [ ] Instagram e e-mail de suporte cadastrados (ou deixados vazios de propósito).
- [ ] Indicador "Clientes satisfeitos" do painel dos clientes: em Administração › Configurações, troque pelo número real e desmarque "demonstrativo", ou mantenha marcado.
- [ ] Política de Privacidade e Termos revisados por um profissional jurídico.
- [ ] Imagem de destaque do painel (opcional): foto com direito de uso em `public/hero/` e caminho em `lib/config.ts` → `heroImage`.

---

## Estrutura

```
app/                    páginas (entrar, cadastro, planos, app/*, admin, admin/vendas, privacidade, termos)
app/api/push/           envio agendado e teste de notificações (só no servidor)
components/admin/       Minhas Vendas, registrar venda, abas da administração
components/support/     botões de WhatsApp e Instagram
lib/data/               supabase-backend.ts (produção) e demo-backend.ts (demonstração)
lib/server/             Web Push (RFC 8291 + VAPID), fila de envio, variáveis secretas
supabase/migrations/    banco, segurança, funções e agendamentos
supabase/tests/         testes do banco (rode em um banco de teste, nunca no de produção)
```
