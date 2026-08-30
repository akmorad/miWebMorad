// Prompts de terminal y salida con color. Sin dependencias externas a propósito:
// menos superficie de suministro para una herramienta que toca una clave privada.
import readline from 'node:readline';
import { stdin, stdout } from 'node:process';

const useColor = stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  cyan: wrap('36;1'),
  green: wrap('32;1'),
  yellow: wrap('33;1'),
  red: wrap('31;1'),
  dim: wrap('2'),
  bold: wrap('1'),
};

const width = () => Math.min(stdout.columns || 80, 100);

export function banner(title, lines) {
  const w = width();
  const head = ` ${title} `;
  const pad = Math.max(0, w - head.length - 2);
  const left = Math.floor(pad / 2);
  console.log('');
  console.log(c.dim('┌' + '─'.repeat(left)) + c.bold(head) + c.dim('─'.repeat(pad - left) + '┐'));
  for (const line of lines) {
    for (const chunk of softWrap(line, w - 4)) {
      console.log(c.dim('│ ') + chunk.padEnd(w - 4) + c.dim(' │'));
    }
  }
  console.log(c.dim('└' + '─'.repeat(w - 2) + '┘'));
  console.log('');
}

function softWrap(text, max) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > max) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  out.push(line);
  return out;
}

export function section(n, title) {
  console.log(`${c.cyan(`${n}.`)} ${c.bold(title)}`);
}

function rl() {
  return readline.createInterface({ input: stdin, output: stdout });
}

export async function ask(question, { default: def = '' } = {}) {
  const io = rl();
  try {
    const suffix = def ? c.dim(` [${def}]`) : '';
    const answer = await io.question(`${question}${suffix}: `);
    return answer.trim() || def;
  } finally {
    io.close();
  }
}

// Lee sin eco en el terminal. Se usa SOLO para la clave privada y la contraseña.
export async function askSecret(question) {
  if (!stdin.isTTY) throw new Error('Se requiere un TTY interactivo para introducir secretos.');
  stdout.write(`${question}: `);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    // Se acumulan BYTES, no caracteres. Decodificar byte a byte parte en dos
    // cualquier carácter multibyte (ñ, á, emoji…) y produce una contraseña
    // distinta de la que el usuario escribió.
    let bytes = [];
    const done = (fn, value) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdout.write('\n');
      bytes = null;
      fn(value);
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 0x0a || byte === 0x0d) {
          return done(resolve, Buffer.from(bytes).toString('utf8'));
        }
        if (byte === 3) return done(reject, new Error('Cancelado.'));
        if (byte === 127 || byte === 8) {
          popUtf8Char(bytes);
          continue;
        }
        if (byte >= 32) bytes.push(byte);
      }
    };
    stdin.on('data', onData);
  });
}

// Borra un carácter completo del final del buffer. En UTF-8 los bytes de
// continuación son 10xxxxxx (0x80-0xBF), así que hay que retroceder por encima
// de todos ellos antes de quitar el byte inicial.
export function popUtf8Char(bytes) {
  while (bytes.length > 0 && (bytes[bytes.length - 1] & 0xc0) === 0x80) bytes.pop();
  bytes.pop();
  return bytes;
}

export async function choose(title, options) {
  section(title.n, title.text);
  options.forEach((opt, i) => {
    console.log(`  ${c.green(`${i + 1})`)} ${opt.label}`);
  });
  for (;;) {
    const raw = await ask('Pulsa un número');
    const idx = Number.parseInt(raw, 10) - 1;
    if (Number.isInteger(idx) && options[idx]) {
      console.log('');
      return options[idx].value;
    }
    console.log(c.red('  Opción no válida.'));
  }
}

export async function confirm(question) {
  const answer = await ask(`${question} ${c.dim('(y/N)')}`);
  return /^(y|yes|s|si|sí)$/i.test(answer.trim());
}
