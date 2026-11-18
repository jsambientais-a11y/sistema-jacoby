#!/bin/zsh
# Prepara o app mobile da Jacoby e abre o projeto do iPhone no Xcode.
cd "$(dirname "$0")" || exit 1
echo "1/3 Instalando dependências (só demora na primeira vez)..."
npm install || { echo "Falhou o npm install"; read -k 1; exit 1; }
echo "2/3 Gerando a versão do app..."
npm run build:app || { echo "Falhou o build do app"; read -k 1; exit 1; }
echo "3/3 Abrindo no Xcode..."
npx cap open ios
echo
echo "Pronto. No Xcode: escolha seu iPhone (ou um simulador) no topo e clique em ▶."
read -k 1 "?Pressione qualquer tecla para fechar..."
