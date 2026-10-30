#!/bin/sh
# Ajustes do projeto iOS depois do "npx cap add ios" (rodar no Mac, na raiz do repositório).
set -e
PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
[ -f "$PLIST" ] || { echo "Não achei $PLIST. Rode antes: npx cap add ios"; exit 1; }
set_key() { $PB -c "Delete :$1" "$PLIST" 2>/dev/null || true; $PB -c "Add :$1 $2 $3" "$PLIST"; }
# só HTTPS, sem criptografia própria: dispensa a pergunta de exportação a cada envio
set_key ITSAppUsesNonExemptEncryption bool false
# barra de status com texto claro (os cabeçalhos são coloridos)
set_key UIStatusBarStyle string UIStatusBarStyleLightContent
set_key UIViewControllerBasedStatusBarAppearance bool true
# só retrato, no iPhone
$PB -c "Delete :UISupportedInterfaceOrientations" "$PLIST" 2>/dev/null || true
$PB -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
$PB -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"
$PB -c "Delete :UISupportedInterfaceOrientations~ipad" "$PLIST" 2>/dev/null || true
# app só de iPhone e em tela cheia (evita o aviso "All interface orientations must be supported")
set_key UIRequiresFullScreen bool true
PBX="ios/App/App.xcodeproj/project.pbxproj"
[ -f "$PBX" ] && sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX" && echo "Alvo: só iPhone."
# nome embaixo do ícone
set_key CFBundleDisplayName string Caderno
echo "Info.plist ajustado."

# ícone (1024x1024) e tela de abertura na cor da capa
ICONSET="ios/App/App/Assets.xcassets/AppIcon.appiconset"
if [ -d "$ICONSET" ]; then
  for f in "$ICONSET"/*.png; do cp resources/icon-1024.png "$f"; done
  echo "Ícone copiado."
fi
SPLASH="ios/App/App/Assets.xcassets/Splash.imageset"
if [ -d "$SPLASH" ]; then
  for f in "$SPLASH"/*.png; do cp resources/splash-2732.png "$f"; done
  echo "Tela de abertura copiada."
fi
