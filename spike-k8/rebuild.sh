#!/bin/zsh
# usage: rebuild.sh <tag>  -> builds spike renderer, overlays dist/renderer, packs to $P/<tag>
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; nvm use 24 >/dev/null
SC=/private/tmp/claude-501/-Users-fengchen-Desktop-vibe-code/815db63d-d15a-4147-89f8-ffc71e92af22/scratchpad
S=$(cat $SC/k8-dir.txt); P=$(cat $SC/k8-pack.txt); TAG=$1
cd $S || exit 1
O=$(mktemp -d $S/o.XXXXXX); mkdir $O/file $O/data
node build.mjs $O/file file && node build.mjs $O/data dataurl && node mkhtml.mjs $O/file $O/data || exit 1
echo $O > $SC/k8-out.txt
cd /Users/fengchen/Desktop/vibe-code/runyard-worktrees/m252/apps/desktop || exit 1
cp -R $O/file/. dist/renderer/
mkdir -p $P/$TAG && node pack.ts --dir --e2e --out $P/$TAG 2>&1 | tail -2
