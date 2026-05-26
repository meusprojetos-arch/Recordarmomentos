# Recordar
**Seu arquivo vivo de memórias pessoais e legado familiar**

---

## Visão Geral

O **Recordar** é um aplicativo mobile-first de preservação de memórias pessoais, desenvolvido com React + Vite como PWA instalável. Toda a experiência foi desenhada para ser simples e acolhedora, funcionando 100% com autenticação Firebase e armazenamento local via IndexedDB.

**Princípios do design:**
- Interface limpa e intuitiva — fácil para qualquer idade
- Offline-first — blobs e metadados armazenados localmente
- Sincronização opcional via Firebase Firestore + Storage
- Paleta acolhedora: verde vida, bege calor, laranja destaque
- Tipografia legível: Lora (serif, emocional) + Nunito (sans, amigável)

---

## Estrutura do Projeto

```
recordar/
├── src/
│   ├── components/
│   │   ├── screens/
│   │   │   ├── LoadingScreen.jsx     # Splash screen com logo (aparece no boot, login, primeiras abas)
│   │   │   ├── WelcomeScreen.jsx     # Tela de boas-vindas (onboarding)
│   │   │   ├── LoginScreen.jsx       # Login com email/senha
│   │   │   ├── SignupScreen.jsx      # Cadastro com nome, username, data de nascimento
│   │   │   ├── HojeScreen.jsx        # Aba "Hoje" — armazenamento + recentes + ações rápidas
│   │   │   ├── FeedScreen.jsx        # Aba "Feed" — posts de texto estilo social
│   │   │   ├── TempoScreen.jsx       # Aba "Memórias" — galeria, pastas, lixeira
│   │   │   ├── PerfilScreen.jsx      # Aba "Perfil" — conta, backup, configurações
│   │   │   ├── ConfigScreen.jsx      # Tela de configurações avançadas
│   │   │   └── PlansScreen.jsx       # Tela de planos / upgrade
│   │   ├── layout/
│   │   │   ├── Navbar.jsx            # Barra de navegação inferior + botão FAB central
│   │   │   └── Topbar.jsx            # Barra superior com título e ações
│   │   ├── modals/
│   │   │   ├── AddMemoryModal.jsx    # Modal principal de nova memória
│   │   │   ├── PinLockModal.jsx      # Modal de PIN para pasta Trancados
│   │   │   ├── ShareModal.jsx        # Modal de compartilhamento de memória
│   │   │   ├── SearchUsersModal.jsx  # Busca de outros usuários
│   │   │   ├── UserProfileModal.jsx  # Perfil de outro usuário
│   │   │   ├── BackupLogsModal.jsx   # Logs do backup na nuvem
│   │   │   ├── AutoSyncModal.jsx     # Configurações de sync automático
│   │   │   └── RestoreModal.jsx      # Restauração de backup
│   │   └── ui/
│   │       ├── FolderGrid.jsx        # Grade de pastas com capas
│   │       ├── MemoryCard.jsx        # Card de memória no Feed
│   │       ├── MemoryGridItem.jsx    # Item da galeria em grade
│   │       ├── LazyImage.jsx         # Imagem com carregamento lazy
│   │       ├── GalleryImportCard.jsx # Card de importação da galeria
│   │       ├── BackupBanner.jsx      # Banner de status do backup
│   │       ├── QuickAction.jsx       # Botão de ação rápida
│   │       ├── YearBlock.jsx         # Bloco anual na linha do tempo
│   │       └── PrivacyRow.jsx        # Linha de configuração de privacidade
│   ├── contexts/
│   │   └── AuthContext.jsx           # Autenticação Firebase (login, signup, logout)
│   ├── db/
│   │   └── database.js               # Dexie.js — schemas v1-v7, helpers, pastas padrão
│   ├── services/
│   │   ├── memoriesService.js        # CRUD de memórias no Firestore + blobs locais
│   │   ├── cloudBackupService.js     # Backup incremental na nuvem
│   │   ├── backupService.js          # Backup local / exportação
│   │   ├── autoSyncService.js        # Sincronização automática em background
│   │   ├── exportService.js          # Exportação ZIP de memórias
│   │   ├── importService.js          # Importação da galeria do dispositivo
│   │   ├── profileService.js         # Operações de perfil no Firestore
│   │   ├── planService.js            # Planos e limites de armazenamento
│   │   ├── iapService.js             # In-app purchases (Capacitor)
│   │   ├── cryptoService.js          # Criptografia para pasta Trancados
│   │   └── usersService.js           # Busca e compartilhamento entre usuários
│   ├── hooks/
│   │   ├── useMemories.js            # Hook de CRUD + importação em massa
│   │   └── useExport.js              # Hook de exportação ZIP
│   ├── utils/
│   │   └── imageCompressor.js        # Compressão de imagens antes do upload
│   ├── firebase.js                   # Configuração Firebase (Auth + Firestore + Storage)
│   ├── App.jsx                       # Shell principal, roteamento de abas, splash
│   └── main.jsx                      # Entry point
├── public/
│   └── icons/                        # Ícones SVG do app + capas PNG das pastas
├── index.html
├── vite.config.js
└── package.json
```

---

## Como Rodar

**Pré-requisitos:** Node.js 18+

```bash
npm install
npm run dev
```

Abra: `http://localhost:5173`

**Build de produção:**
```bash
npm run build
```

---

## Navegação — Abas Principais

A navegação é feita pela barra inferior com 4 abas + botão FAB central:

| Aba | Ícone | Descrição |
|-----|-------|-----------|
| **Hoje** | Casa | Resumo do dia, armazenamento, memórias recentes, ações rápidas |
| **Feed** | Config | Posts de texto estilo rede social |
| **Memórias** | Relógio | Galeria completa, pastas, lixeira |
| **Perfil** | Pessoa | Conta, backup, segurança, aparência |
| **＋ FAB** | Botão central laranja | Abre modal de nova memória |

Clicar na aba já ativa volta ao topo automaticamente.

---

## Telas e Funcionalidades

### Splash Screen (LoadingScreen)
- Tela escura com logo centralizada animada
- Aparece no carregamento inicial do app
- Aparece após login bem-sucedido
- Aparece na primeira visita às abas Feed e Memórias

### Login / Cadastro
- Login com e-mail e senha via Firebase Auth
- Cadastro com nome, username e data de nascimento
- Recuperação de senha
- Tela de boas-vindas (WelcomeScreen) para novos usuários

### Aba Hoje (HojeScreen)
- **Card de Armazenamento:** exibe espaço usado vs. total (lê blobs reais do IndexedDB), barra de progresso colorida, botão de upgrade para plano premium
- **Carrossel de Memórias Recentes:** scroll horizontal das 10 últimas memórias com thumbnail, toque abre o viewer completo
- **Ações Rápidas:** 4 botões — Foto/Vídeo, Escrever (texto), Áudio, Importar Galeria
- **Importação da Galeria:** abre seleção de fotos do dispositivo via Capacitor Camera

### Aba Feed (FeedScreen)
- Posts de texto com título e descrição estilo Instagram/Facebook
- Descrições com estilo visual destacado (fundo verde suave, borda lateral)
- Compor novo post com título + descrição
- Curtir posts (salvo localmente)
- Abas internas: Todos / Curtidos
- Filtro por período (data de / data até)
- Compartilhar memórias com outros usuários cadastrados
- Receber posts compartilhados por outros usuários
- Viewer de post com foto/vídeo em fullscreen, exibe descrição, data, título
- Carregamento instantâneo (pré-montado, sem skeleton de carregamento)

### Aba Memórias (TempoScreen)

**Sub-abas:**
- **Galeria** — grade de fotos/vídeos/áudios/textos
- **Pastas** — organização por pastas com capas
- **Lixeira** — memórias excluídas (restaurar ou excluir definitivamente)

**Galeria:**
- Grade de miniaturas organizada por ano, mês e dia
- Filtros por tipo: Foto, Vídeo, Áudio, Texto, Destaques
- Busca por texto livre (título, descrição, tags)
- Viewer fullscreen com swipe entre memórias
- Marcar como Destaque (estrela) dentro do viewer
- Compartilhar memória com outro usuário

**Seleção em massa (drag-to-select estilo iOS/Google Photos):**
- Segurar photo por 500ms ativa o modo seleção
- Arrastar seleciona todas as fotos no intervalo (range selection)
- Auto-scroll ao chegar nas bordas da tela durante o drag
- Barra de ações centralizada: contador de selecionados, Mover, Trancar, Excluir, Cancelar
- Mover: escolhe pasta destino (sem duplicar — usa array `folderIds`)
- Trancar: move para pasta Trancados
- Excluir: envia para lixeira

**Pastas:**
- Grade com capa de foto personalizada por pasta (400×300px em `/icons/capa-{nome}.png`)
- Nome e contagem exibidos acima da capa
- Abre lista de memórias da pasta ao tocar
- Pastas fixas criadas automaticamente no primeiro acesso

**Pastas disponíveis:**

| Pasta | Tipo | Descrição |
|-------|------|-----------|
| Favoritos | Sistema | Memórias marcadas como Destaque |
| Família | Usuário | Pasta manual |
| Viagens | Usuário | Pasta manual |
| Amigos | Usuário | Pasta manual |
| Trabalho | Usuário | Pasta manual |
| Comida | Automática | Memórias com tag `comida` |
| Pets | Automática | Memórias com tag `pets` |
| Festa | Automática | Memórias com tag `festa` |
| Natureza | Automática | Memórias com tag `natureza` |
| Selfies | Automática | Memórias com tag `selfie` |
| Trancados | Sistema | Protegida por PIN |
| Nova Pasta | Ação | Cria pasta personalizada |

**Pasta Trancados:**
- Acesso protegido por PIN numérico configurado pelo usuário
- PIN armazenado localmente com hash
- Modal de desbloqueio ao tentar abrir

**Lixeira:**
- Lista memórias excluídas
- Restaurar memória individualmente
- Excluir definitivamente

### Aba Perfil (PerfilScreen)

**Header do Perfil:**
- Foto de avatar (editável)
- Nome de exibição e bio
- Estatísticas: total de fotos, vídeos, áudios, posts
- Botão Editar Perfil

**Segurança:**
- Alterar e-mail da conta
- Alterar senha
- Configurar PIN para pasta Trancados

**Backup:**
- Ativar/desativar backup automático na nuvem (Firebase Storage)
- Progresso do backup em tempo real
- Logs detalhados do backup
- Restauração de backup anterior

**Importação da Galeria:**
- Card dedicado para importar fotos/vídeos do dispositivo em massa
- Controle de quais arquivos já foram importados (evita duplicatas via `gallerySynced`)

**Aparência:**
- Seleção de tema: Escuro / Claro / Sistema

---

## Modal de Nova Memória (AddMemoryModal)

Aberto pelo botão FAB central ou pelos atalhos rápidos.

- Seleção de tipo: Foto, Vídeo, Áudio, Texto
- Captura via câmera ou seleção da galeria (Capacitor Camera)
- Compressão automática de imagens antes do upload
- Formulário: título, data, descrição, pasta de destino
- Tags automáticas para classificação em pastas automáticas
- Geração de thumbnail automática
- Salvamento no IndexedDB (blob local) + metadados no Firestore

---

## Banco de Dados (Dexie.js / IndexedDB)

Versão atual: **v7**

| Tabela | Descrição |
|--------|-----------|
| `memories` | Fotos, vídeos, áudios e textos com metadados, tags, folderIds |
| `folders` | Pastas do usuário (manuais) com uid, ordem e tipo |
| `fileBlobs` | Blobs dos arquivos separados das memórias |
| `gallerySynced` | Controle de importação da galeria (evita duplicatas) |
| `profile` | Perfil do usuário principal |
| `family` | Membros do círculo familiar |
| `settings` | Configurações gerais (chave-valor) |
| `reminders` | Lembretes automáticos vinculados a memórias |

**Sistema de pastas no schema:**
- `memories.folderId` — pasta única (legado, mantido para retrocompatibilidade)
- `memories.folderIds[]` — array multi-pasta (atual), indexado com `*folderIds`
- `memories.tags[]` — tags para classificação automática nas pastas de IA

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| UI | React 18 + Vite |
| Estilização | CSS Modules + variáveis CSS globais |
| Banco local | Dexie.js (IndexedDB) v4 |
| Autenticação | Firebase Auth |
| Banco na nuvem | Firebase Firestore |
| Armazenamento na nuvem | Firebase Storage |
| Exportação | JSZip |
| App nativo | Capacitor 6 (iOS + Android) |
| Câmera / Galeria | @capacitor/camera |
| Fontes | Lora + Nunito (Google Fonts) |
| Toasts | react-hot-toast |
| Datas | date-fns + date-fns-tz |

---

## Paleta de Cores

| Variável CSS | Hex | Uso |
|---|---|---|
| `--verde` | `#4F7C52` | Cor primária, botões principais |
| `--verde-suave` | `#6E9B72` | Hover, secundário |
| `--laranja` | `#FF6B35` | FAB, destaques, ícones |
| `--bege` | `#F8F4EB` | Fundo principal |
| `--bege-claro` | `#2A2520` | Cards (tema escuro) |
| `--cinza` | `#5C574D` | Texto principal |
| `--cinza-suave` | `#8C8577` | Texto secundário |

---

## Capas das Pastas

Cada pasta pode ter uma capa personalizada colocada em `public/icons/`:

| Arquivo | Pasta |
|---------|-------|
| `capa-favoritos.png` | Favoritos |
| `capa-familia.png` | Família |
| `capa-viagens.png` | Viagens |
| `capa-amigos.png` | Amigos |
| `capa-trabalho.png` | Trabalho |
| `capa-trancados.png` | Trancados |
| `capa-comida.png` | Comida |
| `capa-pets.png` | Pets |
| `capa-festa.png` | Festa |
| `capa-natureza.png` | Natureza |
| `capa-selfies.png` | Selfies |

**Tamanho:** 400 × 300 px (proporção 4:3). Se o arquivo não existir, exibe o ícone SVG como fallback.

---

## Privacidade e Segurança

- Todos os blobs (fotos, vídeos, áudios) ficam armazenados **localmente** no dispositivo via IndexedDB
- Metadados sincronizados com Firebase Firestore (somente quando logado)
- Backup na nuvem é **opcional** e controlado pelo usuário
- Pasta Trancados protegida por PIN com hash local
- Exportação ZIP permite portabilidade total dos dados

---

*Feito com atenção aos detalhes para que cada memória seja preservada.*
