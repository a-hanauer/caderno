# Caderno

Agenda de papel para o dia a dia do Sebastião: **calendário** (com a casa onde ele dorme, vinda do Google Agenda), **rotina diária** e **tarefas únicas**. Roda no celular como webapp (GitHub Pages), funciona offline e guarda tudo no próprio aparelho.

| Tela | O que faz |
|---|---|
| **Hoje** | Dia da semana, em qual casa ele dorme, compromissos do dia, progresso da rotina, tarefas pra hoje, próximas provas/aniversários, aviso do que ficou pra trás ontem |
| **Mês** | Calendário de parede. Cada dia colorido pela casa (azul = Papai, rosa = Mamãe) com emojis dos compromissos. Toque no dia para ver os detalhes. Arraste para trocar de mês |
| **Rotina** | Checklist em Manhã / Tarde / Noite, com carimbo "Tudo feito", sequência de dias e os últimos 7 dias. Lápis no canto = editar (adicionar, apagar, reordenar) |
| **Tarefas** | Lista de tarefas únicas com data opcional, carimbo "Feito" e arquivo de concluídas |
| **Ajustes** (engrenagem em *Hoje*) | Conexão com o Google Agenda, backup por código, PIN. Área dos pais |

---

## 1. Criar a ponte com o Google Agenda (Apps Script)

O app **não** acessa o Google Agenda direto. Você cria um pequeno script na sua conta Google que lê a agenda e entrega a lista de eventos (só título, data/hora e nome da agenda) para quem tiver o **token** secreto.

1. Abra <https://script.google.com> e clique em **Novo projeto**.
2. Apague o código que vier e cole **todo** o conteúdo de `apps-script/Code.gs`. Clique em **Salvar** (disquete). Dê um nome ao projeto (ex.: "Caderno").
3. O fuso das datas já está fixo no código (`CONFIG.TZ`, *America/Sao_Paulo*). Não precisa mexer em nada.
4. No topo, escolha a função **`listarAgendas`** e clique **Executar**. O Google vai pedir permissão (Revisar permissões → sua conta → Avançado → Acessar "Caderno" → Permitir). Depois abra **Registro de execução** e veja os nomes das suas agendas.
5. Se a agenda da guarda ou da escola for **outra agenda** (e não a principal), escreva os nomes em `CONFIG.AGENDAS` no topo do código, por exemplo `AGENDAS: ['Guarda Sebastião', 'Escola']`, e salve. Vazio = só a agenda principal.
6. Escolha a função **`gerarToken`** → **Executar**. No **Registro de execução** aparece o seu **token** (texto longo). Copie e guarde. Quem tem o token enxerga os títulos da agenda; trate como senha.
7. Escolha a função **`testar`** → **Executar**. Deve aparecer "Tudo certo! N eventos encontrados" e uma amostra. **Confira nessa amostra um evento de dia inteiro com mais de um dia**: o campo `→` do fim deve ser o dia **seguinte** ao último dia do evento.
8. **Implantar** → **Nova implantação** → engrenagem ao lado de "Selecionar tipo" → **App da Web**:
   - *Executar como*: **Eu**
   - *Quem pode acessar*: **Qualquer pessoa** (quem protege é o token)
   - **Implantar**, e **copie o URL** que termina em `/exec`.
9. Sempre que você **mudar o código**, é preciso **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. O URL continua o mesmo.

> Para trocar o token (por exemplo, se o link vazou): rode `gerarToken` de novo. O token antigo para de funcionar na hora, sem precisar reimplantar. Depois reconecte o app com o novo.

## 2. Publicar o app no GitHub Pages

1. Crie um repositório novo chamado `caderno`. Pode ser **público**: nada sensível fica no código. O endereço do script e o token só existem no aparelho.
2. Envie **o conteúdo desta pasta** (`index.html`, `css/`, `js/`, `icons/`, `sw.js`, `manifest.webmanifest`; a pasta `apps-script/` é opcional). No site do GitHub: **Add file → Upload files**.
3. **Settings → Pages → Branch: `main`, pasta `/ (root)` → Save**. Em ~1 minuto o app abre em `https://SEU-USUARIO.github.io/caderno/`.

## 3. Instalar no iPhone e conectar

1. Abra o endereço no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**.
2. **Importante:** o app instalado na tela inicial guarda os dados **separados do Safari**. Faça a configuração **dentro do app instalado**.
3. No app: *Hoje* → engrenagem → **Ajustes** → cole o **URL (`/exec`)** e o **token** → **Conectar e testar**.
4. Em **Ajustes** defina um **PIN** (opcional).

**Segundo celular (mãe):** no celular que já está conectado, *Ajustes → Copiar link de conexão* e envie. No outro celular, instale o app, abra **Ajustes** e cole o link inteiro em "Ou use um código de conexão". Para levar também a rotina e as tarefas, use *Gerar código dos dados* → *Importar código*.

## 4. Como o app lê a agenda

- **Casa:** eventos de **dia inteiro** cujo título tenha uma das palavras de *Ajustes → Palavras da casa* (padrão: `pai, papai` e `mãe, mae, mamãe, mamae`). Ex.: "André - pai", "Aline - mãe" (a palavra "pai" ou "mãe" no título basta). O evento do dia X significa "dorme nessa casa na noite do dia X". Eventos como "Dia dos Pais" são reconhecidos como data especial e **não** viram casa. Se o nome da mãe ou do pai aparece no título (ex.: "Com André"), acrescente nas palavras.
- **Categorias** (pelo título): 📝 prova/teste/avaliação · 📚 trabalho/tema/entrega/apresentação · 🎂 aniversário · 🎉 feriado/recesso/férias/"Dia do/da…" · 🤖 robótica · 🗣️ inglês · 💬 terapia · 🏫 escola/aula/reunião · 📌 o resto. Provas, trabalhos, aniversários e datas especiais aparecem em **Vem aí** na tela Hoje. As regras ficam em `js/events.js` (`CATS`).
- Atualiza sozinha ao abrir (se a cópia tiver mais de 30 min) e sempre que a internet volta. Sem internet, usa a última cópia.

## 5. Segurança, sem enrolação

- **Público:** o código do app (HTML/CSS/JS). Qualquer pessoa com o endereço abre um app **vazio**.
- **Só no aparelho:** rotina, tarefas, histórico, URL do script e token (`localStorage`).
- **No Google:** a agenda continua lá; o script só lê título, data/hora e nome da agenda (sem descrição, local ou convidados).
- **Token:** quem tiver o URL do script **e** o token consegue ler os títulos da agenda. O link de conexão e o código de dados com "incluir conexão" contêm o token: não poste em lugar aberto.
- **PIN:** é uma trava para o Sebastião não mexer sem querer nos Ajustes. **Não é segurança forte**: quem abre o aparelho destravado e sabe usar o navegador pode ver os dados.
- Esta versão só **lê** o Google Agenda; ela não cria nem altera eventos.

## 6. Limitações conhecidas

- **Sem sincronização automática entre aparelhos.** Rotina e tarefas ficam em um aparelho; para mover, use o código de dados. (A agenda é lida do Google em todos.)
- **Notificações/lembretes:** webapp no iPhone não consegue agendar lembretes confiáveis com o app fechado (exigiria um servidor de push). O app mostra "Ficou pra trás" e o aviso de ontem. Lembretes de verdade ficam para a versão nativa (notificações locais).
- **Atualização do app:** depois de publicar uma versão nova, ela aparece na **segunda** abertura (o app abre instantâneo com a cópia guardada e atualiza em segundo plano).
- O Apps Script demora 1–3 s para responder; por isso o app mostra a última cópia e atualiza por trás.
- **Fonte:** o app usa *Playpen Sans* (variável, pesos 100–800: títulos 800, rótulos 600, texto 400). Siga `fonts/LEIA-ME.txt` para baixar (grátis) e soltar `PlaypenSans.ttf` em `fonts/`. Sem o arquivo, usa Bradley Hand/Noteworthy do iPhone, e o navegador registra erros 404 inofensivos.

## 7. Estrutura

```
index.html            página única (as telas são desenhadas por js/views)
css/app.css           todo o visual (papel, espiral, post-its, abas, carimbo)
js/app.js             rotas, abas, sincronização, virada do dia
js/store.js           dados locais, rotina e tarefas
js/events.js          Google Agenda: sincronização, casa, categorias
js/codec.js           códigos de backup e de conexão
js/ui.js              folhas, avisos, checkbox desenhado, ícones
js/views/             hoje, mes, rotina, tarefas, ajustes
sw.js                 funcionamento offline
apps-script/Code.gs   ponte com o Google Agenda (vai no script.google.com, não no GitHub)
```

Para testar no computador: `python3 -m http.server 8000` dentro da pasta e abrir `http://localhost:8000`.
