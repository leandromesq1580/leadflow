# Lead4Pro — App nativo (Capacitor) para App Store + Play Store

Este wrapper empacota o app mobile (`https://lead4producers.com/m`) num app nativo
iOS/Android via **Capacitor**. O conteúdo é carregado da web ao vivo (`server.url` no
`capacitor.config.json`) — então **mudanças no app web aparecem no app nativo sem
reenviar pra loja**. Só mudanças nativas (ícone, splash, plugins) exigem novo envio.

> ⚠️ Esta pasta tem só o scaffold (config + deps + guia). As pastas nativas `ios/` e
> `android/` são geradas por você no Mac com `npx cap add` (não estão versionadas).

---

## Pré-requisitos

- **Mac** com **Xcode** (App Store da Apple) — obrigatório pra iOS.
- **Conta Apple Developer** — US$ 99/ano (https://developer.apple.com/programs/).
- **Node 18+** e **CocoaPods** (`sudo gem install cocoapods`).
- Pra Android: **Android Studio** + uma conta **Google Play Console** (US$ 25, taxa única).

## Build iOS (App Store)

```bash
cd native-app
npm install
npx cap add ios
npx cap sync ios
npx cap open ios     # abre o projeto no Xcode
```

No **Xcode**:
1. Selecione o target **App** → aba **Signing & Capabilities** → marque *Automatically manage
   signing* e escolha seu **Team** (sua conta Apple Developer). Bundle ID: `com.lead4pro.app`.
2. Em **Capabilities**, adicione **Push Notifications** (se for usar push nativo).
3. Defina **ícone** (1024×1024) e **splash** (assets em `App/Assets.xcassets`).
4. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. Em **App Store Connect** (https://appstoreconnect.apple.com): crie o app, preencha a
   listagem, screenshots (6.7" e 6.5"), **URL de privacidade** `https://lead4producers.com/privacy`,
   classificação etária, e envie pra revisão.

## Build Android (Play Store)

```bash
cd native-app
npm install
npx cap add android
npx cap sync android
npx cap open android   # abre no Android Studio
```
No Android Studio: **Build → Generate Signed Bundle/APK → Android App Bundle (.aab)**,
crie/escolha a keystore, e suba o `.aab` no **Google Play Console**.

## Atualizar depois

- Mudou só o **app web** (`/m`)? Nada a fazer — o app nativo já carrega a versão nova.
- Mudou **ícone/splash/plugins/config**? Rode `npx cap sync` e reenvie pra loja.

---

## ⚠️ Riscos de revisão da Apple (planejar antes de enviar)

1. **Guia 4.2 — funcionalidade mínima:** a Apple rejeita "site embrulhado". Mitigação:
   habilitar **push nativo** (plugin `@capacitor/push-notifications` → token APNs → mandar
   pro `/api/push/subscribe`) e garantir experiência de app (splash, status bar, sem cara de
   navegador). Um CRM com funções reais + push costuma passar, mas não é garantido.
2. **Guia 3.1.1 — In-App Purchase:** 🔴 o app vende **leads e assinatura CRM Pro via Stripe**.
   A Apple pode exigir que venda digital consumida no app use o **pagamento dela (corte ~30%)**.
   Opções: (a) usar IAP no iOS; (b) esconder a compra no app iOS e vender só no site; (c)
   argumentar que é serviço B2B/multiplataforma. **Decidir antes de enviar.**
3. **Guia 5.1.1(v) — exclusão de conta:** ✅ **já implementado** — *Configurações → Excluir
   minha conta* (`POST /api/account/delete`: remove o login + anonimiza o PII).

## Push nativo (passo extra, recomendado pra passar no 4.2)

Adicionar no shell nativo: registrar o token APNs/FCM via `@capacitor/push-notifications` e
enviar pro backend (`/api/push/subscribe`). Hoje o push do PWA é Web Push (VAPID); no app
nativo é APNs (iOS)/FCM (Android) — exige uma APNs Key na conta Apple e ajuste no envio.
Isso é trabalho adicional, fora deste scaffold inicial.
