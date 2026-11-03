export class AppError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "AppError";
  }
}

const MESSAGES: Array<[RegExp, string | ((m: RegExpMatchArray, raw: string) => string)]> = [
  // Minhas Vendas / administração (antes das regras genéricas)
  [/platform_expenses.*row-level security|row-level security.*platform_expenses/i, "Somente o proprietário pode registrar despesas da plataforma."],
  [/PAGAMENTO_DUPLICADO|subscription_payments_ref_idx/i, "Este pagamento (mesmo comprovante ou ID) já foi registrado. Ele não pode ser contado duas vezes."],
  [/VALOR_INVALIDO/i, "Informe um valor pago maior que zero."],
  [/DATA_INVALIDA/i, "A data do pagamento não pode ser no futuro nem de mais de um ano atrás."],
  [/FORMA_PAGAMENTO_INVALIDA/i, "Escolha a forma de pagamento."],
  [/TRANSICAO_INVALIDA/i, "Essa mudança de situação não é permitida para este pagamento."],
  [/MOTIVO_OBRIGATORIO/i, "Informe o motivo do estorno."],
  [/PAGAMENTO_IMUTAVEL|PAGAMENTO_NAO_PODE_SER_EXCLUIDO/i, "Pagamentos registrados não podem ter o valor alterado nem ser apagados. Use cancelar (pendente) ou estornar (confirmado)."],
  [/PAGAMENTO_NAO_ENCONTRADO/i, "Pagamento não encontrado."],
  [/instagram_url/i, "Informe o endereço completo do perfil, por exemplo: https://www.instagram.com/seuperfil"],
  [/whatsapp_number/i, "Informe o WhatsApp só com números, com DDI e DDD (ex.: 5511959311513)."],
  [/RECURSO_DO_PLANO|reminders.*row-level security|row-level security.*reminders/i, "Este recurso não está incluído no seu plano atual."],
  [/ACESSO_BLOQUEADO|row-level security/i, "Seu tempo de uso de hoje terminou ou a sessão ficou inativa. Atualize a página e tente novamente."],
  [/LEMBRETE_NAO_ENCONTRADO/i, "Lembrete não encontrado."],
  [/PUSH_INDISPONIVEL_DEMO/i, "Na demonstração as notificações no aparelho não são enviadas. Elas funcionam na versão publicada com o Supabase configurado."],
  [/PUSH_INDISPONIVEL/i, "As notificações no aparelho ainda não foram configuradas no servidor."],
  [/PUSH_NAO_SUPORTADO/i, "Este navegador não permite notificações. No iPhone, adicione o site à Tela de Início e abra por lá."],
  [/PUSH_NEGADO/i, "As notificações foram bloqueadas no navegador. Libere nas configurações do site e tente de novo."],
  [/PUSH_ENDPOINT_INVALIDO/i, "Este navegador usa um serviço de notificações não suportado."],
  [/SEM_APARELHO/i, "Nenhum aparelho com notificações ativadas. Ative neste aparelho primeiro."],
  [/AGUARDE/i, "Aguarde alguns segundos antes de enviar outro teste."],
  [/CONFIGURACAO_INCOMPLETA/i, "O envio de notificações ainda não foi configurado no servidor."],
  [/plans_id_format/i, "Use só letras minúsculas, números e hífen no identificador (ex.: plano-semestral)."],
  [/plans_pkey|duplicate key.*plans/i, "Já existe um plano com esse identificador."],
  [/ESTOQUE_INSUFICIENTE/i, "Estoque insuficiente para essa quantidade."],
  [/ACESSO_NEGADO|permission denied/i, "Você não tem permissão para esta ação."],
  [/PRODUTO_NAO_ENCONTRADO/i, "Produto não encontrado."],
  [/VENDA_NAO_ENCONTRADA/i, "Venda não encontrada."],
  [/QUANTIDADE_INVALIDA/i, "Informe uma quantidade válida."],
  [/PAGAMENTO_INVALIDO/i, "Escolha uma forma de pagamento."],
  [/PLANO_NAO_ENCONTRADO/i, "Plano não encontrado."],
  [/USUARIO_NAO_ENCONTRADO/i, "Não existe conta com este e-mail. Peça para o cliente se cadastrar no site e use o mesmo e-mail."],
  [/ASSINATURA_CANCELADA/i, "Esta assinatura foi cancelada. Ative um novo plano para o usuário."],
  [/ASSINATURA_EXPIRADA_USE_RENOVAR/i, "A assinatura já venceu. Use a opção Renovar."],
  [/ASSINATURA_NAO_ENCONTRADA/i, "Assinatura não encontrada."],
  [/COMUNICADO_VAZIO/i, "Preencha o título e a mensagem do comunicado."],
  [/EMAIL_NAO_CONFIRMADO|Email not confirmed/i, "Confirme seu e-mail para entrar. Enviamos um código para você."],
  [/Invalid login credentials|CREDENCIAIS_INVALIDAS/i, "E-mail ou senha incorretos."],
  [/User already registered|EMAIL_JA_CADASTRADO/i, "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha."],
  [/Token has expired or is invalid|otp_expired|CODIGO_INVALIDO/i, "Código inválido ou expirado. Confira o e-mail ou peça um novo código."],
  [/Password should be|weak_password/i, "Use uma senha mais forte (mínimo de 8 caracteres, com letras e números)."],
  [/same_password|New password should be different/i, "A nova senha precisa ser diferente da atual."],
  [/For security purposes|over_email_send_rate_limit|rate limit/i, "Muitas tentativas seguidas. Aguarde um minuto e tente novamente."],
  [/Failed to fetch|NetworkError|Load failed/i, "Sem conexão com o servidor. Verifique sua internet."],
  [/NAO_AUTENTICADO|JWT|not authenticated/i, "Sua sessão expirou. Entre novamente."],
  [/USUARIO_NAO_EXISTE/i, "Não encontramos uma conta com este e-mail."],
];

export function friendlyError(err: unknown): string {
  const raw =
    err instanceof Error
      ? `${(err as AppError).code ?? ""} ${err.message}`
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err ?? "");
  for (const [re, msg] of MESSAGES) {
    const m = raw.match(re);
    if (m) return typeof msg === "function" ? msg(m, raw) : msg;
  }
  return "Algo deu errado. Tente novamente em instantes.";
}
