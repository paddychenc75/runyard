#!/bin/zsh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; nvm use 24 >/dev/null
SC=/private/tmp/claude-501/-Users-fengchen-Desktop-vibe-code/815db63d-d15a-4147-89f8-ffc71e92af22/scratchpad
S=$(cat $SC/vue-spike-dir); cd $S || exit 1
O=$(mktemp -d $S/o.XXXX); echo $O > $SC/vue-spike-out
node build.mjs $O 2>&1 | grep -v "Fake\|^built" 
D=/Users/fengchen/Desktop/vibe-code/runyard-worktrees/vue-intel/apps/desktop
P=$(mktemp -d $SC/vue-pack.XXXX); echo $P > $SC/vue-pack-dir
cp -R $O/index.html $O/main.js $O/main.css $O/*.ttf $O/workers $D/dist/renderer/
cd $D && node pack.ts --dir --e2e --out $P 2>&1 | grep -v Fake | tail -1
