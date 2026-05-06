# Como subir o Recordar para o GitHub

## O que NAO subir (ja esta no .gitignore)

- `.env` — suas chaves do Firebase (NUNCA suba isso)
- `node_modules/` — dependencias (pesado demais)
- `dist/` — build gerado
- `android/` e `ios/` — builds nativos

## O que sobe

- Todo o codigo fonte (`src/`)
- `package.json` e `package-lock.json`
- `.env.example` (modelo sem as chaves reais)
- `.gitignore`
- Arquivos de config (`vite.config.js`, `index.html`)

---

## Passo a passo

### 1. Crie um repositorio no GitHub

- Va em https://github.com/new
- Nome: `recordar`
- Deixe vazio (sem README, sem .gitignore)
- Clique em "Create repository"

### 2. No terminal, dentro da pasta do projeto:

```bash
cd C:\Users\Admi\Desktop\Recordar

git init
git add .
git commit -m "Primeiro commit - Recordar completo"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/recordar.git
git push -u origin main
```

Troque `SEU_USUARIO` pelo seu nome de usuario do GitHub.

### 3. Se pedir login

O GitHub vai pedir autenticacao. Opcoes:
- Use o GitHub CLI: `gh auth login`
- Ou crie um Personal Access Token em: https://github.com/settings/tokens
  - Marque a permissao `repo`
  - Use o token como senha quando pedir

---

## Variaveis de ambiente (importante!)

Quando alguem clonar o projeto, precisa criar o proprio `.env` baseado no `.env.example`:

```
VITE_FIREBASE_API_KEY=sua_chave
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_FIREBASE_MEASUREMENT_ID=G-XXX
```

---

## Apos fazer alteracoes

```bash
git add .
git commit -m "descricao do que mudou"
git push
```

---

## Resumo

| Arquivo | Sobe? |
|---------|-------|
| `src/` | SIM |
| `package.json` | SIM |
| `.env.example` | SIM |
| `.gitignore` | SIM |
| `.env` | NAO (tem suas chaves) |
| `node_modules/` | NAO |
| `dist/` | NAO |
