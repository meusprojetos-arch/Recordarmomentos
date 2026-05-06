# 🌿 Recordar
**Seu arquivo vivo de memórias pessoais e legado familiar**

---

## ✨ Visão Geral

O **Recordar** é um aplicativo mobile-first de preservação de memórias pessoais.  
Toda a experiência foi desenhada com carinho especial para **idosos e famílias**, com interface simples, botões grandes e navegação intuitiva.

**Princípios do design:**
- Interface extremamente limpa — "um idoso de 70 anos consegue usar sem dificuldade"
- 100% offline primeiro — tudo funciona sem internet
- Paleta acolhedora (verde vida, bege calor, dourado memória)
- Tipografia legível: Lora (serif, emocional) + Nunito (sans, amigável)

---

## 🗂️ Estrutura do Projeto

```
recordar/
├── src/
│   ├── components/
│   │   ├── screens/          # Telas principais
│   │   │   ├── LoadingScreen.jsx   # Tela de abertura
│   │   │   ├── HojeScreen.jsx      # Tela "Hoje"
│   │   │   ├── TempoScreen.jsx     # Linha do Tempo
│   │   │   └── PerfilScreen.jsx    # Perfil + configurações
│   │   ├── layout/           # Componentes estruturais
│   │   │   ├── Navbar.jsx          # Barra inferior + FAB
│   │   │   └── Topbar.jsx          # Barra superior
│   │   ├── modals/           # Modais / bottom sheets
│   │   │   └── AddMemoryModal.jsx  # Modal de nova memória
│   │   └── ui/               # Componentes reutilizáveis
│   │       ├── MemoryCard.jsx      # Card de memória no feed
│   │       ├── QuickAction.jsx     # Botão de ação rápida
│   │       ├── YearBlock.jsx       # Bloco anual na timeline
│   │       ├── PrivacyRow.jsx      # Linha de configuração
│   │       └── FolderGrid.jsx      # Grade de pastas
│   ├── db/
│   │   └── database.js       # Dexie.js — schemas + helpers
│   ├── hooks/
│   │   ├── useMemories.js    # CRUD + importação em massa
│   │   └── useExport.js      # Exportação ZIP
│   ├── styles/
│   │   └── globals.css       # Design system completo
│   ├── App.jsx               # Shell principal + Context
│   └── main.jsx              # Entry point
├── index.html
├── vite.config.js
└── package.json
```

---

## 🚀 Como Rodar

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### Instalar e rodar
```bash
npm install
npm run dev
```

Abra: `http://localhost:5173`

### Build de produção
```bash
npm run build
```

---

## 🗄️ Banco de Dados (Dexie.js / IndexedDB)

Toda a persistência é **100% local** no dispositivo do usuário.

| Tabela      | Descrição                                      |
|-------------|------------------------------------------------|
| `memories`  | Fotos, vídeos, áudios e textos com metadados   |
| `folders`   | Pastas automáticas e personalizadas            |
| `profile`   | Perfil do usuário principal                    |
| `heirs`     | Herdeiros designados (Modo Herança)            |
| `family`    | Membros do Círculo Familiar                    |
| `settings`  | Configurações gerais (chave-valor)             |
| `reminders` | Lembretes de aniversário de memórias           |

---

## 🎨 Paleta "Echo Vida"

| Variável CSS        | Hex       | Uso                          |
|---------------------|-----------|------------------------------|
| `--verde`           | `#4F7C52` | Cor primária, botões, topbar |
| `--verde-suave`     | `#6E9B72` | Hover, secundário            |
| `--bege`            | `#F8F4EB` | Fundo principal              |
| `--dourado`         | `#E8B923` | Destaque emocional, avisos   |
| `--azul`            | `#5A7E9B` | Informativo                  |
| `--cinza`           | `#5C574D` | Texto principal              |
| `--cinza-suave`     | `#8C8577` | Texto secundário             |

---

## 📦 Stack Técnica

| Camada         | Tecnologia                    |
|----------------|-------------------------------|
| UI             | React 18 + Vite               |
| Banco local    | Dexie.js (IndexedDB)          |
| Sincronização  | Yjs (offline-first)           |
| Exportação     | JSZip                         |
| Empacotamento  | Capacitor (próxima etapa)     |
| Fontes         | Lora + Nunito (Google Fonts)  |

---

## 📱 Funcionalidades Implementadas

### Tela Hoje
- [x] Saudação personalizada com hora do dia
- [x] Frase inspiradora aleatória
- [x] Banner de lembrete anual automático
- [x] 4 atalhos rápidos de adição (foto, vídeo, áudio, texto)
- [x] Feed de memórias recentes

### Linha do Tempo
- [x] Grade de fotos organizada por ano
- [x] Filtro por tipo (foto, vídeo, áudio, texto, destaques)
- [x] Busca por texto livre
- [x] Slot de overflow "+N fotos" por ano

### Perfil
- [x] Header com avatar, nome, bio e estatísticas
- [x] Círculo Familiar (adicionar membros)
- [x] Modo Herança — designar herdeiros com nome
- [x] Privacidade (perfil privado, biometria, publicação futura)
- [x] Grade de pastas (auto + personalizadas)
- [x] Exportação ZIP completa
- [x] Toggle de backup na nuvem

### Modal de Nova Memória
- [x] Seleção de tipo (foto, vídeo, áudio, texto)
- [x] Captura via câmera ou galeria
- [x] Geração de thumbnail automática
- [x] Formulário: título, data, descrição, pasta
- [x] Salvamento no IndexedDB

---

## 🔮 Próximas Etapas

- [ ] Empacotamento com **Capacitor** (iOS + Android)
- [ ] Gravação de áudio nativa
- [ ] Importação em massa da galeria do celular
- [ ] Sincronização Yjs entre dispositivos
- [ ] Player de vídeo inline
- [ ] Notificações de lembretes anuais
- [ ] Modo escuro completo
- [ ] Versão leve para Android Go

---

## 🔒 Privacidade

- Todos os dados ficam **no dispositivo do usuário**
- Nenhuma informação é enviada para servidores por padrão
- Backup na nuvem é opcional e controlado pelo usuário
- Exportação ZIP permite portabilidade total dos dados

---

*Feito com 💚 e muita atenção aos detalhes para que cada memória seja preservada para sempre.*
