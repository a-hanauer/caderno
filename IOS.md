# Caderno no iPhone (app nativo com Capacitor)

O código do app é o mesmo do site (raiz deste repositório). O comando `npm run build`
copia esses arquivos para `www/`, e o Capacitor embute `www/` no projeto do Xcode.

## Primeira vez (no Mac)

Precisa: Xcode 26 ou mais novo, Node.js 20+ (`brew install node`) e a sua conta de desenvolvedor no Xcode
(Xcode › Settings › Accounts).

```sh
git clone https://github.com/a-hanauer/caderno.git
cd caderno
git checkout app-ios
npm install
npm run ios:add     # cria a pasta ios/ (Swift Package Manager, sem CocoaPods), ajusta o Info.plist, ícone e tela de abertura
npm run ios:open    # abre o projeto no Xcode
```

No Xcode, alvo **App**:

1. **Signing & Capabilities**: marque *Automatically manage signing* e escolha o seu Team.
   O Bundle Identifier é `com.andrehanauer.caderno` (troque aqui e em `capacitor.config.json` se quiser outro;
   depois de publicar não dá mais para mudar).
2. **General › Minimum Deployments**: iOS 15.0 (ou mais, se preferir).
3. Escolha o seu iPhone (pelo cabo) ou um simulador e aperte ▶︎.

Na primeira vez no iPhone: Ajustes › Privacidade e Segurança › Modo de Desenvolvedor (ligar)
e, se pedir, confiar no seu certificado em Ajustes › Geral › VPN e Gerenciamento de Dispositivos.

Depois de criar a pasta `ios/`, faça commit dela (o `.gitignore` já deixa de fora o que é gerado).

## Depois de mudar o código web

```sh
npm run ios:sync    # copia o site para o app; depois ▶︎ no Xcode
```

## Enviar para o TestFlight

1. App Store Connect › Apps › + › Novo app: iOS, nome, Português (Brasil), Bundle ID `com.andrehanauer.caderno`, SKU `caderno-001`.
2. No Xcode: General › Version `1.0` e Build `1` (suba o Build a cada envio).
3. Destino **Any iOS Device (arm64)** › Product › Archive.
4. Organizer › Distribute App › App Store Connect › Upload.
5. Quando o build aparecer processado na aba TestFlight: adicione-se ao teste interno e instale pelo app TestFlight.

A pergunta de criptografia não aparece porque o `Info.plist` já declara `ITSAppUsesNonExemptEncryption = NO`.
