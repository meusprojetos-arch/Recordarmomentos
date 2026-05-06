# Como empacotar o Recordar

Tudo ja esta configurado. Voce so precisa executar os comandos abaixo.

---

## Android (gerar APK)

### 1. Abra o Android Studio:

```
npx cap open android
```

### 2. No Android Studio:

- Espere o Gradle sincronizar (pode demorar na primeira vez)
- Menu: **Build > Generate Signed Bundle / APK**
- Escolha **APK**
- Crie uma keystore (so na primeira vez): preencha senha e dados
- Clique em **Next** > escolha **release** > **Create**
- O APK vai estar em: `android/app/release/app-release.apk`

### Para instalar direto no celular (sem publicar):

- Conecte o celular via USB com depuracao USB ativa
- No Android Studio clique no botao Play (triangulo verde)

---

## iOS (precisa de Mac)

### 1. Abra o Xcode:

```
npx cap open ios
```

### 2. No Xcode:

- Selecione o dispositivo ou simulador
- **Product > Archive** (para gerar o build de publicacao)
- Precisa de conta Apple Developer ($99/ano)

---

## Apos alterar o codigo

Sempre que mexer no codigo, rode:

```
npm run build && npx cap sync
```

Depois abra o Android Studio ou Xcode novamente.

---

## Resumo de comandos

| Comando | O que faz |
|---------|-----------|
| `npm run build` | Gera build de producao |
| `npx cap sync` | Copia build para Android/iOS |
| `npx cap open android` | Abre Android Studio |
| `npx cap open ios` | Abre Xcode |

---

## Requisitos

- **Android**: Android Studio instalado (https://developer.android.com/studio)
- **iOS**: Mac com Xcode (nao funciona no Windows)
- **Publicar**: Google Play ($25 unica vez) / App Store ($99/ano)
