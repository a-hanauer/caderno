// Copia o app web (raiz do repositório) para www/, que é a pasta que o Capacitor embute no app iOS.
// O site no GitHub Pages continua servido da raiz, sem mudança.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const OUT = 'www';
const ITEMS = ['index.html', 'css', 'js', 'fonts', 'icons', 'apple-touch-icon-v2.png'];
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const it of ITEMS) if (existsSync(it)) cpSync(it, `${OUT}/${it}`, { recursive: true });
console.log('www/ pronto:', ITEMS.join(', '));
