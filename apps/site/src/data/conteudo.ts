/**
 * Conteúdo editável do site. Fonte: documento-mestre rev. 3.4 (seções 2, 3, 4 e 6).
 * Ao mudar preço, plano ou módulo no documento-mestre, mude aqui também.
 */

export type Plano = {
  id: 'essencial' | 'profissional';
  nome: string;
  apelido: string;
  preco: number;
  perfil: string;
  inclui: string[];
  emBreve: string[];
  destaque?: boolean;
};

export const PLANOS: Plano[] = [
  {
    id: 'essencial',
    nome: 'Essencial',
    apelido: 'Para quem atende sozinho',
    preco: 197,
    perfil: '1 profissional · até 80 agendamentos por mês',
    inclui: [
      'Atendente no WhatsApp com o nome do seu pet shop',
      'Agenda do dia e da semana, igual para você e para o atendente',
      'Confirmação e lembrete na véspera',
      'Tutores e pets cadastrados, com histórico',
      'Check-in, check-out e registro do pagamento',
      '1 plaquinha com QR Code para o pet',
    ],
    emBreve: ['Caixa e contas a receber'],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    apelido: 'Para a equipe de banho e tosa',
    preco: 397,
    perfil: 'Até 3 profissionais · agendamentos ilimitados',
    inclui: [
      'Tudo do Essencial',
      'Agenda por profissional, com entrada escalonada (o segundo pet entra enquanto o primeiro seca)',
      'Preço e duração por porte (P, M, G, GG)',
      '3 plaquinhas com QR Code',
    ],
    emBreve: [
      'Administração: estoque, compras, financeiro e custo de cada banho',
    ],
    destaque: true,
  },
];

export type Modulo = {
  nome: string;
  cobre: string;
  resultado: string;
  status: 'disponivel' | 'em-breve';
};

export const MODULOS: Modulo[] = [
  {
    nome: 'Spa',
    cobre: 'Banho e tosa',
    resultado:
      'Agenda, atendente no WhatsApp, lembretes, operação do dia e pagamento. O cliente marca sozinho e você só confere.',
    status: 'disponivel',
  },
  {
    nome: 'Administração',
    cobre: 'Estoque, compras e financeiro',
    resultado: 'Você sabe quanto sobra de cada banho, com insumo, água, energia e comissão na conta.',
    status: 'em-breve',
  },
  {
    nome: 'Day Care',
    cobre: 'Hotel e creche',
    resultado: 'Diárias, baias, presença na creche e o diário do hóspede enviado ao tutor.',
    status: 'em-breve',
  },
  {
    nome: 'Vet',
    cobre: 'Clínica veterinária',
    resultado: 'Prontuário, vacinas e receitas na mesma linha do tempo do pet que o banho já registra.',
    status: 'em-breve',
  },
];

/** Jornada do atendimento (documento-mestre, seção 3). A ordem é real: não reordenar. */
export const JORNADA = [
  { quando: 'Dom · 23:47', titulo: 'O tutor pede pelo WhatsApp', texto: 'O atendente responde na hora, com o nome do seu pet shop, e mostra só horários que existem.' },
  { quando: 'Dom · 23:49', titulo: 'O horário entra na agenda', texto: 'Já reservado para o profissional certo. Bot e balcão veem a mesma agenda, sem marcar duas vezes.' },
  { quando: 'Seg · 10:00', titulo: 'Lembrete na véspera', texto: 'O tutor responde SIM ou NÃO. Se cancelar, você é avisado e o horário volta a ficar livre.' },
  { quando: 'Ter · 09:00', titulo: 'Check-in', texto: 'O pet chega, a equipe marca a entrada e já vê porte, alergias e observações.' },
  { quando: 'Ter · 09:05', titulo: 'Banho e tosa', texto: 'Cada profissional vê a própria fila do dia.' },
  { quando: 'Ter · 10:20', titulo: 'Pet pronto', texto: 'O status muda no painel e a recepção já sabe que pode chamar o tutor.' },
  { quando: 'Ter · 10:45', titulo: 'Check-out', texto: 'Pagamento registrado (Pix, cartão ou dinheiro) e o atendimento vai para o histórico do pet.' },
  { quando: 'Depois', titulo: 'Próximo banho', texto: 'O histórico fica guardado e o próximo pedido começa mais rápido.' },
] as const;

export const FAQ = [
  {
    pergunta: 'Preciso de outro número de WhatsApp?',
    resposta:
      'Não. O atendente usa o número que o seu pet shop já tem. Você continua com o WhatsApp no celular.',
  },
  {
    pergunta: 'E quando eu quiser responder pessoalmente?',
    resposta:
      'Responda pelo celular, como sempre. O atendente percebe e fica em silêncio naquela conversa por algumas horas. No painel há também um botão para devolver a conversa a ele.',
  },
  {
    pergunta: 'O atendente pode marcar dois pets no mesmo horário por engano?',
    resposta:
      'Não. A agenda é uma só para o WhatsApp e para o balcão, e o sistema recusa um horário que acabou de ser ocupado. Encaixe fora da capacidade, só você faz, pelo painel.',
  },
  {
    pergunta: 'Funciona na minha cidade?',
    resposta:
      'Sim. O PetCare Hub é online. A implantação e o treinamento são feitos por videochamada.',
  },
  {
    pergunta: 'Como funciona a implantação?',
    resposta:
      'Configuramos serviços, preços por porte, horários, equipe e o nome do atendente, conectamos o WhatsApp e treinamos você. O valor da implantação é único e combinado na demonstração.',
  },
  {
    pergunta: 'E os dados dos meus clientes?',
    resposta:
      'Ficam separados por pet shop: nenhum outro estabelecimento vê seus clientes, preços ou histórico de banho. O tratamento segue a LGPD e está descrito na política de privacidade.',
  },
] as const;

/**
 * Vídeo do bot funcionando (SI-01). Enquanto `src` for vazio, a seção mostra o convite
 * para a demonstração ao vivo. Para ativar: subir o MP4 em public/video/ e preencher.
 */
export const VIDEO_DEMO: { src: string; poster: string; legenda: string } = {
  src: '', // ex.: '/video/bot-agendamento.mp4'
  poster: '', // ex.: '/video/bot-agendamento.jpg'
  legenda: 'Um tutor marca banho e tosa pelo WhatsApp, do primeiro "oi" à confirmação.',
};

/**
 * Depoimentos (SI-07, começando pela POC). Lista vazia = a seção não aparece.
 * Só publicar com autorização por escrito (termo de parceria cobre uso de imagem).
 */
export type Depoimento = { texto: string; nome: string; petshop: string; cidade: string; foto?: string };
export const DEPOIMENTOS: Depoimento[] = [];
