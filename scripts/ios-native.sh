#!/bin/sh
# Copia o código Swift próprio do Caderno (native/ios) para o projeto do Xcode e liga o controlador
# que registra os plugins. Pode rodar quantas vezes quiser (rodar no Mac, na raiz do repositório).
set -e
APPDIR="ios/App/App"
[ -d "$APPDIR" ] || { echo "Não achei $APPDIR. Rode antes: npm run ios:add"; exit 1; }
cp native/ios/*.swift "$APPDIR/"
echo "Arquivos Swift copiados para $APPDIR."

# o storyboard principal passa a usar o CadernoViewController (em vez do CAPBridgeViewController)
SB="$APPDIR/Base.lproj/Main.storyboard"
if [ -f "$SB" ] && ! grep -q 'customClass="CadernoViewController"' "$SB"; then
  sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="CadernoViewController" customModule="App" customModuleProvider="target"/' "$SB"
  echo "Main.storyboard usa o CadernoViewController."
fi

# textos do pedido de acesso à agenda
PLIST="$APPDIR/Info.plist"
PB=/usr/libexec/PlistBuddy
for k in NSCalendarsFullAccessUsageDescription NSCalendarsUsageDescription; do
  $PB -c "Delete :$k" "$PLIST" 2>/dev/null || true
  $PB -c "Add :$k string O Caderno lê a agenda do iPhone para mostrar a casa de cada dia e os compromissos." "$PLIST"
done
echo "Info.plist: textos de acesso à agenda."

# os .swift precisam estar no alvo App do Xcode
if grep -q "CadernoCalendarPlugin.swift" ios/App/App.xcodeproj/project.pbxproj 2>/dev/null || grep -q "PBXFileSystemSynchronizedRootGroup" ios/App/App.xcodeproj/project.pbxproj 2>/dev/null; then
  echo "Pronto."
else
  echo ""
  echo ">>> Falta 1 passo no Xcode: arraste CadernoCalendarPlugin.swift e CadernoViewController.swift"
  echo ">>> da pasta ios/App/App (Finder) para dentro da pasta App, na coluna da esquerda do Xcode,"
  echo ">>> deixando marcado o alvo App. Só precisa fazer isso uma vez."
fi
